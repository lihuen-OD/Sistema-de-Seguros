import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { X, Gauge, SlidersHorizontal, CheckCircle2, XCircle } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
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
import { formatDate } from '../../shared/utils/format'
import { currentPeriod } from '../../shared/utils/period'
import { useCurrentUser } from '../../app/auth/AuthContext'
import {
  insuranceAuditsApi,
  insuranceAuditKeys,
  insuranceAuditQueries,
  type InsuranceAuditListItem,
  type InsuranceAuditListFilters,
} from '../../shared/api/insurance-audits.api'
import { FIRE_EXT_AUDIT_STATUS_LABELS } from '../../shared/constants'
import { CATEGORY_LABEL } from '../../shared/constants/asset-categories'
import { ROUTES } from '../../app/routes'
import { AUDITABLE_ASSET_CATEGORIES, type TableColumn } from '../../shared/types'
import { InsuranceAuditCoverageTab } from './InsuranceAuditCoverageTab'

const STATUS_OPTIONS = Object.entries(FIRE_EXT_AUDIT_STATUS_LABELS).map(([value, label]) => ({ value, label }))

const AUDIT_STATUS_SORT_ORDER: Record<string, number> = {
  SUBMITTED: 0,
  NEEDS_CORRECTION: 1,
  APPROVED: 2,
  REJECTED: 3,
}

// Categoría real del Asset asegurado — mismas constantes que ya usa el
// filtro equivalente de Rodados (AssetAuditsQueuePage.tsx), sin inventar
// una lista nueva. A diferencia de Rodados, acá NO se excluye "Moto": una
// moto no lleva matafuego pero sí tiene tarjeta de circulación, así que sí
// puede tener auditoría de seguros (ver classifyAuditableAssetCategory en
// el backend).
const ASSET_CATEGORY_OPTIONS = AUDITABLE_ASSET_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))

// Mismo criterio de texto que InsuranceAuditDetailPage.tsx (checklist) — no
// se inventa una redacción nueva para la columna/filtro.
const HAS_CIRCULATION_CARD_OPTIONS = [
  { value: 'yes', label: 'Tiene la tarjeta a bordo' },
  { value: 'no', label: 'No tiene la tarjeta a bordo' },
]

const HAS_COMMENTS_OPTIONS = [
  { value: 'yes', label: 'Con comentarios' },
  { value: 'no', label: 'Sin comentarios' },
]

export default function InsuranceAuditsQueuePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const isAdmin = user?.role === 'ADMIN'
  const canReview = isAdmin || (user?.modules.includes('insurance_audits') ?? false)
  const canAudit = isAdmin || (user?.modules.includes('insurance_audit_coverage') ?? false)

  const [activeTab, setActiveTab] = useState<'auditorias' | 'cobertura' | 'asignacion'>('cobertura')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [coveragePeriod, setCoveragePeriod] = useState(currentPeriod())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkApproving, setBulkApproving] = useState(false)

  // ── Filtros avanzados — mismo criterio que Matafuegos/Rodados: query params
  // reales al backend; status/búsqueda/período siguen client-side (KPI row).
  // Sin filtro de "Vehículo/Activo" ni "Patente" acá — la búsqueda de texto
  // ya cubre ambos (código/nombre/tipo/patente/chasis/motor/auditor) y un
  // multi-select sobre todos los activos elegibles no aporta sobre eso.
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [filterAuditedBy, setFilterAuditedBy] = useState<string[]>([])
  const [filterAssetCategory, setFilterAssetCategory] = useState<string[]>([])
  const [filterHasCard, setFilterHasCard] = useState<string[]>([])
  const [filterHasComments, setFilterHasComments] = useState<string[]>([])

  function clearAdvancedFilters() {
    setFilterAuditedBy([])
    setFilterAssetCategory([])
    setFilterHasCard([])
    setFilterHasComments([])
  }

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0
    if (filterAuditedBy.length > 0) count++
    if (filterAssetCategory.length > 0) count++
    if (filterHasCard.length === 1) count++
    if (filterHasComments.length === 1) count++
    return count
  }, [filterAuditedBy, filterAssetCategory, filterHasCard, filterHasComments])

  const queryFilters = useMemo(() => {
    const f: InsuranceAuditListFilters = {}
    if (filterAuditedBy.length > 0) f.auditedBy = filterAuditedBy
    if (filterAssetCategory.length > 0) f.category = filterAssetCategory
    if (filterHasCard.length === 1) f.hasCirculationCard = filterHasCard[0] === 'yes'
    if (filterHasComments.length === 1) f.hasComments = filterHasComments[0] === 'yes'
    return f
  }, [filterAuditedBy, filterAssetCategory, filterHasCard, filterHasComments])

  const { data: all = [], isLoading, isError } = useQuery(
    insuranceAuditQueries.list(Object.keys(queryFilters).length > 0 ? queryFilters : undefined),
  )

  // Auditores derivados de las auditorías ya cargadas — mismo criterio que
  // Matafuegos/Rodados (auditedBy no tiene catálogo propio).
  const auditorOptions = useMemo(() => {
    const names = new Set(all.map((a) => a.auditedBy).filter(Boolean))
    return [...names].sort().map((name) => ({ value: name, label: name }))
  }, [all])

  const { data: coverage = [], isLoading: coverageLoading } = useQuery(insuranceAuditQueries.coverage(coveragePeriod))
  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    ...insuranceAuditQueries.assignments(),
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
        [a.asset?.code, a.asset?.name, a.asset?.assetType, a.asset?.plate, a.asset?.chassisNumber, a.asset?.engineNumber, a.auditedBy]
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

  const AUDIT_COL_DEFS: TableColumn<InsuranceAuditListItem>[] = useMemo(() => [
    {
      id: 'asset',
      key: 'asset',
      label: 'Activo',
      sortable: true,
      sortValue: (row) => row.asset?.name ?? null,
      // `row.asset` es un objeto — sin esto, el export caería al fallback
      // String(row.asset) ("[object Object]").
      exportValue: (row) => (row.asset ? [row.asset.name, row.asset.assetType, row.asset.code, row.asset.plate].filter(Boolean).join(' — ') : ''),
      render: (_, row) =>
        row.asset ? (
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-800">{row.asset.name}</p>
            <p className="text-xs text-slate-500">{row.asset.assetType}</p>
            <p className="text-xs text-slate-400 font-mono">
              {row.asset.code ?? '—'}
              {row.asset.plate ? ` · ${row.asset.plate}` : ''}
            </p>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { id: 'auditPeriod', key: 'auditPeriod', label: 'Período', sortable: true, render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    { id: 'auditedBy', key: 'auditedBy', label: 'Auditor', sortable: true, render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    { id: 'auditDate', key: 'auditDate', label: 'Fecha', sortable: true, render: (v) => <span className="text-sm text-slate-500 tabular-nums">{formatDate(v as string)}</span> },
    // Columnas del checklist de Seguros — ocultas por defecto, seleccionables
    // desde el selector de columnas existente. Checklist más chico que
    // Matafuegos/Rodados (2 campos), sin config compartida que reutilizar acá
    // (InsuranceAuditDetailPage.tsx tampoco pasa por checklistConfig.ts) —
    // mismo texto/íconos que ya usa esa pantalla, para no inventar una
    // redacción nueva.
    {
      id: 'hasCirculationCard',
      key: 'hasCirculationCard',
      label: 'Tiene tarjeta de circulación',
      sortable: true,
      defaultVisible: false,
      sortValue: (row) => (row.checklist.hasCirculationCard ? 1 : 0),
      exportValue: (row) => (row.checklist.hasCirculationCard ? 'Tiene la tarjeta a bordo' : 'No tiene la tarjeta a bordo'),
      render: (_, row) => (
        <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          {row.checklist.hasCirculationCard ? (
            <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
          ) : (
            <XCircle size={14} className="text-red-500 flex-shrink-0" />
          )}
          {row.checklist.hasCirculationCard ? 'Tiene la tarjeta a bordo' : 'No tiene la tarjeta a bordo'}
        </span>
      ),
    },
    {
      id: 'comments',
      key: 'comments',
      label: 'Comentarios',
      sortable: true,
      defaultVisible: false,
      sortValue: (row) => row.checklist.comments ?? null,
      exportValue: (row) => row.checklist.comments ?? '',
      render: (_, row) =>
        row.checklist.comments ? (
          <span className="block text-sm text-slate-600 truncate max-w-xs" title={row.checklist.comments}>
            {row.checklist.comments}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      id: 'plate',
      key: 'plate',
      label: 'Patente',
      sortable: true,
      defaultVisible: false,
      sortValue: (row) => row.asset?.plate ?? null,
      exportValue: (row) => row.asset?.plate ?? '',
      render: (_, row) => <span className="text-sm text-slate-600 font-mono">{row.asset?.plate ?? '—'}</span>,
    },
    {
      id: 'chassisNumber',
      key: 'chassisNumber',
      label: 'Número de chasis',
      sortable: true,
      defaultVisible: false,
      sortValue: (row) => row.asset?.chassisNumber ?? null,
      exportValue: (row) => row.asset?.chassisNumber ?? '',
      render: (_, row) => <span className="text-sm text-slate-600 font-mono">{row.asset?.chassisNumber ?? '—'}</span>,
    },
    {
      id: 'engineNumber',
      key: 'engineNumber',
      label: 'Número de motor',
      sortable: true,
      defaultVisible: false,
      sortValue: (row) => row.asset?.engineNumber ?? null,
      exportValue: (row) => row.asset?.engineNumber ?? '',
      render: (_, row) => <span className="text-sm text-slate-600 font-mono">{row.asset?.engineNumber ?? '—'}</span>,
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      sortable: true,
      sortValue: (row) => AUDIT_STATUS_SORT_ORDER[row.status] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ], [])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('insurance-audits', AUDIT_COL_DEFS)

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
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as 'auditorias' | 'cobertura' | 'asignacion')} />
        </SectionCard>
      )}

      {activeTab === 'auditorias' && canReview && (
        <>
          <AuditStatusKpiRow
            counts={counts}
            onStatusClick={toggleStatusFilter}
            approvedDescription="Auditoría validada"
            rejectedDescription="Auditoría descartada"
          />

          <SectionCard noPadding>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por activo, tipo, patente, chasis, motor o auditor…" className="w-full sm:w-80" />
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
              <button
                type="button"
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  showAdvancedFilters || activeAdvancedFilterCount > 0
                    ? 'bg-brand-50 border-brand-300 text-brand-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <SlidersHorizontal size={14} />
                <span>Filtros avanzados{activeAdvancedFilterCount > 0 ? ` · ${activeAdvancedFilterCount}` : ''}</span>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length} de {all.length} auditorías</span>
                <ExportPresetsButton
                  tableKey="insurance-audits"
                  allColumns={AUDIT_COL_DEFS}
                  visibleColumns={visibleColumns}
                  filteredRows={filtered}
                  filenamePrefix="auditorias-seguros"
                  onApplyPreset={applyPreset}
                />
                <ColumnConfigButton columnConfigs={columnConfigs} onToggle={toggle} onReorder={reorder} onReset={reset} />
              </div>
            </div>

            {showAdvancedFilters && (
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/60">
                <MultiSelectFilter label="Auditor" options={auditorOptions} value={filterAuditedBy} onChange={setFilterAuditedBy} />
                <MultiSelectFilter label="Categoría de activo" options={ASSET_CATEGORY_OPTIONS} value={filterAssetCategory} onChange={setFilterAssetCategory} />
                <MultiSelectFilter label="Tarjeta de circulación" options={HAS_CIRCULATION_CARD_OPTIONS} value={filterHasCard} onChange={setFilterHasCard} />
                <MultiSelectFilter label="Comentarios" options={HAS_COMMENTS_OPTIONS} value={filterHasComments} onChange={setFilterHasComments} />
                {activeAdvancedFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={clearAdvancedFilters}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                  >
                    <X size={12} />
                    Limpiar filtros avanzados
                  </button>
                )}
              </div>
            )}

            <AuditBulkApproveBar
              selectedCount={selectedIds.size}
              onApproveClick={() => setShowBulkConfirm(true)}
              onClear={clearSelection}
            />

            <DataTable
              tableKey="insurance-audits"
              columns={visibleColumns}
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
        <InsuranceAuditCoverageTab
          period={coveragePeriod}
          onPeriodChange={setCoveragePeriod}
          data={coverage}
          isLoading={coverageLoading}
          canAudit={canAudit}
          canReview={canReview}
        />
      )}

      {activeTab === 'asignacion' && isAdmin && (
        <AuditAssignmentTab
          auditors={assignments?.auditors ?? []}
          assets={assignments?.assets ?? []}
          isLoading={assignmentsLoading}
          onSave={async (userId, assetIds) => {
            try {
              await insuranceAuditsApi.saveAssignment(userId, assetIds)
              queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
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
        description={`Se van a aprobar ${selectedIds.size} auditoría${selectedIds.size !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`}
        confirmLabel={bulkApproving ? 'Aprobando…' : 'Aprobar'}
        danger={false}
        onConfirm={handleBulkApprove}
        onCancel={() => setShowBulkConfirm(false)}
      />
    </PageContent>
  )
}
