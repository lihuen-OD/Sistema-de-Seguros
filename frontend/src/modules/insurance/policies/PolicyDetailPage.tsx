import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import {
  FileDown, Edit2, ShieldCheck, FileText, Building2, User, Tag, Calendar, Hash, Link2,
  Receipt, TrendingUp, TrendingDown, CheckCircle2, Plus, ChevronDown, ChevronUp, ArrowUpRight, FileEdit,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
  daysUntil,
} from '../../../shared/utils/format'
import { policyQueries } from '../../../shared/api/policies.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { documentsApi, documentKeys, documentQueries } from '../../../shared/api/documents.api'
import { DOCUMENT_TYPE_LABELS, ECONOMIC_IMPACT_TYPE_LABELS } from '../../../shared/constants'
import { ROUTES } from '../../../app/routes'
import { InstallmentRow } from '../../../shared/components/installments/InstallmentRow'
import { PolicyAttachmentsSection } from './PolicyAttachmentsSection'
import type { AccountingDocument, Installment, InstallmentUpdate, ProducerTask, TableColumn } from '../../../shared/types'

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: policy, isLoading: loadingPolicy } = useQuery(policyQueries.detail(id!))

  const { data: producers = [] } = useQuery(producerQueries.list())

  const { data: companies = [] } = useQuery(companyQueries.list())

  const { data: costCenters = [] } = useQuery(costCenterQueries.list())

  const { data: allDocuments = [] } = useQuery(documentQueries.list())

  const { data: policyTasks = [] } = useQuery(policyQueries.tasks(id!))

  const policyDocIds = useMemo(
    () => allDocuments.filter((d) => d.policyIds.includes(id ?? '')).map((d) => d.id),
    [allDocuments, id],
  )

  const docInstallmentQueries = useQueries({
    queries: policyDocIds.map((docId) => documentQueries.installments(docId)),
  })

  const [activeDocTab, setActiveDocTab] = useState<'documentos' | 'tareas' | 'adjuntos'>('documentos')

  // Local installment state — allows inline editing without leaving the page
  const [localInstallments, setLocalInstallments] = useState<Map<string, Installment[]>>(
    () => new Map(),
  )

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
  const company = policy.companyId ? companies.find((c) => c.id === policy.companyId) ?? null : null
  const costCenter = policy.costCenterId ? costCenters.find((cc) => cc.id === policy.costCenterId) ?? null : null
  const linkedAssets = policy.selectedAssets ?? []

  const documents = allDocuments.filter((d) => d.policyIds.includes(id!))

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
      paymentStatus: i.paymentStatus as Installment['paymentStatus'],
      paidAt: i.paidAt,
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
    updates: Partial<Pick<Installment, 'amount' | 'paymentStatus' | 'paidAt' | 'dueDate'>>,
  ) => {
    setLocalInstallments((prev) => {
      const next = new Map(prev)
      const current = effectiveInstallments.get(docId) ?? []
      next.set(docId, current.map((i) => (i.id === instId ? { ...i, ...updates } : i)))
      return next
    })
    try {
      await documentsApi.updateInstallment(docId, instId, updates)
      queryClient.invalidateQueries({ queryKey: documentKeys.installments(docId) })
      setLocalInstallments((prev) => {
        const next = new Map(prev)
        next.delete(docId)
        return next
      })
    } catch {
      queryClient.invalidateQueries({ queryKey: documentKeys.installments(docId) })
    }
  }

  // Facturas, modificaciones financieras (NC/ND/Refacturación, se muestran
  // anidadas bajo la factura que afectan) y Endosos (se asocian a la póliza
  // directamente, sin importe/cuotas — se muestran en su propio bloque, no
  // mezclados con las modificaciones financieras).
  const facturas = documents.filter((d) => d.documentType === 'INVOICE')
  const docModifications = documents.filter(
    (d) => d.documentType === 'CREDIT_NOTE' || d.documentType === 'DEBIT_NOTE' || d.documentType === 'REBILLING',
  )
  const endorsements = documents.filter((d) => d.documentType === 'ENDORSEMENT')

  const daysLeft = daysUntil(policy.endDate)
  const isExpired = daysLeft < 0

  // Task columns
  const taskColumns: TableColumn<ProducerTask>[] = [
    {
      key: 'title',
      label: 'Tarea',
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
      render: (v) => <span className="text-xs">{formatDate(v as string)}</span>,
    },
    {
      key: 'priority',
      label: 'Prioridad',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title={policy.policyNumber}
        subtitle={`${policy.insuranceCompany} · ${policy.insuranceType} · ${formatDate(policy.startDate)} — ${formatDate(policy.endDate)}${!isExpired ? ` · ${daysLeft === 0 ? 'Vence hoy' : `${daysLeft} días restantes`}` : ''}`}
        category="Póliza"
        backTo="/insurance/policies"
        backLabel="Volver a pólizas"
        badge={<StatusPill status={policy.status} />}
        actions={
          <div className="flex items-center gap-2">
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
              <InfoRow label="Tipo de Seguro" value={policy.insuranceType} icon={Tag} />
              <InfoRow label="Estado" value={policy.status} isStatus />
            </div>
            {/* Coberturas — can span full width */}
            {(policy.coverageNames?.length || policy.coverageTypes?.length || policy.coverageType) && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Coberturas</p>
                <div className="flex flex-wrap gap-1.5">
                  {(policy.coverageNames?.length
                    ? policy.coverageNames
                    : policy.coverageType ? [policy.coverageType] : []
                  ).map((cov) => (
                    <span
                      key={cov}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-brand-50 border border-brand-100 text-brand-700"
                    >
                      <Tag size={10} className="text-brand-400" />
                      {cov}
                    </span>
                  ))}
                </div>
              </div>
            )}
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

          {/* Association: assets or company+costCenter */}
          <SectionCard title="Asociación">
            {linkedAssets.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Activo{linkedAssets.length !== 1 ? 's' : ''} Asegurado{linkedAssets.length !== 1 ? 's' : ''} ({linkedAssets.length})
                </p>
                {linkedAssets.map((asset) => (
                  <div key={asset.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <ShieldCheck size={16} className="text-brand-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800">{asset.name}</p>
                      <p className="text-xs text-slate-500">{asset.internalCode} — {asset.assetType}</p>
                      {asset.fixedAssetCode && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          Bien de uso: <span className="font-mono">{asset.fixedAssetCode}</span>{asset.fixedAssetName ? ` — ${asset.fixedAssetName}` : ''}
                        </p>
                      )}
                      {asset.costCenterCode && (
                        <p className="text-xs text-slate-400">
                          CC: {asset.costCenterCode}{asset.costCenterName ? ` — ${asset.costCenterName}` : ''}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => navigate(`/assets/${asset.id}`)}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium flex-shrink-0"
                    >
                      <Link2 size={12} />
                      Ver
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                <InfoRow
                  label="Empresa"
                  value={company?.name ?? '—'}
                  icon={Building2}
                />
                <InfoRow
                  label="Centro de Costo"
                  value={costCenter ? `${costCenter.code} — ${costCenter.name}` : '—'}
                />
                <InfoRow
                  label="Descripción"
                  value={costCenter?.description ?? '—'}
                />
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: Financial KPIs */}
        <div className="space-y-4">
          <KpiCard
            label="Suma Asegurada ARS"
            value={formatCurrencyCompact(policy.insuredAmountArs, 'ARS')}
            description={formatCurrencyFull(policy.insuredAmountArs, 'ARS')}
            variant="info"
          />
          <KpiCard
            label="Tipo de Cambio"
            value={`$ ${policy.exchangeRate.toLocaleString('es-AR')}`}
            description="ARS / USD al momento de alta"
            variant="default"
          />
          <KpiCard
            label="Suma Asegurada USD"
            value={formatCurrencyCompact(policy.insuredAmountUsd, 'USD')}
            description={formatCurrencyFull(policy.insuredAmountUsd, 'USD')}
            variant="success"
          />

          {/* Summary panel */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow label="Documentos asociados" value={String(documents.length)} />
              <SummaryRow label="Tareas vinculadas" value={String(tasks.length)} />
              <SummaryRow
                label="Tareas pendientes"
                value={String(tasks.filter((t) => t.status === 'pendiente' || t.status === 'en_curso').length)}
                color={tasks.some((t) => t.status === 'vencida') ? 'text-red-600' : 'text-slate-800'}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Tabbed section: Documentos + Tareas ─────────────────────────────── */}
      <div className="mb-6">
        {/* Tab bar */}
        <div className="flex items-center border-b border-slate-200 mb-5">
          {[
            { key: 'documentos' as const, label: 'Documentos', count: documents.length },
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
            <button
              type="button"
              onClick={() => navigate(`/insurance/documents/new?policyId=${id}`)}
              className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              <Plus size={13} />
              Nuevo documento
            </button>
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
                <button
                  type="button"
                  onClick={() => navigate(`/insurance/documents/new?policyId=${id}`)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Plus size={14} />
                  Agregar documento
                </button>
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
                columns={taskColumns}
                data={tasks}
                rowKey="id"
                emptyTitle="Sin tareas"
                emptyDescription="No hay tareas vinculadas a esta póliza."
              />
            </SectionCard>
          )
        )}

        {/* Adjuntos tab */}
        {activeDocTab === 'adjuntos' && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <PolicyAttachmentsSection policyId={policy.id} />
          </div>
        )}
      </div>
    </PageContent>
  )
}

// â”€â”€â”€ Helper components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


function FacturaCard({
  factura,
  installments,
  linkedMods,
  modInstallments,
  onInstallmentUpdate,
}: {
  factura: AccountingDocument
  installments: Installment[]
  linkedMods: AccountingDocument[]
  modInstallments: Map<string, Installment[]>
  onInstallmentUpdate: (docId: string, instId: string, updates: InstallmentUpdate) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const currency = factura.currency === 'USD' ? 'US$' : 'AR$'
  const modSum = linkedMods.reduce((sum, m) => sum + m.totalAmount, 0)
  const netTotal = factura.totalAmount + modSum
  const paidCount = installments.filter((i) => i.paymentStatus === 'PAID').length
  const pendingCount = installments.length - paidCount
  const today = new Date().toISOString().slice(0, 10)

  const allInstallments = [...installments, ...Array.from(modInstallments.values()).flat()]
  const saldo = allInstallments
    .filter((i) => i.paymentStatus !== 'PAID')
    .reduce((sum, i) => sum + Math.abs(i.amount), 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Receipt size={15} className="text-brand-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 font-mono tracking-wide">
                {factura.documentNumber}
              </p>
              <span className="text-xs text-slate-400">·</span>
              <p className="text-xs text-slate-500">{formatDate(factura.issueDate)}</p>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {installments.length} cuota{installments.length !== 1 ? 's' : ''}
              {paidCount > 0 && ` · ${paidCount} pagada${paidCount !== 1 ? 's' : ''}`}
              {pendingCount > 0 && ` · ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
              {linkedMods.length > 0 && ` · ${linkedMods.length} modificación${linkedMods.length !== 1 ? 'es' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {linkedMods.length > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
                Neto ajustado
              </p>
              <p className="text-sm font-bold text-slate-900 tabular-nums">
                {currency}{' '}
                {netTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
              Total factura
            </p>
            <p className={clsx(
              'text-sm font-semibold tabular-nums',
              linkedMods.length > 0 ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800',
            )}>
              {currency}{' '}
              {factura.totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <StatusPill status={factura.paymentStatus} size="sm" />
          {expanded
            ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0" />
            : <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />
          }
        </div>
      </button>

      {expanded && (
        <>
          <div className="border-t border-slate-100">
            <div className="px-5 py-2 bg-slate-50/70">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Cuotas originales ({installments.length})
              </p>
            </div>
            {installments.length === 0 ? (
              <p className="text-xs text-slate-400 px-5 py-3 italic">Sin cuotas registradas.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {installments.map((inst) => (
                  <InstallmentRow
                    key={inst.id}
                    inst={inst}
                    currency={currency}
                    today={today}
                    onUpdate={(updates) => onInstallmentUpdate(factura.id, inst.id, updates)}
                  />
                ))}
              </div>
            )}
          </div>

          {linkedMods.map((mod) => {
            const isNC = mod.documentType === 'CREDIT_NOTE'
            const mInst = modInstallments.get(mod.id) ?? []
            return (
              <div key={mod.id} className="border-t border-slate-200">
                <div className={clsx(
                  'flex items-center gap-3 px-5 py-3',
                  isNC ? 'bg-red-50/50' : 'bg-emerald-50/40',
                )}>
                  <div className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                    isNC ? 'bg-red-100' : 'bg-emerald-100',
                  )}>
                    {isNC
                      ? <TrendingDown size={13} className="text-red-500" />
                      : <TrendingUp size={13} className="text-emerald-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-700 font-mono">{mod.documentNumber}</p>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                        isNC ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700',
                      )}>
                        {DOCUMENT_TYPE_LABELS[mod.documentType] ?? mod.documentType}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <p className="text-xs text-slate-500">{formatDate(mod.issueDate)}</p>
                    </div>
                    {mInst.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {mInst.length} cuota{mInst.length !== 1 ? 's' : ''} adicional{mInst.length !== 1 ? 'es' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className={clsx(
                      'text-sm font-bold tabular-nums',
                      isNC ? 'text-red-600' : 'text-emerald-700',
                    )}>
                      {isNC ? '−' : '+'}{currency}{' '}
                      {Math.abs(mod.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <StatusPill status={mod.paymentStatus} size="sm" />
                  </div>
                </div>
                {mInst.length > 0 && (
                  <div className="divide-y divide-slate-50 bg-slate-50/30">
                    {mInst.map((inst) => (
                      <InstallmentRow
                        key={inst.id}
                        inst={inst}
                        currency={currency}
                        today={today}
                        indent
                        onUpdate={(updates) => onInstallmentUpdate(mod.id, inst.id, updates)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {(saldo > 0 || linkedMods.length > 0) && (
            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-4 bg-slate-50 flex-wrap">
              {/* Saldo pendiente */}
              {saldo > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Saldo pendiente</span>
                  <span className="text-sm font-bold text-amber-600 tabular-nums">
                    {currency}{' '}
                    {saldo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600">Todo pagado</span>
                </div>
              )}
              {/* Neto ajustado (solo si hay modificaciones) */}
              {linkedMods.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Neto ajustado</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {currency}{' '}
                    {netTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StandaloneDocCard({
  doc,
  installments,
  onInstallmentUpdate,
}: {
  doc: AccountingDocument
  installments: Installment[]
  onInstallmentUpdate: (docId: string, instId: string, updates: InstallmentUpdate) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const currency = doc.currency === 'USD' ? 'US$' : 'AR$'
  const isNC = doc.documentType === 'CREDIT_NOTE'
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden shadow-sm',
      isNC ? 'border-red-100 bg-red-50/20' : 'border-amber-100 bg-amber-50/20',
    )}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isNC ? 'bg-red-100' : 'bg-amber-100',
          )}>
            {isNC
              ? <TrendingDown size={15} className="text-red-500" />
              : <TrendingUp size={15} className="text-amber-600" />
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 font-mono">{doc.documentNumber}</p>
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                isNC ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700',
              )}>
                {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <p className="text-xs text-slate-500">{formatDate(doc.issueDate)}</p>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {installments.length} cuota{installments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <p className={clsx(
            'text-sm font-bold tabular-nums',
            isNC ? 'text-red-600' : 'text-amber-700',
          )}>
            {currency}{' '}
            {Math.abs(doc.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <StatusPill status={doc.paymentStatus} size="sm" />
          {expanded
            ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0" />
            : <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />
          }
        </div>
      </button>
      {expanded && installments.length > 0 && (
        <div className="border-t border-slate-200 divide-y divide-slate-50 bg-white/40">
          {installments.map((inst) => (
            <InstallmentRow
              key={inst.id}
              inst={inst}
              currency={currency}
              today={today}
              onUpdate={(updates) => onInstallmentUpdate(doc.id, inst.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const ENDORSEMENT_IMPACT_STYLE: Record<string, string> = {
  NO_IMPACT: 'bg-slate-100 text-slate-600',
  INCREASES_COST: 'bg-red-100 text-red-600',
  DECREASES_COST: 'bg-emerald-100 text-emerald-700',
  PENDING_DEFINITION: 'bg-amber-100 text-amber-700',
}

function EndorsementCard({ doc }: { doc: AccountingDocument }) {
  const navigate = useNavigate()
  const impactStyle = ENDORSEMENT_IMPACT_STYLE[doc.economicImpactType ?? ''] ?? 'bg-slate-100 text-slate-600'

  return (
    <button
      type="button"
      onClick={() => navigate(ROUTES.DOCUMENTS_DETAIL(doc.id))}
      className="w-full flex items-center justify-between gap-3 px-5 py-3.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors text-left"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
          <FileEdit size={15} className="text-violet-600" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-slate-800 font-mono">{doc.documentNumber}</p>
            <span className="text-xs text-slate-400">·</span>
            <p className="text-xs text-slate-500">{formatDate(doc.issueDate)}</p>
          </div>
          {doc.endorsementEffectiveDate && (
            <p className="text-xs text-slate-400 mt-0.5">
              Vigencia: {formatDate(doc.endorsementEffectiveDate)}
            </p>
          )}
        </div>
      </div>
      <span className={clsx('text-[10px] px-2 py-1 rounded-full font-semibold flex-shrink-0', impactStyle)}>
        {ECONOMIC_IMPACT_TYPE_LABELS[doc.economicImpactType ?? ''] ?? 'Sin impacto'}
      </span>
    </button>
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

function SummaryRow({
  label,
  value,
  color = 'text-slate-800',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}
