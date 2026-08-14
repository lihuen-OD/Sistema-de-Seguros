import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Gauge } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { MultiSelectFilter } from '../../shared/components/filters/MultiSelectFilter'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { DateRangeMonthPicker } from '../../shared/components/filters/DateRangeMonthPicker'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { Tabs, type TabItem } from '../../shared/components/tabs/Tabs'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { AuditAssignmentTab } from '../../shared/components/audit-assignment/AuditAssignmentTab'
import { AuditStatusKpiRow } from '../../shared/components/audit-queue/AuditStatusKpiRow'
import { AuditBulkApproveBar } from '../../shared/components/audit-queue/AuditBulkApproveBar'
import { useAuditSelection } from '../../shared/hooks/useAuditSelection'
import { formatDate, fireExtinguisherLabel } from '../../shared/utils/format'
import { currentPeriod } from '../../shared/utils/period'
import { useCurrentUser } from '../../app/auth/AuthContext'
import {
  assetAuditsApi,
  assetAuditKeys,
  assetAuditQueries,
  type AssetAuditListItem,
} from '../../shared/api/asset-audits.api'
import { fireExtinguisherKeys } from '../../shared/api/fire-extinguishers.api'
import { FIRE_EXT_AUDIT_STATUS_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { TableColumn } from '../../shared/types'
import { AssetAuditCoverageTab } from './AssetAuditCoverageTab'

const STATUS_OPTIONS = Object.entries(FIRE_EXT_AUDIT_STATUS_LABELS).map(([value, label]) => ({ value, label }))

const AUDIT_STATUS_SORT_ORDER: Record<string, number> = {
  SUBMITTED: 0,
  NEEDS_CORRECTION: 1,
  APPROVED: 2,
  REJECTED: 3,
}


export default function AssetAuditsQueuePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'ADMIN'
  const canReview = isAdmin || (user?.modules.includes('asset_audits') ?? false)
  const canAudit = isAdmin || (user?.modules.includes('asset_audit_coverage') ?? false)

  const [activeTab, setActiveTab] = useState<'auditorias' | 'cobertura' | 'asignacion'>('cobertura')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [coveragePeriod, setCoveragePeriod] = useState(currentPeriod())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)

  const { data: all = [], isLoading, isError } = useQuery(assetAuditQueries.list())
  const { data: coverage = [], isLoading: coverageLoading } = useQuery(assetAuditQueries.coverage(coveragePeriod))
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    ...assetAuditQueries.assignments(),
    enabled: isAdmin && activeTab === 'asignacion',
  })

  const pendingCoverageCount = useMemo(() => coverage.filter((c) => !c.audited).length, [coverage])

  const tabs: TabItem[] = canReview
    ? [
        { id: 'auditorias', label: 'Auditorías' },
        { id: 'cobertura', label: 'Cobertura', count: pendingCoverageCount },
        ...(isAdmin ? [{ id: 'asignacion', label: 'Asignación' }] : []),
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
      const matchStatus = filterStatus.length === 0 || filterStatus.includes(a.status)
      const matchSearch =
        !q ||
        [
          a.extinguisher?.code,
          a.extinguisher?.cylinderNumber,
          a.extinguisher?.type,
          a.extinguisher?.asset?.name,
          a.extinguisher?.asset?.assetType,
          a.auditedBy,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      const matchDateFrom = !filterDateFrom || a.auditPeriod >= filterDateFrom
      const matchDateTo = !filterDateTo || a.auditPeriod <= filterDateTo
      return matchStatus && matchSearch && matchDateFrom && matchDateTo
    })
  }, [all, search, filterStatus, filterDateFrom, filterDateTo])

  function toggleStatusFilter(status: string) {
    setFilterStatus((prev) => (prev.length === 1 && prev[0] === status ? [] : [status]))
  }

  const { selectedIds, setSelectedIds, isRowSelectable, toggleOne, toggleAll, clearSelection } = useAuditSelection(filtered)

  const selectedAudits = useMemo(() => all.filter((a) => selectedIds.has(a.id)), [all, selectedIds])
  const selectedWithChangesCount = selectedAudits.filter((a) => a.proposedChangesCount > 0).length

  async function handleBulkApprove() {
    if (bulkApproving) return
    setBulkApproving(true)
    try {
      const result = await assetAuditsApi.bulkApprove([...selectedIds])
      queryClient.invalidateQueries({ queryKey: assetAuditKeys.all })
      queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
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

  const columns: TableColumn<AssetAuditListItem>[] = [
    {
      key: 'extinguisher',
      label: 'Matafuego',
      sortable: true,
      sortValue: (row) => (row.extinguisher ? fireExtinguisherLabel(row.extinguisher.cylinderNumber, row.extinguisher.location, row.extinguisher.code) : null),
      render: (_, row) => {
        if (!row.extinguisher) return <span className="text-slate-400">—</span>
        const primaryLabel = fireExtinguisherLabel(row.extinguisher.cylinderNumber, row.extinguisher.location, row.extinguisher.code)
        const showCodeLine = primaryLabel !== row.extinguisher.code
        return (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{primaryLabel}</p>
            <p className="text-xs text-slate-500">{row.extinguisher.type}</p>
            {showCodeLine && <p className="text-xs text-slate-400 font-mono">{row.extinguisher.code}</p>}
          </div>
        )
      },
    },
    {
      key: 'asset',
      label: 'Activo',
      sortable: true,
      sortValue: (row) => row.extinguisher?.asset?.name ?? null,
      render: (_, row) =>
        row.extinguisher?.asset ? (
          <div className="min-w-0">
            <span className="block text-sm text-slate-600">{row.extinguisher.asset.name}</span>
            <span className="block text-xs text-slate-400 mt-0.5">{row.extinguisher.asset.assetType}</span>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'auditPeriod', label: 'Período', sortable: true, render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    { key: 'auditedBy', label: 'Auditor', sortable: true, render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    {
      key: 'auditDate',
      label: 'Fecha',
      sortable: true,
      render: (v) => <span className="text-sm text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      key: 'proposedChangesCount',
      label: 'Cambios propuestos',
      sortable: true,
      render: (v) => {
        const count = v as number
        return count > 0 ? (
          <span className="inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {count}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      },
    },
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
        title="Auditoría de Rodados"
        subtitle="Matafuegos montados en vehículos y maquinaria — revisión y aprobación"
        actions={
          canReview && activeTab === 'auditorias' ? (
            <button
              type="button"
              onClick={() => navigate(`${ROUTES.ASSET_AUDITS_DASHBOARD}?period=${coveragePeriod}`)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
            >
              <Gauge size={15} />
              Ver informe de auditoría
            </button>
          ) : undefined
        }
      />

      {canReview && (
        <SectionCard noPadding className="mb-5">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as 'auditorias' | 'cobertura' | 'asignacion')} />
        </SectionCard>
      )}

      {activeTab === 'auditorias' && canReview && (
        <>
          <AuditStatusKpiRow counts={counts} onStatusClick={toggleStatusFilter} />

          <SectionCard noPadding>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar por matafuego, activo o auditor…"
                className="w-full sm:w-80"
              />
              <MultiSelectFilter label="Estado" options={STATUS_OPTIONS} value={filterStatus} onChange={setFilterStatus} />
              <DateRangeMonthPicker
                from={filterDateFrom}
                to={filterDateTo}
                onChange={(from, to) => { setFilterDateFrom(from); setFilterDateTo(to) }}
              />
              {(filterDateFrom || filterDateTo) && (
                <button
                  type="button"
                  onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <X size={12} />
                  Limpiar fechas
                </button>
              )}
              <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                {filtered.length} de {all.length} auditorías
              </span>
            </div>

            <AuditBulkApproveBar
              selectedCount={selectedIds.size}
              onApproveClick={() => setShowBulkConfirm(true)}
              onClear={clearSelection}
            />

            <DataTable
              tableKey="asset-audits"
              columns={columns}
              data={filtered}
              rowKey="id"
              loading={isLoading}
              onRowClick={(row) => navigate(ROUTES.ASSET_AUDITS_DETAIL(row.id))}
              emptyTitle="Sin auditorías"
              emptyDescription="No se encontraron auditorías con los filtros aplicados."
              minWidth={900}
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
        <AssetAuditCoverageTab
          period={coveragePeriod}
          onPeriodChange={setCoveragePeriod}
          data={coverage}
          isLoading={coverageLoading}
          canAudit={canAudit}
        />
      )}

      {activeTab === 'asignacion' && isAdmin && (
        <AuditAssignmentTab
          auditors={assignments?.auditors ?? []}
          assets={assignments?.assets ?? []}
          isLoading={assignmentsLoading}
          onSave={async (userId, assetIds) => {
            try {
              await assetAuditsApi.saveAssignment(userId, assetIds)
              queryClient.invalidateQueries({ queryKey: assetAuditKeys.all })
              toast.success('Asignación guardada correctamente')
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Error al guardar la asignación')
            }
          }}
        />
      )}

      <ConfirmDialog
        open={showBulkConfirm}
        title={`¿Aprobar ${selectedIds.size} auditoría${selectedIds.size !== 1 ? 's' : ''}?`}
        description={
          selectedWithChangesCount > 0
            ? `Se van a aprobar ${selectedIds.size} auditorías. ${selectedWithChangesCount} de ellas tienen cambios propuestos — también se van a aplicar automáticamente al maestro. Esta acción no se puede deshacer.`
            : `Se van a aprobar ${selectedIds.size} auditoría${selectedIds.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`
        }
        confirmLabel={bulkApproving ? 'Aprobando…' : 'Aprobar'}
        danger={false}
        onConfirm={handleBulkApprove}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </PageContent>
  )
}
