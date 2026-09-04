import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileDown,
  Edit2,
  Trash2,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
  CheckCheck,
  Ban,
  PlusCircle,
  Pencil,
  DollarSign,
  Link2,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { InstallmentRow } from '../../../shared/components/installments/InstallmentRow'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { buildAssetLabel } from '../../../shared/utils/assetMetadata'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import { hasModule } from '../../../app/auth/roleScope'
import { documentsApi, documentKeys, documentQueries } from '../../../shared/api/documents.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { DOCUMENT_TYPE_LABELS } from '../../../shared/constants'
import { ROUTES } from '../../../app/routes'
import { DocumentAttachmentsSection } from './DocumentAttachmentsSection'
import { DocumentBalanceSummary } from './components/DocumentBalanceSummary'
import { SendAccountingDocumentEmailAction } from './components/SendAccountingDocumentEmailAction'
import type { DocumentPolicyAllocation, Installment, InstallmentUpdate, TableColumn, RelatedDocSummary, DocumentAuditLog, DocumentAuditLogAction } from '../../../shared/types'

// ── Historial de auditoría ────────────────────────────────────────────────────

type AuditStyle = { dot: string; icon: string; labelCls: string; label: string; Icon: React.ElementType }

const AUDIT_CONFIG: Record<DocumentAuditLogAction, AuditStyle> = {
  CREATE: { Icon: PlusCircle, dot: 'bg-brand-50', icon: 'text-brand-500', labelCls: 'text-brand-600', label: 'Creación' },
  UPDATE: { Icon: Pencil, dot: 'bg-slate-100', icon: 'text-slate-400', labelCls: 'text-slate-500', label: 'Edición' },
  APPLY: { Icon: CheckCheck, dot: 'bg-emerald-50', icon: 'text-emerald-500', labelCls: 'text-emerald-600', label: 'Aplicación' },
  CANCEL: { Icon: Ban, dot: 'bg-red-50', icon: 'text-red-500', labelCls: 'text-red-600', label: 'Anulación' },
  PAYMENT_CHANGE: { Icon: DollarSign, dot: 'bg-violet-50', icon: 'text-violet-500', labelCls: 'text-violet-600', label: 'Pago' },
}

function AuditLogRow({ entry, isLast }: { entry: DocumentAuditLog; isLast: boolean }) {
  const cfg = AUDIT_CONFIG[entry.action] ?? AUDIT_CONFIG.UPDATE
  const Icon = cfg.Icon
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border border-white ring-1 ring-slate-100 ${cfg.dot}`}>
          <Icon size={13} className={cfg.icon} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-100 mt-1 mb-1" />}
      </div>
      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-5'} pt-0.5`}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.labelCls}`}>
            {cfg.label}
          </span>
          <span className="text-[11px] text-slate-400 whitespace-nowrap tabular-nums flex-shrink-0">
            {formatDate(entry.createdAt)}
          </span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{entry.description}</p>
        {entry.reason && (
          <p className="mt-1 text-xs text-slate-500 italic">Motivo: {entry.reason}</p>
        )}
        {entry.performedBy && (
          <p className="mt-1 text-[11px] text-slate-400">{entry.performedBy}</p>
        )}
      </div>
    </div>
  )
}

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [applyConfirmOpen, setApplyConfirmOpen] = useState(false)
  const [applying, setApplying] = useState(false)
  const [cancelDocConfirmOpen, setCancelDocConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const { user } = useCurrentUser()

  // Solo se usa para resolver número de póliza/aseguradora (etiquetas) dentro
  // de la tabla de distribución — sin el módulo, ni se pide ni se muestran
  // esas columnas (la distribución en sí sigue siendo de Documentos).
  const canPolicies = hasModule(user, 'policies')
  const canAssets = hasModule(user, 'assets')

  const { data: doc, isLoading: docLoading } = useQuery(documentQueries.detail(id!))

  const { data: allPolicies = [] } = useQuery({ ...policyQueries.list(), enabled: canPolicies })

  const { data: documentTypesData } = useQuery(documentQueries.types())

  const { data: balance } = useQuery(documentQueries.balance(id!))

  const { data: allocations = [] } = useQuery(documentQueries.allocations(id!))
  // Una póliza puede repetirse en varias filas (una por cada activo que
  // cubre) — el conteo real de pólizas distintas es este, no allocations.length.
  const distinctAllocatedPolicyCount = new Set(allocations.map((a) => a.policyId)).size

  const { data: auditLog = [] } = useQuery(documentQueries.auditLog(id!))

  // Sin default `= []` a propósito: mientras carga, data es `undefined` (valor
  // estable), no un array nuevo en cada render — evita un loop de renders en
  // el efecto de abajo.
  const { data: fetchedInstallments } = useQuery(documentQueries.installments(id!))

  const [installments, setInstallments] = useState<Installment[]>([])
  const [syncedFetchedInstallments, setSyncedFetchedInstallments] = useState<typeof fetchedInstallments>(undefined)

  // Sincroniza en cuanto la query resuelve (o vuelve a resolver, ej. tras
  // invalidar por un cambio de cuota), incluso a array vacío — de lo
  // contrario, al navegar de un documento con cuotas a otro sin cuotas (ej.
  // desde "Documentos relacionados") quedan pegadas en pantalla las cuotas del
  // documento anterior, porque el componente no se desmonta entre
  // navegaciones (misma ruta con distinto :id). Ajuste de estado durante el
  // render (patrón oficial de React para esto) en vez de un efecto — evita
  // el round-trip de un render extra y sigue resincronizando ante cualquier
  // refetch posterior, no solo al cambiar de documento.
  if (fetchedInstallments && fetchedInstallments !== syncedFetchedInstallments) {
    setSyncedFetchedInstallments(fetchedInstallments)
    setInstallments(
      fetchedInstallments.map((i) => ({
        id: i.id,
        accountingDocumentId: i.accountingDocumentId,
        installmentNumber: i.installmentNumber,
        dueDate: i.dueDate,
        amount: i.amount,
        currency: i.currency as Installment['currency'],
        amountArs: i.amountArs,
        amountUsd: i.amountUsd,
        paymentStatus: i.paymentStatus as Installment['paymentStatus'],
        paidAt: i.paidAt,
        paymentMethod: i.paymentMethod,
      })),
    )
  }

  if (docLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageContent>
    )
  }

  if (!doc) {
    return (
      <PageContent>
        <EmptyState
          title="Documento no encontrado"
          description="El documento solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  const today = new Date().toISOString().slice(0, 10)
  const computedTotal = doc.netAmount + doc.vatAmount + doc.otherTaxesAmount

  const paidCount = installments.filter((i) => i.paymentStatus === 'PAID').length
  const pendingCount = installments.filter((i) => i.paymentStatus === 'PENDING').length
  const partialCount = installments.filter((i) => i.paymentStatus === 'PARTIALLY_PAID').length

  // Suma cruda de cuotas no pagadas — deliberadamente no usa balance.outstandingBalance,
  // que ya viene neteado por Notas de Crédito/Débito/Ajustes (ese número vive en la
  // tarjeta "Saldo", con su propio desglose para que se entienda de dónde sale).
  const cuotasPendientes = installments
    .filter((i) => i.paymentStatus !== 'PAID')
    .reduce((sum, i) => sum + Math.abs(i.amount), 0)

  const derivedDocStatus: string =
    installments.length > 0 && installments.every((i) => i.paymentStatus === 'PAID')
      ? 'PAID'
      : installments.some((i) => i.paymentStatus === 'PAID' || i.paymentStatus === 'PARTIALLY_PAID')
        ? 'PARTIALLY_PAID'
        : doc.paymentStatus

  const typeDef = documentTypesData?.types.find((t) => t.key === doc.documentType)
  // Una Nota de Débito sin factura vinculada funciona como documento propio —
  // "aplicar" no tiene efecto real porque nunca entra en el relatedDocs de
  // otro documento, así que no tiene sentido ofrecer el botón.
  const canApply =
    doc.documentStatus === 'ISSUED' &&
    !!typeDef?.documentStatusOptions.includes('APPLIED') &&
    (doc.documentType !== 'DEBIT_NOTE' || !!doc.linkedDocumentId)
  const canCancel = doc.documentStatus !== 'CANCELLED'
  const hasOwnAmounts = typeDef?.hasOwnAmounts ?? true
  // Distinto de hasOwnAmounts: NC/ND/Ajuste/Endoso tienen importe propio pero
  // ninguno tiene cuotas propias — modifican directamente las de la Factura
  // vinculada al aplicarse. Solo la Factura tiene hasInstallments true.
  const hasInstallments = typeDef?.hasInstallments ?? true
  const linkedDocBadgeLabel = doc.relationType === 'ENDORSES' ? 'Respalda impacto económico' : 'Aplicado a'

  function invalidateAfterStatusChange() {
    queryClient.invalidateQueries({ queryKey: documentKeys.detail(id!) })
    queryClient.invalidateQueries({ queryKey: documentKeys.balance(id!) })
    queryClient.invalidateQueries({ queryKey: documentKeys.auditLog(id!) })
    queryClient.invalidateQueries({ queryKey: documentKeys.all })
    // Aplicar/cancelar un documento afecta los totales agregados de Análisis
    // Económico/Financiero — sin esto quedaban stale hasta que expirara el staleTime.
    queryClient.invalidateQueries({ queryKey: documentKeys.financial() })
    if (doc?.linkedDocumentId) {
      queryClient.invalidateQueries({ queryKey: documentKeys.balance(doc.linkedDocumentId) })
      // Aplicar/cancelar una NC/ND/Ajuste reparte su monto entre las cuotas
      // de la factura vinculada (ver documents.service.ts) — hay que refrescar
      // sus cuotas y su detalle, no solo su "saldo".
      queryClient.invalidateQueries({ queryKey: documentKeys.installments(doc.linkedDocumentId) })
      queryClient.invalidateQueries({ queryKey: documentKeys.detail(doc.linkedDocumentId) })
    }
  }

  async function handleApply() {
    setApplying(true)
    try {
      await documentsApi.apply(doc!.id)
      invalidateAfterStatusChange()
      setApplyConfirmOpen(false)
    } catch {
      // El interceptor global de apiClient ya muestra el error con un toast
    } finally {
      setApplying(false)
    }
  }

  async function handleCancelDocument() {
    setCancelling(true)
    try {
      await documentsApi.cancel(doc!.id, cancelReason.trim() || undefined)
      setCancelReason('')
      invalidateAfterStatusChange()
      setCancelDocConfirmOpen(false)
    } catch {
      // El interceptor global de apiClient ya muestra el error con un toast
    } finally {
      setCancelling(false)
    }
  }

  async function handleInstallmentUpdate(instId: string, updates: InstallmentUpdate) {
    setInstallments((prev) =>
      prev.map((i) => (i.id === instId ? { ...i, ...updates } : i))
    )
    try {
      await documentsApi.updateInstallment(doc!.id, instId, updates)
    } finally {
      queryClient.invalidateQueries({ queryKey: documentKeys.installments(id!) })
      queryClient.invalidateQueries({ queryKey: documentKeys.balance(id!) })
      // Cambiar el estado de pago de una cuota también afecta los agregados
      // de Análisis Económico/Financiero.
      queryClient.invalidateQueries({ queryKey: documentKeys.financial() })
      // documentKeys.all por prefijo cubre además el detail de este documento
      // y su entrada en la lista — sin esto, DocumentsPage (columna "Estado
      // Pago") y cualquier card basada en documentQueries.list() quedaban con
      // el estado viejo hasta que expirara su staleTime.
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    }
  }

  const allocationColumns: TableColumn<DocumentPolicyAllocation>[] = [
    // Sin el módulo Pólizas no se piden ni se muestran estas dos columnas —
    // mostrar el policyId crudo (un UUID) en su lugar quedaría roto/poco
    // profesional, así que directamente se omiten.
    ...(canPolicies ? [{
      id: 'policyNumber',
      key: 'policyId',
      label: 'N° Póliza',
      sortable: true,
      sortValue: (row: DocumentPolicyAllocation) => allPolicies.find((p) => p.id === row.policyId)?.policyNumber,
      render: (v: unknown) => {
        const policy = allPolicies.find((p) => p.id === (v as string))
        return (
          <span className="font-mono text-xs text-brand-600 hover:text-brand-700 hover:underline">
            {policy?.policyNumber ?? (v as string)}
          </span>
        )
      },
    } satisfies TableColumn<DocumentPolicyAllocation>] : []),
    {
      id: 'asset',
      key: 'assetId',
      label: 'Activo',
      sortable: true,
      // Una póliza puede cubrir varios activos — cada fila es una línea de
      // cobertura (un activo), no una póliza distinta. Sin esta columna, dos
      // líneas de la MISMA póliza se veían como "2 pólizas" repetidas.
      sortValue: (row) => row.asset?.name ?? '',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          {row.asset ? buildAssetLabel(row.asset) : 'Sin activo asociado'}
          {row.asset && canAssets && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/assets/${row.asset!.id}`) }}
              title="Ver activo"
              aria-label="Ver activo"
              className="text-slate-400 hover:text-brand-600 transition-colors flex-shrink-0"
            >
              <Link2 size={12} />
            </button>
          )}
        </span>
      ),
    },
    ...(canPolicies ? [{
      id: 'insuranceCompany',
      key: 'policyId',
      label: 'Aseguradora',
      sortable: true,
      sortValue: (row: DocumentPolicyAllocation) => allPolicies.find((p) => p.id === row.policyId)?.insuranceCompany,
      render: (v: unknown) => {
        const policy = allPolicies.find((p) => p.id === (v as string))
        return <span className="text-xs text-slate-600">{policy?.insuranceCompany ?? '—'}</span>
      },
    } satisfies TableColumn<DocumentPolicyAllocation>] : []),
    {
      key: 'allocatedAmount',
      label: 'Importe Asignado',
      sortable: true,
      render: (v) => (
        <span className={`tabular-nums font-semibold text-sm ${(v as number) < 0 ? 'text-red-600' : 'text-slate-800'}`}>
          {formatCurrencyFull(v as number, doc.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'allocationPercentage',
      label: 'Participación',
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full"
              style={{ width: `${Math.min(Math.abs(v as number), 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-xs font-semibold text-brand-700 w-12 text-right">
            {(v as number).toFixed(1).replace('.', ',')}%
          </span>
        </div>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title={doc.documentNumber}
        subtitle={`Emisión: ${formatDate(doc.issueDate)} · Moneda: ${doc.currency}${doc.currency === 'USD' ? ` · TC: $${doc.exchangeRate.toLocaleString('es-AR')}` : ''}`}
        category="Documento"
        backTo="/insurance/documents"
        backLabel="Volver a documentos"
        badge={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
              {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            </span>
            <StatusPill status={doc.documentStatus} />
            {typeDef?.hasPaymentStatus && <StatusPill status={derivedDocStatus} />}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <SendAccountingDocumentEmailAction documentId={doc.id} />
            <button
              onClick={() => navigate(ROUTES.DOCUMENTS_EDIT(doc.id))}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Edit2 size={15} />
              Editar
            </button>
            <button
              onClick={() => navigate(`/insurance/documents/${doc.id}/ficha`)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <FileDown size={15} />
              Ficha PDF
            </button>
            {canApply && (
              <button
                onClick={() => setApplyConfirmOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <CheckCheck size={15} />
                Aplicar documento
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setCancelDocConfirmOpen(true)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
              >
                <Ban size={15} />
                Cancelar documento
              </button>
            )}
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50">
                <span className="text-xs font-medium text-red-700">¿Eliminar documento?</span>
                <button
                  onClick={async () => {
                    await documentsApi.softDelete(doc.id)
                    queryClient.invalidateQueries({ queryKey: documentKeys.all })
                    navigate('/insurance/documents')
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded-md transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            )}
          </div>
        }
      />

      {/* KPI row: amounts — un Endoso sin impacto económico también tiene
          hasOwnAmounts true, pero sus importes quedan en 0 (el backend no
          permite cargarle importe sin impacto económico real). */}
      {hasOwnAmounts && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Neto</p>
          <p className="text-base font-bold text-slate-900 tabular-nums truncate">
            {formatCurrencyCompact(doc.netAmount, doc.currency)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(doc.netAmount, doc.currency)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">IVA</p>
          <p className="text-base font-bold text-slate-900 tabular-nums truncate">
            {formatCurrencyCompact(doc.vatAmount, doc.currency)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(doc.vatAmount, doc.currency)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Otros Imp.</p>
          <p className="text-base font-bold text-slate-900 tabular-nums truncate">
            {formatCurrencyCompact(doc.otherTaxesAmount, doc.currency)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(doc.otherTaxesAmount, doc.currency)}
          </p>
        </div>
        <div className="card p-4 border-brand-200 bg-brand-50/30">
          <p className="text-xs font-medium text-brand-500 uppercase tracking-wider mb-1">Total</p>
          <p className="text-lg font-extrabold text-brand-700 tabular-nums truncate">
            {formatCurrencyCompact(computedTotal, doc.currency)}
          </p>
          <p className="text-xs text-brand-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(computedTotal, doc.currency)}
          </p>
        </div>
      </div>

      {/* Formula note */}
      <div className="mb-5 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg inline-flex items-center gap-2 text-xs text-slate-500">
        <Receipt size={13} className="text-slate-400 flex-shrink-0" />
        <span>
          <strong className="text-slate-700">Total</strong> = Neto + IVA + Otros Impuestos
          &nbsp;=&nbsp;
          {formatCurrencyFull(doc.netAmount, doc.currency)}
          &nbsp;+&nbsp;
          {formatCurrencyFull(doc.vatAmount, doc.currency)}
          &nbsp;+&nbsp;
          {formatCurrencyFull(doc.otherTaxesAmount, doc.currency)}
          &nbsp;=&nbsp;
          <strong className="text-slate-800">{formatCurrencyFull(computedTotal, doc.currency)}</strong>
        </span>
      </div>

      </>
      )}

      {/* Payment summary pills — solo la Factura tiene cuotas propias */}
      {hasInstallments && (
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
          <CheckCircle2 size={13} />
          {paidCount} cuota{paidCount !== 1 ? 's' : ''} pagada{paidCount !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 font-medium">
          <Clock size={13} />
          {pendingCount} cuota{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
        </div>
        {partialCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
            <AlertCircle size={13} />
            {partialCount} cuota{partialCount !== 1 ? 'es' : ''}  parcial{partialCount !== 1 ? 'es' : ''}
          </div>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {installments.length} cuota{installments.length !== 1 ? 's' : ''} en total
        </span>
      </div>
      )}

      {/* Detalle de Endoso — datos administrativos (póliza, tipo, vigencia);
          el importe/distribución con impacto económico se muestra abajo,
          igual que en NC/ND/Ajuste. */}
      {doc.documentType === 'ENDORSEMENT' && (
        <SectionCard title="Detalle del Endoso" className="mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Póliza Asociada</p>
              {!doc.policyId ? (
                <span className="text-slate-400">—</span>
              ) : canPolicies ? (
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.POLICIES_DETAIL(doc.policyId!))}
                  className="font-mono text-sm text-brand-600 hover:text-brand-700 hover:underline"
                >
                  {allPolicies.find((p) => p.id === doc.policyId)?.policyNumber ?? doc.policyId}
                </button>
              ) : (
                <span className="text-slate-400 text-sm">Sin acceso al módulo Pólizas</span>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Tipo de Endoso</p>
              <p className="text-slate-800 font-medium">
                {documentTypesData?.endorsementTypes.find((t) => t.key === doc.endorsementType)?.label ?? doc.endorsementType ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Fecha de Vigencia</p>
              <p className="text-slate-800 font-medium">
                {doc.endorsementEffectiveDate ? formatDate(doc.endorsementEffectiveDate) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Impacto Económico</p>
              <p className="text-slate-800 font-medium">
                {documentTypesData?.economicImpactTypes.find((t) => t.key === doc.economicImpactType)?.label ?? doc.economicImpactType ?? '—'}
              </p>
            </div>
            {doc.description && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Descripción / Motivo</p>
                <p className="text-slate-700">{doc.description}</p>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      {/* 2-column: Allocations + Installments. El Endoso con impacto económico
          ya tiene allocations reales (distribución por activo) igual que
          NC/ND/Ajuste, así que esta grilla también aplica para ese tipo —
          su póliza "administrativa" sigue mostrándose aparte, arriba, en
          "Detalle del Endoso". */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* LEFT: Policies */}
        <SectionCard
          title="Distribución por Activo"
          subtitle={`${allocations.length} activo${allocations.length !== 1 ? 's' : ''} en ${distinctAllocatedPolicyCount} póliza${distinctAllocatedPolicyCount !== 1 ? 's' : ''}`}
          noPadding
        >
          <DataTable
            tableKey="document-detail-allocations"
            columns={allocationColumns}
            data={allocations}
            rowKey="id"
            onRowClick={(row) => navigate(ROUTES.POLICIES_DETAIL(row.policyId))}
            emptyTitle="Sin distribución"
            emptyDescription="Este documento no tiene una distribución por activo cargada."
          />
        </SectionCard>

        {/* RIGHT: Installments — solo la Factura tiene cuotas propias */}
        {hasInstallments && (
        <SectionCard
          title="Cuotas"
          subtitle={`${installments.length} cuota${installments.length !== 1 ? 's' : ''} registrada${installments.length !== 1 ? 's' : ''}`}
          noPadding
        >
          {installments.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-400">Sin cuotas registradas</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {installments.map((inst) => (
                <InstallmentRow
                  key={inst.id}
                  inst={inst}
                  currency={doc.currency}
                  today={today}
                  defaultPaymentMethod={doc.paymentMethod}
                  onUpdate={(updates) => handleInstallmentUpdate(inst.id, updates)}
                />
              ))}
              {/* Footer: cuotas pendientes */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-200">
                <span className="text-xs font-medium text-slate-500">
                  {cuotasPendientes > 0 ? 'Cuotas pendientes' : 'Estado'}
                </span>
                {cuotasPendientes > 0 ? (
                  <span className="text-sm font-bold text-amber-700 tabular-nums">
                    {doc.currency} {cuotasPendientes.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={12} />
                    Todo pagado
                  </span>
                )}
              </div>
            </div>
          )}
        </SectionCard>
        )}
      </div>

      {/* Saldo + Documentos relacionados */}
      {balance && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
          <SectionCard title="Saldo" subtitle="Efecto de Notas de Crédito/Débito y Ajustes aplicados">
            <DocumentBalanceSummary balance={balance} currency={doc.currency} hasPaymentStatus={!!typeDef?.hasPaymentStatus} />
          </SectionCard>

          <SectionCard
            title="Documentos Relacionados"
            subtitle={`${balance.relatedDocs.length} documento${balance.relatedDocs.length !== 1 ? 's' : ''} vinculado${balance.relatedDocs.length !== 1 ? 's' : ''}`}
            noPadding
          >
            {balance.relatedDocs.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-slate-400">Sin documentos relacionados</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {balance.relatedDocs.map((r: RelatedDocSummary) => (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/insurance/documents/${r.id}`)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-slate-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-xs font-mono font-semibold text-slate-700 truncate">{r.documentNumber}</p>
                        {r.isOrigin && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-full flex-shrink-0">
                            {linkedDocBadgeLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{DOCUMENT_TYPE_LABELS[r.documentType] ?? r.documentType}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-slate-700 tabular-nums">
                        {formatCurrencyCompact(Math.abs(r.totalAmount), r.currency)}
                      </span>
                      <StatusPill status={r.documentStatus} size="sm" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Adjuntos */}
      <SectionCard
        title="Archivos Adjuntos"
        subtitle={`${doc.attachmentsCount ?? 0} ${(doc.attachmentsCount ?? 0) === 1 ? 'archivo adjunto' : 'archivos adjuntos'}`}
        noPadding
      >
        <DocumentAttachmentsSection documentId={doc.id} />
      </SectionCard>

      {/* Historial de auditoría */}
      <SectionCard
        title="Historial"
        actions={
          <span className="text-xs text-slate-400 font-medium">
            {auditLog.length} {auditLog.length === 1 ? 'evento' : 'eventos'}
          </span>
        }
      >
        {auditLog.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-400">Sin eventos registrados aún.</p>
          </div>
        ) : (
          <div>
            {auditLog.map((entry, idx) => (
              <AuditLogRow key={entry.id} entry={entry} isLast={idx === auditLog.length - 1} />
            ))}
          </div>
        )}
      </SectionCard>

      <ConfirmDialog
        open={applyConfirmOpen}
        title="¿Aplicar este documento?"
        description="Al aplicarlo, su efecto sobre el saldo del documento vinculado pasa a contabilizarse. Esta acción se puede revertir cancelando el documento."
        confirmLabel="Sí, aplicar"
        cancelLabel="Cancelar"
        danger={false}
        loading={applying}
        onConfirm={handleApply}
        onCancel={() => setApplyConfirmOpen(false)}
      />

      <ConfirmDialog
        open={cancelDocConfirmOpen}
        title="¿Anular este documento?"
        description="El documento quedará anulado y dejará de afectar cualquier saldo. No se elimina físicamente ni se pierde su historial."
        confirmLabel="Sí, anular"
        cancelLabel="Volver"
        danger
        loading={cancelling}
        onConfirm={handleCancelDocument}
        onCancel={() => {
          setCancelDocConfirmOpen(false)
          setCancelReason('')
        }}
      >
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">
            Motivo de la anulación (opcional)
          </label>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ej: Error en el monto, duplicado, etc."
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none"
          />
        </div>
      </ConfirmDialog>
    </PageContent>
  )
}
