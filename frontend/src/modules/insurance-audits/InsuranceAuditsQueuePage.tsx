import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardCheck, AlertTriangle, CheckCircle2, XCircle, X, Gauge } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { Tabs, type TabItem } from '../../shared/components/tabs/Tabs'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { formatDate } from '../../shared/utils/format'
import { useCurrentUser } from '../../app/auth/AuthContext'
import { insuranceAuditsApi, insuranceAuditKeys, insuranceAuditQueries, type InsuranceAuditListItem } from '../../shared/api/insurance-audits.api'
import { ROUTES } from '../../app/routes'
import type { TableColumn } from '../../shared/types'
import { InsuranceAuditCoverageTab } from './InsuranceAuditCoverageTab'

const AUDIT_STATUS_SORT_ORDER: Record<string, number> = {
  SUBMITTED: 0,
  NEEDS_CORRECTION: 1,
  APPROVED: 2,
  REJECTED: 3,
}

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function InsuranceAuditsQueuePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const canReview = user?.role === 'ADMIN' || (user?.modules.includes('insurance_audits') ?? false)
  const canAudit = user?.role === 'ADMIN' || (user?.modules.includes('insurance_audit_coverage') ?? false)

  const [activeTab, setActiveTab] = useState<'auditorias' | 'cobertura'>('cobertura')
  const [search, setSearch] = useState('')
  const [coveragePeriod, setCoveragePeriod] = useState(currentPeriod())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)

  const { data: all = [], isLoading, isError } = useQuery(insuranceAuditQueries.list())
  const { data: coverage = [], isLoading: coverageLoading } = useQuery(insuranceAuditQueries.coverage(coveragePeriod))

  const pendingCoverageCount = useMemo(() => coverage.filter((c) => !c.audited).length, [coverage])

  const tabs: TabItem[] = canReview
    ? [
        { id: 'auditorias', label: 'Auditorías' },
        { id: 'cobertura', label: 'Cobertura', count: pendingCoverageCount },
      ]
    : []

  const counts = useMemo(
    () => ({
      SUBMITTED: all.filter((a) => a.status === 'SUBMITTED').length,
      NEEDS_CORRECTION: all.filter((a) => a.status === 'NEEDS_CORRECTION').length,
      APPROVED: all.filter((a) => a.status === 'APPROVED').length,
      REJECTED: all.filter((a) => a.status === 'REJECTED').length,
    }),
    [all],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((a) => {
      if (!q) return true
      return [a.asset?.code, a.asset?.name, a.asset?.assetType, a.auditedBy].filter(Boolean).some((v) => v!.toLowerCase().includes(q))
    })
  }, [all, search])

  function isRowSelectable(row: InsuranceAuditListItem) {
    return row.status === 'SUBMITTED'
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filtered.filter(isRowSelectable).map((a) => a.id)) : new Set())
  }

  async function handleBulkApprove() {
    if (bulkApproving) return
    setBulkApproving(true)
    try {
      const result = await insuranceAuditsApi.bulkApprove([...selectedIds])
      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
      setSelectedIds(new Set())
      setShowBulkConfirm(false)

      const { approved, failed } = result
      if (failed.length === 0) {
        toast.success(`${approved.length} auditoría${approved.length !== 1 ? 's' : ''} aprobada${approved.length !== 1 ? 's' : ''} correctamente`)
      } else {
        toast.error(
          `${approved.length} aprobada${approved.length !== 1 ? 's' : ''}, ${failed.length} no se pudo${failed.length !== 1 ? 'ieron' : ''} aprobar: ` +
            failed.map((f) => `${f.code ?? f.id.slice(0, 8)} (${f.message})`).join(' · '),
          { duration: 10000 },
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al aprobar en bloque')
    } finally {
      setBulkApproving(false)
    }
  }

  const columns: TableColumn<InsuranceAuditListItem>[] = [
    {
      key: 'asset',
      label: 'Activo',
      sortable: true,
      sortValue: (row) => row.asset?.name ?? null,
      render: (_, row) =>
        row.asset ? (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{row.asset.name}</p>
            <p className="text-xs text-slate-500">{row.asset.assetType}</p>
            <p className="text-xs text-slate-400 font-mono">{row.asset.code ?? '—'}</p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'auditPeriod', label: 'Período', sortable: true, render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    { key: 'auditedBy', label: 'Auditor', sortable: true, render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    { key: 'auditDate', label: 'Fecha', sortable: true, render: (v) => <span className="text-sm text-slate-500 tabular-nums">{formatDate(v as string)}</span> },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      sortValue: (row) => AUDIT_STATUS_SORT_ORDER[row.status] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Auditoría de Seguros"
        subtitle="Documentación/cobertura vigente y condición física relevante al seguro"
        actions={
          canReview ? (
            <button
              type="button"
              onClick={() => navigate(ROUTES.INSURANCE_AUDITS_DASHBOARD)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Gauge size={15} />
              Ver dashboard
            </button>
          ) : undefined
        }
      />

      {canReview && (
        <SectionCard noPadding className="mb-5">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as 'auditorias' | 'cobertura')} />
        </SectionCard>
      )}

      {activeTab === 'auditorias' && canReview && (
        <>
          <MetricGrid cols={4} className="mb-5">
            <KpiCard label="Pendientes de revisión" value={counts.SUBMITTED} description="Esperando decisión" icon={ClipboardCheck} variant="info" />
            <KpiCard label="Requieren corrección" value={counts.NEEDS_CORRECTION} description="Devueltas al auditor" icon={AlertTriangle} variant="warning" />
            <KpiCard label="Aprobadas" value={counts.APPROVED} description="Auditoría validada" icon={CheckCircle2} variant="success" />
            <KpiCard label="Rechazadas" value={counts.REJECTED} description="Auditoría descartada" icon={XCircle} variant="danger" />
          </MetricGrid>

          <SectionCard noPadding>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por activo, tipo o auditor…" className="w-full sm:w-80" />
              <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">{filtered.length} de {all.length} auditorías</span>
            </div>

            {selectedIds.size > 0 && (
              <div className="px-5 py-2.5 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-brand-800">
                  {selectedIds.size} auditoría{selectedIds.size !== 1 ? 's' : ''} seleccionada{selectedIds.size !== 1 ? 's' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => setShowBulkConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <CheckCircle2 size={13} />
                  Aprobar seleccionadas
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 rounded-lg transition-colors ml-auto"
                >
                  <X size={13} />
                  Limpiar selección
                </button>
              </div>
            )}

            <DataTable
              tableKey="insurance-audits"
              columns={columns}
              data={filtered}
              rowKey="id"
              loading={isLoading}
              onRowClick={(row) => navigate(ROUTES.INSURANCE_AUDITS_DETAIL(row.id))}
              emptyTitle="Sin auditorías"
              emptyDescription="No se encontraron auditorías con los filtros aplicados."
              minWidth={800}
              selectable
              selectedIds={selectedIds}
              onToggleOne={toggleOne}
              onToggleAll={toggleAll}
              isRowSelectable={isRowSelectable}
            />
          </SectionCard>
        </>
      )}

      {(activeTab === 'cobertura' || !canReview) && (
        <InsuranceAuditCoverageTab period={coveragePeriod} onPeriodChange={setCoveragePeriod} data={coverage} isLoading={coverageLoading} canAudit={canAudit} />
      )}

      <ConfirmDialog
        open={showBulkConfirm}
        title={`¿Aprobar ${selectedIds.size} auditoría${selectedIds.size !== 1 ? 's' : ''}?`}
        description={`Se van a aprobar ${selectedIds.size} auditoría${selectedIds.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`}
        confirmLabel={bulkApproving ? 'Aprobando…' : 'Aprobar'}
        danger={false}
        onConfirm={handleBulkApprove}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </PageContent>
  )
}
