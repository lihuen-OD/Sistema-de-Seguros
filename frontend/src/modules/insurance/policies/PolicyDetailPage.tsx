import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  FileDown, Edit2, ShieldCheck, FileText, Building2, User, Calendar, Hash, Link2,
  Plus, ChevronDown, ChevronUp, ArrowUpRight, Archive,
  Paperclip, IdCard, ShieldOff, Clock, History, PlusCircle,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SummaryRow } from '../../../shared/components/cards/SummaryRow'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { ActionMenu } from '../../../shared/components/menus/ActionMenu'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatPercent,
  formatDate,
  daysUntil,
  // Alias: esta página ya tiene un `isExpired` local (si la póliza entera
  // venció) — este es el de shared/utils/format.ts, para líneas de cobertura.
  isExpired as isCoverageBajaEffective,
} from '../../../shared/utils/format'
import {
  computePolicyInvoicedTotal,
  computePsaPercentage,
} from '../../../shared/utils/policyInvoicedTotal'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import { hasModule } from '../../../app/auth/roleScope'
import { policiesApi, policyKeys, policyQueries } from '../../../shared/api/policies.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { documentsApi, documentKeys, documentQueries } from '../../../shared/api/documents.api'
import { DOCUMENT_TYPE_LABELS } from '../../../shared/constants'
import { ROUTES } from '../../../app/routes'
import { PolicyAttachmentsSection } from './PolicyAttachmentsSection'
import { DeactivateCoverageModal } from './DeactivateCoverageModal'
import { ReAddCoverageModal } from './ReAddCoverageModal'
import { FacturaCard } from './components/FacturaCard'
import { StandaloneDocCard } from './components/StandaloneDocCard'
import { EndorsementCard } from './components/EndorsementCard'
import type { AccountingDocument, Installment, InstallmentUpdate, PolicyCoverage, ProducerTask, TableColumn } from '../../../shared/types'

// Orden por severidad/ciclo de vida al ordenar las columnas "Prioridad" y
// "Estado" de la tabla de tareas — alfabético dejaría, por ejemplo, "alta"
// antes que "baja", que no refleja ninguna escala real. Mismo orden que
// TASK_PRIORITY_LABELS / TASK_STATUS_LABELS.
const TASK_PRIORITY_SORT_ORDER: Record<string, number> = { baja: 0, media: 1, alta: 2 }
const TASK_STATUS_SORT_ORDER: Record<string, number> = { pendiente: 0, en_curso: 1, finalizada: 2, vencida: 3 }

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()

  // La pestaña/datos de Documentos son de otro módulo — sin él, ni se
  // intenta el fetch ni se muestra la pestaña. "Total facturado"/P/SA
  // necesitan además Análisis Financiero (financialDocs) para el prorrateo.
  const canDocuments = hasModule(user, 'documents')
  const canFinancial = hasModule(user, 'financial_analysis')

  const { data: policy, isLoading: loadingPolicy } = useQuery(policyQueries.detail(id!))

  const { data: producers = [] } = useQuery(producerQueries.list())

  const { data: allDocuments = [] } = useQuery({ ...documentQueries.list(), enabled: canDocuments })

  // Trae allocations (con allocationPercentage por póliza) embebidas — a
  // diferencia de documentQueries.list(), que solo trae policyIds sin monto.
  // Se usa exclusivamente para prorratear "Total facturado"/P/SA.
  const { data: financialDocs = [] } = useQuery({ ...documentQueries.financial(), enabled: canFinancial })

  const { data: documentTypesData } = useQuery({ ...documentQueries.types(), enabled: canDocuments })
  // Mapa por key para saber, de un NC/ND/Ajuste/Refacturación vinculado,
  // en qué dirección afecta el total de la factura (affectsLinkedDirection)
  // — mismo criterio que documents-balance.service.ts en el backend, para
  // no duplicar una lógica de signo distinta (y potencialmente incorrecta)
  // en el frontend.
  const typeDefsByKey = useMemo(
    () => Object.fromEntries((documentTypesData?.types ?? []).map((t) => [t.key, t])),
    [documentTypesData],
  )

  // Total facturado (neto ajustado) de esta póliza — mismo helper que usa la
  // columna "P/SA" en el detalle del Activo, para que los dos números
  // siempre coincidan. Debe declararse acá (con el resto de los hooks),
  // antes de los early-return de loading/not-found más abajo.
  const invoicedTotal = useMemo(
    () => computePolicyInvoicedTotal(id ?? '', financialDocs, typeDefsByKey),
    [id, financialDocs, typeDefsByKey],
  )

  const { data: policyTasks = [] } = useQuery(policyQueries.tasks(id!))

  const policyDocIds = useMemo(
    () => allDocuments.filter((d) => d.policyIds.includes(id ?? '')).map((d) => d.id),
    [allDocuments, id],
  )

  const docInstallmentQueries = useQueries({
    queries: policyDocIds.map((docId) => documentQueries.installments(docId)),
  })

  const [activeDocTab, setActiveDocTab] = useState<'documentos' | 'tareas' | 'adjuntos'>(canDocuments ? 'documentos' : 'tareas')

  // Local installment state — allows inline editing without leaving the page
  const [localInstallments, setLocalInstallments] = useState<Map<string, Installment[]>>(
    () => new Map(),
  )

  const [showDeBajaConfirm, setShowDeBajaConfirm] = useState(false)
  // Línea de cobertura con el desglose de documentos abierto — una sola a la
  // vez, mismo criterio que el resto de los acordeones de esta página.
  const [expandedCoverageId, setExpandedCoverageId] = useState<string | null>(null)
  // Línea de cobertura sobre la que se abrió el modal de baja histórica.
  const [deactivateTarget, setDeactivateTarget] = useState<PolicyCoverage | null>(null)
  // Línea de cobertura dada de baja sobre la que se abrió el modal de
  // reincorporación — sirve de plantilla, la reincorporación crea una línea
  // nueva y nunca la toca (ver ReAddCoverageModal).
  const [reAddTarget, setReAddTarget] = useState<PolicyCoverage | null>(null)
  // "Activos dados de baja" arranca colapsada si hay líneas — igual queda
  // accesible con un clic, no oculta información.
  const [showDeBajaCoverages, setShowDeBajaCoverages] = useState(false)

  const handleDeBaja = async () => {
    await policiesApi.markAsDeBaja(id!)
    queryClient.invalidateQueries({ queryKey: policyKeys.detail(id!) })
    queryClient.invalidateQueries({ queryKey: policyKeys.all })
    setShowDeBajaConfirm(false)
  }

  if (loadingPolicy) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageContent>
    )
  }

  if (!policy) {
    return (
      <PageContent>
        <EmptyState
          title="Póliza no encontrada"
          description="La póliza solicitada no existe o fue eliminada."
        />
      </PageContent>
    )
  }

  const producer = producers.find((p) => p.id === policy.producerId) ?? null
  const coverages = policy.coverages ?? []
  // Vigente hoy: sin baja, o con baja programada a futuro (bajaDate >= hoy).
  // Dado de baja: baja ya efectiva (bajaDate < hoy) — nunca se borra, solo
  // se historiza (ver PolicyAssetCoverage.bajaDate).
  const vigentCoverages = coverages.filter((c) => !c.bajaDate || !isCoverageBajaEffective(c.bajaDate))
  const deBajaCoverages = coverages.filter((c) => c.bajaDate && isCoverageBajaEffective(c.bajaDate))

  // Activos con más de una línea (ej. dado de baja + reincorporado) — se usa
  // para avisar "Tiene historial de cobertura" en vez de dejar que dos cards
  // con el mismo nombre de activo parezcan un duplicado cargado por error.
  const coverageCountByAssetId = new Map<string, number>()
  for (const c of coverages) {
    if (c.assetId) coverageCountByAssetId.set(c.assetId, (coverageCountByAssetId.get(c.assetId) ?? 0) + 1)
  }
  const hasCoverageHistory = (c: PolicyCoverage) => !!c.assetId && (coverageCountByAssetId.get(c.assetId) ?? 0) > 1

  const documents = allDocuments.filter((d) => d.policyIds.includes(id!))

  // Documentos de facturación de UNA línea de cobertura puntual (no de toda
  // la póliza) — mismo dato que ya trae financialDocs para "Total
  // facturado"/P/SA, solo reagrupado por línea en vez de sumado.
  const canShowLineDocuments = canDocuments && canFinancial
  function coverageDocuments(coverageId: string) {
    return financialDocs
      .map((doc) => ({ doc, allocation: doc.allocations.find((a) => a.policyAssetCoverageId === coverageId) }))
      .filter((x): x is { doc: typeof financialDocs[number]; allocation: NonNullable<typeof x.allocation> } => !!x.allocation)
      .sort((a, b) => b.doc.issueDate.localeCompare(a.doc.issueDate))
  }

  // % contra la Suma Asegurada (P/SA) — invoicedTotal ya se calculó más
  // arriba, junto con el resto de los hooks. Siempre en USD: una póliza puede
  // tener varias líneas de cobertura en monedas distintas, así que ya no hay
  // una "moneda nativa de la póliza" única para comparar.
  const psaPercentage = computePsaPercentage(policy.totalInsuredAmountUsd ?? 0, invoicedTotal.totalUsd)

  // Build server installments map from useQueries results
  const serverInstallments = new Map<string, Installment[]>()
  policyDocIds.forEach((docId, idx) => {
    const data = docInstallmentQueries[idx]?.data ?? []
    serverInstallments.set(docId, data.map((i) => ({
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
    })))
  })
  // Merge: localInstallments overrides server data for optimistic updates
  const effectiveInstallments = new Map<string, Installment[]>(serverInstallments)
  localInstallments.forEach((insts, docId) => {
    if (insts.length > 0) effectiveInstallments.set(docId, insts)
  })

  const tasks = policyTasks

  const attachmentCount = policy.attachmentsCount ?? 0

  const handleInstallmentUpdate = async (
    docId: string,
    instId: string,
    updates: InstallmentUpdate,
  ) => {
    // Limpia el override optimista de este documento para que
    // effectiveInstallments vuelva a usar los datos (ya invalidados) de la
    // query — sin esto, si el guardado fallaba, el valor optimista incorrecto
    // seguía "ganándole" a los datos frescos hasta recargar toda la página.
    const clearLocalOverride = () => {
      setLocalInstallments((prev) => {
        const next = new Map(prev)
        next.delete(docId)
        return next
      })
    }
    setLocalInstallments((prev) => {
      const next = new Map(prev)
      const current = effectiveInstallments.get(docId) ?? []
      next.set(docId, current.map((i) => (i.id === instId ? { ...i, ...updates } : i)))
      return next
    })
    // Puntual en vez de documentKeys.all (que por prefijo refresca el
    // detail/attachments/etc. de TODO documento en cache, no solo el que
    // cambió): balance/detail/installments de este documento puntual +
    // financial() (afecta los agregados de Análisis Económico/Financiero,
    // que esta misma página usa para "Total facturado"/P/SA) + el listado
    // con exact:true (columna "Estado Pago" de DocumentsPage), sin invalidar
    // el resto de los documentos en cache.
    const invalidateAfterInstallmentChange = () => {
      queryClient.invalidateQueries({ queryKey: documentKeys.detail(docId) })
      queryClient.invalidateQueries({ queryKey: documentKeys.balance(docId) })
      queryClient.invalidateQueries({ queryKey: documentKeys.installments(docId) })
      queryClient.invalidateQueries({ queryKey: documentKeys.financial() })
      queryClient.invalidateQueries({ queryKey: documentKeys.all, exact: true })
    }
    try {
      await documentsApi.updateInstallment(docId, instId, updates)
      invalidateAfterInstallmentChange()
      clearLocalOverride()
    } catch {
      invalidateAfterInstallmentChange()
      clearLocalOverride()
    }
  }

  // Facturas, modificaciones financieras (NC/ND/Ajuste, se muestran anidadas
  // bajo la factura que afectan) y Endosos. Un Endoso con impacto económico
  // real (INCREASES_COST/DECREASES_COST) ya tiene importe propio y afecta el
  // saldo de la factura vinculada igual que una ND — se muestra anidado como
  // una modificación financiera más. Un Endoso sin impacto (NO_IMPACT /
  // PENDING_DEFINITION) sigue sin importe/saldo, así que se muestra aparte.
  const facturas = documents.filter((d) => d.documentType === 'INVOICE')
  const hasEconomicImpact = (d: AccountingDocument) =>
    d.economicImpactType === 'INCREASES_COST' || d.economicImpactType === 'DECREASES_COST'
  const docModifications = documents.filter(
    (d) =>
      d.documentType === 'CREDIT_NOTE' ||
      d.documentType === 'DEBIT_NOTE' ||
      d.documentType === 'ADJUSTMENT_ENTRY' ||
      (d.documentType === 'ENDORSEMENT' && hasEconomicImpact(d)),
  )
  const endorsements = documents.filter((d) => d.documentType === 'ENDORSEMENT' && !hasEconomicImpact(d))

  const daysLeft = daysUntil(policy.endDate)
  const isExpired = daysLeft < 0

  // Task columns
  const taskColumns: TableColumn<ProducerTask>[] = [
    {
      key: 'title',
      label: 'Tarea',
      sortable: true,
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-800 text-sm">{row.title}</p>
          <p className="text-xs text-slate-400 truncate max-w-[240px]">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'dueDate',
      label: 'Vencimiento',
      sortable: true,
      render: (v) => <span className="text-xs">{formatDate(v as string)}</span>,
    },
    {
      key: 'priority',
      label: 'Prioridad',
      sortable: true,
      sortValue: (row) => TASK_PRIORITY_SORT_ORDER[row.priority] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      sortValue: (row) => TASK_STATUS_SORT_ORDER[row.status] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title={policy.policyNumber}
        subtitle={`${policy.insuranceCompany} · ${(policy.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'} · ${formatDate(policy.startDate)} — ${formatDate(policy.endDate)}${!isExpired ? ` · ${daysLeft === 0 ? 'Vence hoy' : `${daysLeft} días restantes`}` : ''}`}
        category="Póliza"
        backTo="/insurance/policies"
        backLabel="Volver a pólizas"
        badge={<StatusPill status={policy.status} />}
        actions={
          <div className="flex items-center gap-2">
            {policy.status !== 'de_baja' && (
              <button
                onClick={() => setShowDeBajaConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
              >
                <Archive size={15} />
                Dar de baja
              </button>
            )}
            <button
              onClick={() => navigate(`/insurance/policies/${policy.id}/ficha`)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <FileDown size={15} />
              Ficha PDF
            </button>
            <button
              onClick={() => navigate(ROUTES.POLICIES_EDIT(policy.id))}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Edit2 size={15} />
              Editar
            </button>
          </div>
        }
      />

      <ConfirmDialog
        open={showDeBajaConfirm}
        title="Dar de baja la póliza"
        description={`¿Dar de baja la póliza "${policy.policyNumber}"? Pasará a estado "De Baja" de forma permanente.`}
        confirmLabel="Dar de baja"
        onConfirm={handleDeBaja}
        onCancel={() => setShowDeBajaConfirm(false)}
      />

      {deactivateTarget && (
        <DeactivateCoverageModal
          policyId={policy.id}
          policyEndDate={policy.endDate}
          coverage={deactivateTarget}
          onClose={() => setDeactivateTarget(null)}
          onSuccess={() => setDeactivateTarget(null)}
        />
      )}

      {reAddTarget && (
        <ReAddCoverageModal
          policyId={policy.id}
          policyStartDate={policy.startDate}
          policyEndDate={policy.endDate}
          coverage={reAddTarget}
          onClose={() => setReAddTarget(null)}
          onSuccess={() => setReAddTarget(null)}
        />
      )}

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* Left: Policy detail cards */}
        <div className="lg:col-span-2 space-y-5">

          {/* Datos de la Póliza */}
          <SectionCard title="Datos de la Póliza">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              <InfoRow label="N° Póliza" value={policy.policyNumber} icon={Hash} />
              <InfoRow label="Aseguradora" value={policy.insuranceCompany} icon={Building2} />
              <InfoRow
                label="Productor"
                value={producer?.name ?? '—'}
                icon={User}
                link={producer ? `/producers/${producer.id}` : undefined}
              />
              <InfoRow label="Estado" value={policy.status} isStatus />
            </div>
          </SectionCard>

          {/* Vigencia */}
          <SectionCard title="Vigencia">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              <InfoRow label="Fecha de Inicio" value={formatDate(policy.startDate)} icon={Calendar} />
              <InfoRow label="Fecha de Vencimiento" value={formatDate(policy.endDate)} icon={Calendar} />
              <InfoRow
                label="Días Restantes"
                value={isExpired ? `Vencida hace ${Math.abs(daysLeft)} días` : daysLeft === 0 ? 'Vence hoy' : `${daysLeft} días`}
              />
            </div>
            {policy.description && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Descripción
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{policy.description}</p>
              </div>
            )}
          </SectionCard>

          {/* Líneas de cobertura — cada una es un activo (o "sin activo") con su
              propio tipo de seguro, coberturas y suma asegurada. Separadas en
              vigentes / dadas de baja: una baja nunca borra la línea, solo la
              historiza (ver PolicyAssetCoverage.bajaDate). */}
          <SectionCard
            title="Activos Vigentes"
            subtitle={`${vigentCoverages.length} línea${vigentCoverages.length !== 1 ? 's' : ''} de cobertura`}
          >
            {vigentCoverages.length === 0 ? (
              <p className="text-sm text-slate-400">Esta póliza no tiene activos vigentes.</p>
            ) : (
              <div className="space-y-2">
                {vigentCoverages.map((coverage) => (
                  <CoverageLineCard
                    key={coverage.id}
                    coverage={coverage}
                    variant="vigente"
                    navigate={navigate}
                    canShowLineDocuments={canShowLineDocuments}
                    lineDocs={canShowLineDocuments ? coverageDocuments(coverage.id) : []}
                    isExpanded={expandedCoverageId === coverage.id}
                    onToggleExpand={() => setExpandedCoverageId(expandedCoverageId === coverage.id ? null : coverage.id)}
                    onDeactivate={() => setDeactivateTarget(coverage)}
                    hasHistory={hasCoverageHistory(coverage)}
                  />
                ))}
              </div>
            )}
          </SectionCard>

          {deBajaCoverages.length > 0 && (
            <SectionCard noPadding>
              <button
                type="button"
                onClick={() => setShowDeBajaCoverages((v) => !v)}
                className="flex items-center justify-between w-full px-5 py-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <History size={15} className="text-slate-400" />
                  <span className="text-sm font-semibold text-slate-800">Activos Dados de Baja</span>
                  <span className="text-xs font-medium px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">
                    {deBajaCoverages.length}
                  </span>
                </div>
                {showDeBajaCoverages ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
              </button>
              {showDeBajaCoverages && (
                <div className="px-5 pb-5 space-y-2">
                  {deBajaCoverages.map((coverage) => (
                    <CoverageLineCard
                      key={coverage.id}
                      coverage={coverage}
                      variant="de_baja"
                      navigate={navigate}
                      canShowLineDocuments={canShowLineDocuments}
                      lineDocs={canShowLineDocuments ? coverageDocuments(coverage.id) : []}
                      isExpanded={expandedCoverageId === coverage.id}
                      onToggleExpand={() => setExpandedCoverageId(expandedCoverageId === coverage.id ? null : coverage.id)}
                      hasHistory={hasCoverageHistory(coverage)}
                      onReAdd={() => setReAddTarget(coverage)}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </div>

        {/* Right: Financial KPIs */}
        <div className="space-y-4">
          <KpiCard
            label="Suma Asegurada USD"
            value={formatCurrencyCompact(policy.totalInsuredAmountUsd ?? 0, 'USD')}
            description={formatCurrencyFull(policy.totalInsuredAmountUsd ?? 0, 'USD')}
            variant="success"
          />
          <KpiCard
            label="Suma Asegurada ARS"
            value={formatCurrencyCompact(policy.totalInsuredAmountArs ?? 0, 'ARS')}
            description={formatCurrencyFull(policy.totalInsuredAmountArs ?? 0, 'ARS')}
            variant="info"
          />

          {/* Summary panel */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              {canDocuments && <SummaryRow label="Documentos asociados" value={String(documents.length)} />}
              <SummaryRow label="Tareas vinculadas" value={String(tasks.length)} />
              <SummaryRow
                label="Tareas pendientes"
                value={String(tasks.filter((t) => t.status === 'pendiente' || t.status === 'en_curso').length)}
                color={tasks.some((t) => t.status === 'vencida') ? 'text-red-600' : 'text-slate-800'}
              />
              {canDocuments && canFinancial && (
                <>
                  <SummaryRow
                    label="Total facturado (USD)"
                    value={formatCurrencyCompact(invoicedTotal.totalUsd, 'USD')}
                  />
                  <SummaryRow
                    label="P/SA"
                    value={psaPercentage != null ? formatPercent(psaPercentage, 2) : '—'}
                  />
                </>
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Tabbed section: Documentos + Tareas ─────────────────────────────── */}
      <div className="mb-6">
        {/* Tab bar */}
        <div className="flex items-center border-b border-slate-200 mb-5">
          {[
            ...(canDocuments ? [{ key: 'documentos' as const, label: 'Documentos', count: documents.length }] : []),
            { key: 'tareas' as const, label: 'Tareas', count: tasks.length },
            { key: 'adjuntos' as const, label: 'Adjuntos', count: attachmentCount },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveDocTab(tab.key)}
              className={clsx(
                'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeDocTab === tab.key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
              )}
            >
              {tab.label}
              <span className={clsx(
                'inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold',
                activeDocTab === tab.key ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-500',
              )}>
                {tab.count}
              </span>
            </button>
          ))}
          <div className="flex-1" />
          {activeDocTab === 'documentos' && (
            <ActionMenu
              triggerLabel="Nuevo documento"
              triggerIcon={Plus}
              triggerClassName="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
              align="right"
              options={[
                { label: 'Crear Factura', onClick: () => navigate(`${ROUTES.DOCUMENTS_NEW}?policyId=${id}&type=INVOICE`) },
                { label: 'Crear Endoso', onClick: () => navigate(`${ROUTES.DOCUMENTS_NEW}?policyId=${id}&type=ENDORSEMENT`) },
              ]}
            />
          )}
          {activeDocTab === 'adjuntos' && (
            <span className="text-xs text-slate-400">Archivos PDF, imágenes y certificados</span>
          )}
        </div>

        {/* Documentos tab */}
        {activeDocTab === 'documentos' && (
          <div className="space-y-4">
            {facturas.length === 0 && docModifications.length === 0 && endorsements.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
                <FileText size={24} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-medium text-slate-500 mb-1">Sin documentos contables</p>
                <p className="text-xs text-slate-400 mb-4">
                  Esta póliza no tiene facturas ni documentos asociados.
                </p>
                <ActionMenu
                  triggerLabel="Agregar documento"
                  triggerIcon={Plus}
                  triggerClassName="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
                  className="relative inline-block"
                  options={[
                    { label: 'Crear Factura', onClick: () => navigate(`${ROUTES.DOCUMENTS_NEW}?policyId=${id}&type=INVOICE`) },
                    { label: 'Crear Endoso', onClick: () => navigate(`${ROUTES.DOCUMENTS_NEW}?policyId=${id}&type=ENDORSEMENT`) },
                  ]}
                />
              </div>
            ) : (
              <>
                {facturas.map((factura) => {
                  const linked = docModifications.filter((m) => m.linkedDocumentId === factura.id)
                  const installments = effectiveInstallments.get(factura.id) ?? []
                  const modInst = new Map(
                    linked.map((m) => [m.id, effectiveInstallments.get(m.id) ?? []]),
                  )
                  return (
                    <FacturaCard
                      key={factura.id}
                      factura={factura}
                      installments={installments}
                      linkedMods={linked}
                      modInstallments={modInst}
                      typeDefsByKey={typeDefsByKey}
                      onInstallmentUpdate={handleInstallmentUpdate}
                    />
                  )
                })}
                {/* Standalone modifications — not linked to any factura in this policy */}
                {docModifications
                  .filter((m) => !m.linkedDocumentId || !facturas.find((f) => f.id === m.linkedDocumentId))
                  .map((mod) => (
                    <StandaloneDocCard
                      key={mod.id}
                      doc={mod}
                      installments={effectiveInstallments.get(mod.id) ?? []}
                      onInstallmentUpdate={handleInstallmentUpdate}
                    />
                  ))}
                {/* Endosos — se asocian a la póliza directamente, sin importe ni
                    cuotas, así que se muestran aparte de las tarjetas financieras */}
                {endorsements.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide pt-2">
                      Endosos ({endorsements.length})
                    </p>
                    {endorsements.map((end) => (
                      <EndorsementCard key={end.id} doc={end} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tareas tab */}
        {activeDocTab === 'tareas' && (
          tasks.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <p className="text-sm text-slate-400">No hay tareas vinculadas a esta póliza.</p>
            </div>
          ) : (
            <SectionCard noPadding>
              <DataTable
                tableKey="policy-detail-tasks"
                columns={taskColumns}
                data={tasks}
                rowKey="id"
                emptyTitle="Sin tareas"
                emptyDescription="No hay tareas vinculadas a esta póliza."
              />
            </SectionCard>
          )
        )}

        {/* Adjuntos tab — la documentación cuelga de cada línea de cobertura,
            no de la póliza entera, así que se muestra un bloque por línea. */}
        {activeDocTab === 'adjuntos' && (
          coverages.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-12 text-center">
              <Paperclip size={24} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-400">Esta póliza no tiene líneas de cobertura.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {coverages.map((coverage) => {
                const isDeBaja = !!coverage.bajaDate && isCoverageBajaEffective(coverage.bajaDate)
                return (
                <div key={coverage.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {coverage.asset ? coverage.asset.name : 'Sin activo asociado'}
                      </p>
                      <p className="text-xs text-slate-400">{coverage.insuranceType}</p>
                    </div>
                    {isDeBaja && (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                        <History size={10} />
                        Dado de baja
                      </span>
                    )}
                  </div>
                  <PolicyAttachmentsSection
                    policyId={policy.id}
                    coverageId={coverage.id}
                    policyEndDate={policy.endDate}
                    readOnly={isDeBaja}
                  />
                </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </PageContent>
  )
}

// â”€â”€â”€ Helper components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CoverageLineDoc {
  doc: AccountingDocument
  allocation: NonNullable<AccountingDocument['allocations']>[number]
}

interface CoverageLineCardProps {
  coverage: PolicyCoverage
  variant: 'vigente' | 'de_baja'
  navigate: (path: string) => void
  canShowLineDocuments: boolean
  lineDocs: CoverageLineDoc[]
  isExpanded: boolean
  onToggleExpand: () => void
  /** Solo se pasa para líneas vigentes — una línea de baja no puede volverse a dar de baja. */
  onDeactivate?: () => void
  /** Solo se pasa para líneas ya dadas de baja (baja efectiva, no programada) — abre el modal de reincorporación. */
  onReAdd?: () => void
  /** true si este activo tiene más de una línea en la póliza (ej. una vieja dada de baja + una reincorporada) — evita que dos cards con el mismo activo parezcan un duplicado cargado por error. */
  hasHistory?: boolean
}

// Una línea de cobertura, en su variante vigente o dada de baja — comparten
// casi todo el contenido (activo, tipo de seguro, suma asegurada, adjuntos y
// documentos facturados); lo que cambia es la info de ciclo de vida y si
// ofrece la acción de dar de baja/reincorporar.
function CoverageLineCard({
  coverage, variant, navigate, canShowLineDocuments, lineDocs, isExpanded, onToggleExpand, onDeactivate, onReAdd, hasHistory,
}: CoverageLineCardProps) {
  // Vigente con baja YA cargada pero con fecha futura — sigue vigente hoy,
  // pero ya se sabe que va a dejar de estarlo.
  const bajaProgramada = variant === 'vigente' && coverage.bajaDate ? coverage.bajaDate : null

  return (
    <div className={clsx(
      'rounded-lg border overflow-hidden',
      variant === 'de_baja' ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100',
    )}>
      <div className="flex items-start gap-3 p-3">
        <div className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
          variant === 'de_baja' ? 'bg-slate-100' : 'bg-brand-50',
        )}>
          {variant === 'de_baja'
            ? <ShieldOff size={16} className="text-slate-400" />
            : <ShieldCheck size={16} className="text-brand-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
            {coverage.asset ? coverage.asset.name : 'Sin activo asociado'}
            {hasHistory && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-50 text-violet-600 border border-violet-200"
                title="Este activo tiene más de un período de cobertura en esta póliza"
              >
                <History size={9} />
                Tiene historial de cobertura
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500">
            {coverage.asset
              ? `${coverage.asset.internalCode} — ${coverage.asset.assetType}`
              : [coverage.companyName, coverage.costCenterName].filter(Boolean).join(' · ') || 'Sin empresa/centro de costo'}
          </p>
          {coverage.asset && (coverage.asset.fixedAssetName || (coverage.asset.costCenters?.length ?? 0) > 0) && (
            <p className="text-xs text-slate-400 mt-0.5">
              {coverage.asset.fixedAssetName && <>Bien de Uso: {coverage.asset.fixedAssetName}</>}
              {coverage.asset.fixedAssetName && (coverage.asset.costCenters?.length ?? 0) > 0 && ' · '}
              {coverage.asset.costCenters && coverage.asset.costCenters.length > 0 && (
                <>
                  Centro de costo: {coverage.asset.costCenters
                    .map((cc) => (coverage.asset!.costCenters!.length > 1 ? `${cc.name} (${cc.percentage}%)` : cc.name))
                    .join(', ')}
                </>
              )}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">
            {coverage.insuranceType}
            {coverage.coverageNames && coverage.coverageNames.length > 0 && ` · ${coverage.coverageNames.join(', ')}`}
          </p>
          {coverage.beneficiaryDescription && (
            <p className="text-xs text-slate-400 mt-0.5 italic">{coverage.beneficiaryDescription}</p>
          )}

          {/* Ciclo de vida de la línea */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar size={10} />
              Alta: {formatDate(coverage.effectiveDate)}
            </span>
            {variant === 'vigente' && hasHistory && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Reincorporado
              </span>
            )}
            {variant === 'de_baja' && hasHistory && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                Período anterior
              </span>
            )}
            {bajaProgramada && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <Clock size={10} />
                Baja programada: {formatDate(bajaProgramada)}
              </span>
            )}
            {variant === 'de_baja' && coverage.bajaDate && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <History size={10} />
                Baja: {formatDate(coverage.bajaDate)}
              </span>
            )}
          </div>
          {variant === 'de_baja' && coverage.bajaReason && (
            <p className="text-xs text-slate-500 mt-1">
              <span className="font-medium text-slate-600">Motivo:</span> {coverage.bajaReason}
            </p>
          )}
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-bold text-slate-900 tabular-nums">
            {formatCurrencyCompact(coverage.insuredAmountUsd, 'USD')}
          </p>
          <p className="text-xs text-slate-400 tabular-nums">
            {formatCurrencyCompact(coverage.insuredAmountArs, 'ARS')}
          </p>
          {coverage.circulationCardAttachment?.fileUrl && (
            <a
              href={coverage.circulationCardAttachment.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline mt-1"
            >
              <IdCard size={11} />
              Tarjeta
            </a>
          )}
          {coverage.asset && (
            <button
              onClick={() => navigate(`/assets/${coverage.asset!.id}`)}
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium mt-1"
            >
              <Link2 size={12} />
              Ver activo
            </button>
          )}
          {canShowLineDocuments && (
            <button
              onClick={onToggleExpand}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium mt-1"
            >
              {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              Documentos ({lineDocs.length})
            </button>
          )}
          {/* Si ya tiene una baja cargada (aunque sea a futuro), no se ofrece
              la acción de nuevo — el backend la rechazaría con 409. */}
          {variant === 'vigente' && onDeactivate && !bajaProgramada && (
            <button
              onClick={onDeactivate}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600 font-medium mt-1.5"
            >
              <ShieldOff size={12} />
              Dar de baja
            </button>
          )}
          {/* Solo en variant de_baja: acá la baja ya es efectiva (no
              programada a futuro, esas quedan en vigentCoverages) — crea una
              línea NUEVA, nunca toca esta. */}
          {variant === 'de_baja' && onReAdd && (
            <button
              onClick={onReAdd}
              className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-1.5"
            >
              <PlusCircle size={12} />
              Reincorporar a cobertura
            </button>
          )}
        </div>
      </div>
      {canShowLineDocuments && isExpanded && (
        <div className="border-t border-slate-200 bg-white px-3 py-2">
          {lineDocs.length === 0 ? (
            <p className="text-xs text-slate-400 py-1">Sin documentos facturados en esta línea.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {lineDocs.map(({ doc, allocation }) => (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/insurance/documents/${doc.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/insurance/documents/${doc.id}`) }}
                  className="flex items-center justify-between gap-3 py-2 cursor-pointer hover:bg-slate-50 -mx-1 px-1 rounded"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType} {doc.documentNumber}
                    </p>
                    <p className="text-xs text-slate-400">{formatDate(doc.issueDate)}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 tabular-nums flex-shrink-0">
                    {formatCurrencyCompact(allocation.allocatedAmount, doc.currency)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}



function InfoRow({
  label,
  value,
  icon: Icon,
  isStatus,
  link,
}: {
  label: string
  value: string
  icon?: React.ElementType
  isStatus?: boolean
  link?: string
}) {
  const nav = useNavigate()
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      {isStatus ? (
        <StatusPill status={value} />
      ) : link ? (
        <button
          onClick={() => nav(link)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors"
        >
          {Icon && <Icon size={12} className="text-brand-400 flex-shrink-0" />}
          {value}
          <ArrowUpRight size={11} className="text-brand-400" />
        </button>
      ) : (
        <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
          {Icon && <Icon size={12} className="text-slate-400 flex-shrink-0" />}
          {value}
        </p>
      )}
    </div>
  )
}
