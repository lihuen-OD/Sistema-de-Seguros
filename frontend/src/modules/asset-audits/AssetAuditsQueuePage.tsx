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
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { PaginationControls } from '../../shared/components/data-table/PaginationControls'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
import { MultiSelectFilter } from '../../shared/components/filters/MultiSelectFilter'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { DateRangeMonthPicker } from '../../shared/components/filters/DateRangeMonthPicker'
import { Tabs, type TabItem } from '../../shared/components/tabs/Tabs'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { AuditAssignmentTab } from '../../shared/components/audit-assignment/AuditAssignmentTab'
import { AuditStatusKpiRow } from '../../shared/components/audit-queue/AuditStatusKpiRow'
import { AuditBulkApproveBar } from '../../shared/components/audit-queue/AuditBulkApproveBar'
import { AdvancedFiltersToggleButton, AdvancedFiltersPanel } from '../../shared/components/audit-queue/AdvancedFiltersBar'
import { buildAuditPeriodColumn, buildAuditedByColumn, buildAuditDateColumn, buildAuditStatusColumn } from '../../shared/components/audit-queue/auditQueueColumns'
import { useAuditSelection } from '../../shared/hooks/useAuditSelection'
import { formatDate, fireExtinguisherLabel } from '../../shared/utils/format'
import { currentPeriod } from '../../shared/utils/period'
import { useCurrentUser } from '../../app/auth/AuthContext'
import {
  assetAuditsApi,
  assetAuditKeys,
  assetAuditQueries,
  type AssetAuditListItem,
  type AssetAuditListFilters,
} from '../../shared/api/asset-audits.api'
import { fireExtinguisherKeys } from '../../shared/api/fire-extinguishers.api'
import { catalogQueries } from '../../shared/api/catalogs.api'
import { getChecklistFields, optionLabel } from '../../shared/components/audit-wizard/checklistConfig'
import { AUDIT_STATUS_OPTIONS } from '../../shared/constants'
import { CATEGORY_LABEL } from '../../shared/constants/asset-categories'
import { ROUTES } from '../../app/routes'
import { AUDITABLE_ASSET_CATEGORIES, type TableColumn } from '../../shared/types'
import { AssetAuditCoverageTab } from './AssetAuditCoverageTab'

// Mismos labels/opciones que ya usa el detalle de la auditoría
// (ChecklistReadOnlySummary) — población 'ASSET' rotula mountingCondition
// como "Soporte / Abrazadera" en vez de "Chapa Baliza" (ver checklistConfig.ts).
// Reutilizado tal cual desde Matafuegos, sin duplicar labels/opciones.
const CHECKLIST_FIELDS = getChecklistFields('ASSET')
type ChecklistChoiceKey = 'cleanliness' | 'chargeFillStatus' | 'mountingCondition' | 'sealStatus' | 'ringStatus' | 'hoseNozzleCondition'
const CHECKLIST_CHOICE_KEYS = CHECKLIST_FIELDS.filter((f) => f.type === 'choice').map((f) => f.key) as ChecklistChoiceKey[]

// Categoría real del Asset al que está montado el matafuego — reutiliza las
// mismas constantes que ya usa el picker de "Alcance de auditoría" de este
// módulo (AUDITABLE_ASSET_CATEGORIES/CATEGORY_LABEL), sin inventar una
// lista nueva. Se excluye 'moto': un matafuego nunca queda vinculado a una
// moto (ver matchesAuditPopulation en el backend — las motos no llevan
// matafuego), así que esa opción nunca tendría resultados en Rodados.
const ASSET_CATEGORY_OPTIONS = AUDITABLE_ASSET_CATEGORIES.filter((c) => c !== 'moto').map((c) => ({
  value: c,
  label: CATEGORY_LABEL[c],
}))

const PROPOSED_CHANGES_OPTIONS = [
  { value: 'with', label: 'Con cambios propuestos' },
  { value: 'without', label: 'Sin cambios propuestos' },
]

// Paginador real — tamaño fijo por ahora, sin selector en esta fase.
const PAGE_SIZE = 25

// Envuelve un setter de filtro para que además vuelva a la página 1 — mismo
// helper que FireExtinguisherAuditsQueuePage.tsx (duplicado a propósito acá,
// no extraído todavía: se evalúa mover a shared/ recién cuando Seguros
// también lo necesite, mismo criterio de "extraer en la 3ra repetición" ya
// usado en el resto de este refactor).
function withPageReset<Args extends unknown[]>(setPage: (page: number) => void, fn: (...args: Args) => void) {
  return (...args: Args) => {
    fn(...args)
    setPage(1)
  }
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
  // Paginador real — page vuelve a 1 en cada cambio de filtro (ver
  // withPageReset), page/limit se mandan al backend como query params reales.
  const [page, setPage] = useState(1)

  // ── Filtros avanzados — se pasan al backend como query params reales (mismo
  // findAll/schema compartido, población ASSET). Con el paginador real,
  // status/búsqueda/período también son server-side. Sin filtro de
  // "Establecimiento" acá — no aplica a matafuegos montados en vehículos/maquinaria.
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [filterAuditedBy, setFilterAuditedBy] = useState<string[]>([])
  const [filterAssetCategory, setFilterAssetCategory] = useState<string[]>([])
  const [filterLocationType, setFilterLocationType] = useState<string[]>([])
  const [filterExtinguisherType, setFilterExtinguisherType] = useState<string[]>([])
  const [checklistFilters, setChecklistFilters] = useState<Partial<Record<ChecklistChoiceKey, string[]>>>({})
  const [filterProposedChanges, setFilterProposedChanges] = useState<string[]>([])

  const { data: locationTypeCatalog = [] } = useQuery(catalogQueries.byCategory('fire_ext_location_type'))
  const locationTypeOptions = useMemo(() => locationTypeCatalog.map((lt) => ({ value: lt.label, label: lt.label })), [locationTypeCatalog])

  const { data: extinguisherTypeCatalog = [] } = useQuery(catalogQueries.byCategory('fire_ext_type'))
  const extinguisherTypeOptions = useMemo(() => extinguisherTypeCatalog.map((t) => ({ value: t.label, label: t.label })), [extinguisherTypeCatalog])

  function setChecklistFilter(key: ChecklistChoiceKey, values: string[]) {
    setChecklistFilters((prev) => ({ ...prev, [key]: values }))
  }

  function clearAdvancedFilters() {
    setFilterAuditedBy([])
    setFilterAssetCategory([])
    setFilterLocationType([])
    setFilterExtinguisherType([])
    setChecklistFilters({})
    setFilterProposedChanges([])
  }

  // Handlers "con reset de página" — uno por cada control que puede cambiar
  // qué se está mirando. El paginador en sí (onPageChange) NO pasa por acá.
  const handleSearchChange = withPageReset(setPage, setSearch)
  const handleStatusChange = withPageReset(setPage, setFilterStatus)
  const handlePeriodChange = withPageReset(setPage, (from: string, to: string) => {
    setFilterDateFrom(from)
    setFilterDateTo(to)
  })
  const handleClearPeriod = withPageReset(setPage, () => {
    setFilterDateFrom('')
    setFilterDateTo('')
  })
  const handleAuditedByChange = withPageReset(setPage, setFilterAuditedBy)
  const handleAssetCategoryChange = withPageReset(setPage, setFilterAssetCategory)
  const handleLocationTypeChange = withPageReset(setPage, setFilterLocationType)
  const handleExtinguisherTypeChange = withPageReset(setPage, setFilterExtinguisherType)
  const handleChecklistFilterChange = withPageReset(setPage, setChecklistFilter)
  const handleProposedChangesChange = withPageReset(setPage, setFilterProposedChanges)
  const handleClearAdvancedFilters = withPageReset(setPage, clearAdvancedFilters)

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0
    if (filterAuditedBy.length > 0) count++
    if (filterAssetCategory.length > 0) count++
    if (filterLocationType.length > 0) count++
    if (filterExtinguisherType.length > 0) count++
    if (filterProposedChanges.length === 1) count++
    count += CHECKLIST_CHOICE_KEYS.filter((key) => (checklistFilters[key]?.length ?? 0) > 0).length
    return count
  }, [filterAuditedBy, filterAssetCategory, filterLocationType, filterExtinguisherType, filterProposedChanges, checklistFilters])

  // Única fuente de filtros server-side — la usa tanto la query paginada en
  // pantalla como la exportación (con page/limit propios cada una).
  const serverFilters = useMemo(() => {
    const f: AssetAuditListFilters = {}
    if (search.trim()) f.search = search.trim()
    if (filterStatus.length > 0) f.status = filterStatus
    if (filterDateFrom) f.auditPeriodFrom = filterDateFrom
    if (filterDateTo) f.auditPeriodTo = filterDateTo
    if (filterAuditedBy.length > 0) f.auditedBy = filterAuditedBy
    if (filterAssetCategory.length > 0) f.category = filterAssetCategory
    if (filterLocationType.length > 0) f.locationType = filterLocationType
    if (filterExtinguisherType.length > 0) f.type = filterExtinguisherType
    for (const key of CHECKLIST_CHOICE_KEYS) {
      const values = checklistFilters[key]
      if (values && values.length > 0) f[key] = values
    }
    if (filterProposedChanges.length === 1) f.hasProposedChanges = filterProposedChanges[0] === 'with'
    return f
  }, [search, filterStatus, filterDateFrom, filterDateTo, filterAuditedBy, filterAssetCategory, filterLocationType, filterExtinguisherType, checklistFilters, filterProposedChanges])

  const { data: result, isLoading, isFetching, isError } = useQuery(
    assetAuditQueries.listPaginated({ ...serverFilters, page, limit: PAGE_SIZE }),
  )
  const all = useMemo(() => result?.data ?? [], [result])
  const pagination = result?.pagination
  const statusCounts = result?.statusCounts ?? { SUBMITTED: 0, NEEDS_CORRECTION: 0, APPROVED: 0, REJECTED: 0 }
  const auditorOptions = result?.auditorOptions ?? []

  // Exporta TODO lo que matchea los filtros actuales (no solo la página
  // visible) — un solo pedido puntual al hacer clic, tope de 500. Si hay más,
  // avisa en vez de truncar en silencio.
  async function getExportRows(): Promise<AssetAuditListItem[]> {
    const exportResult = await assetAuditsApi.findAllPaginated({ ...serverFilters, page: 1, limit: 500 })
    if (exportResult.pagination.total > exportResult.data.length) {
      toast.warning(
        `Se exportaron los primeros ${exportResult.data.length} de ${exportResult.pagination.total} resultados — refiná los filtros para exportar todos.`,
      )
    }
    return exportResult.data
  }

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

  const handleToggleStatusFilter = withPageReset(setPage, (status: string) => {
    setFilterStatus((prev) => (prev.length === 1 && prev[0] === status ? [] : [status]))
  })

  const { selectedIds, setSelectedIds, isRowSelectable, toggleOne, toggleAll, clearSelection } = useAuditSelection(all)

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

  const AUDIT_COL_DEFS: TableColumn<AssetAuditListItem>[] = useMemo(() => [
    {
      id: 'extinguisher',
      key: 'extinguisher',
      label: 'Matafuego',
      sortable: true,
      sortValue: (row) => (row.extinguisher ? fireExtinguisherLabel(row.extinguisher.cylinderNumber, row.extinguisher.location, row.extinguisher.code) : null),
      // `key` no mapea a un campo plano del row (es un objeto anidado) — sin
      // esto, el export caería al fallback String(row.extinguisher).
      exportValue: (row) =>
        row.extinguisher
          ? `${fireExtinguisherLabel(row.extinguisher.cylinderNumber, row.extinguisher.location, row.extinguisher.code)} — ${row.extinguisher.type}`
          : '',
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
      id: 'asset',
      key: 'asset',
      label: 'Activo',
      sortable: true,
      sortValue: (row) => row.extinguisher?.asset?.name ?? null,
      // Tampoco hay `row.asset` a nivel raíz — vive bajo `extinguisher`.
      exportValue: (row) => (row.extinguisher?.asset ? `${row.extinguisher.asset.name} — ${row.extinguisher.asset.assetType}` : ''),
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
    buildAuditPeriodColumn<AssetAuditListItem>(),
    buildAuditedByColumn<AssetAuditListItem>(),
    buildAuditDateColumn<AssetAuditListItem>(),
    {
      id: 'proposedChangesCount',
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
    // Columnas del checklist de condición — ocultas por defecto, seleccionables
    // desde el selector de columnas existente. Generadas desde CHECKLIST_FIELDS
    // (getChecklistFields('ASSET'), misma fuente que Matafuegos con el label
    // "Soporte / Abrazadera" para esta población) para no duplicar labels/opciones.
    ...CHECKLIST_FIELDS.map((field): TableColumn<AssetAuditListItem> => {
      const rawValue = (row: AssetAuditListItem) =>
        (row.checklist as unknown as Record<string, string | null | undefined>)[field.key]
      return {
        id: field.key,
        key: field.key,
        label: field.label,
        sortable: true,
        defaultVisible: false,
        sortValue: (row) => rawValue(row) ?? null,
        exportValue: (row) => {
          const v = rawValue(row)
          return field.type === 'date' ? (v ?? '') : optionLabel(field.options, v ?? undefined)
        },
        render: (_, row) => {
          const v = rawValue(row)
          if (field.type === 'date') {
            return v ? <span className="text-sm text-slate-500 tabular-nums">{formatDate(v)}</span> : <span className="text-slate-400">—</span>
          }
          return <span className="text-sm text-slate-600">{optionLabel(field.options, v ?? undefined)}</span>
        },
      }
    }),
    buildAuditStatusColumn<AssetAuditListItem>(),
  ], [])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('asset-audits', AUDIT_COL_DEFS)

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
          <AuditStatusKpiRow counts={statusCounts} onStatusClick={handleToggleStatusFilter} />

          <SectionCard noPadding>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <SearchInput
                value={search}
                onChange={handleSearchChange}
                placeholder="Buscar por matafuego, activo o auditor…"
                className="w-full sm:w-80"
              />
              <MultiSelectFilter label="Estado" options={AUDIT_STATUS_OPTIONS} value={filterStatus} onChange={handleStatusChange} />
              <DateRangeMonthPicker
                from={filterDateFrom}
                to={filterDateTo}
                onChange={handlePeriodChange}
              />
              {(filterDateFrom || filterDateTo) && (
                <button
                  type="button"
                  onClick={handleClearPeriod}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <X size={12} />
                  Limpiar fechas
                </button>
              )}
              <AdvancedFiltersToggleButton
                active={showAdvancedFilters}
                count={activeAdvancedFilterCount}
                onClick={() => setShowAdvancedFilters((v) => !v)}
              />
              <div className="ml-auto flex items-center gap-2">
                <ExportPresetsButton
                  tableKey="asset-audits"
                  allColumns={AUDIT_COL_DEFS}
                  visibleColumns={visibleColumns}
                  filteredRows={all}
                  getExportRows={getExportRows}
                  filenamePrefix="auditorias-rodados"
                  onApplyPreset={applyPreset}
                />
                <ColumnConfigButton columnConfigs={columnConfigs} onToggle={toggle} onReorder={reorder} onReset={reset} />
              </div>
            </div>

            <AdvancedFiltersPanel show={showAdvancedFilters} activeCount={activeAdvancedFilterCount} onClear={handleClearAdvancedFilters}>
              <MultiSelectFilter label="Auditor" options={auditorOptions} value={filterAuditedBy} onChange={handleAuditedByChange} />
              <MultiSelectFilter label="Categoría de activo" options={ASSET_CATEGORY_OPTIONS} value={filterAssetCategory} onChange={handleAssetCategoryChange} />
              <MultiSelectFilter label="Tipo de ubicación" options={locationTypeOptions} value={filterLocationType} onChange={handleLocationTypeChange} />
              <MultiSelectFilter label="Tipo de matafuego" options={extinguisherTypeOptions} value={filterExtinguisherType} onChange={handleExtinguisherTypeChange} />
              {CHECKLIST_CHOICE_KEYS.map((key) => {
                const field = CHECKLIST_FIELDS.find((f) => f.key === key)!
                return (
                  <MultiSelectFilter
                    key={key}
                    label={field.label}
                    options={field.options ?? []}
                    value={checklistFilters[key] ?? []}
                    onChange={(values) => handleChecklistFilterChange(key, values)}
                  />
                )
              })}
              <MultiSelectFilter
                label="Cambios propuestos"
                options={PROPOSED_CHANGES_OPTIONS}
                value={filterProposedChanges}
                onChange={handleProposedChangesChange}
              />
            </AdvancedFiltersPanel>

            <AuditBulkApproveBar
              selectedCount={selectedIds.size}
              onApproveClick={() => setShowBulkConfirm(true)}
              onClear={clearSelection}
            />

            <DataTable
              tableKey="asset-audits"
              columns={visibleColumns}
              data={all}
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
            {pagination && (
              <PaginationControls
                page={pagination.page}
                limit={pagination.limit}
                total={pagination.total}
                totalPages={pagination.totalPages}
                isLoading={isFetching}
                onPageChange={setPage}
              />
            )}
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
