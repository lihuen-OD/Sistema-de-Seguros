import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ShieldAlert, ClipboardList, CheckCircle2, Eye, Edit2, Trash2,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { ChartCard } from '../../shared/components/cards/ChartCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { PaginationControls } from '../../shared/components/data-table/PaginationControls'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { claimsApi, claimKeys, claimQueries } from '../../shared/api/claims.api'
import { toSortParams } from '../../shared/api/pagination'
import { assetQueries } from '../../shared/api/assets.api'
import { policyQueries } from '../../shared/api/policies.api'
import { catalogQueries } from '../../shared/api/catalogs.api'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { LoadingState } from '../../shared/components/empty-states/LoadingState'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import {
  normalizeClaimStatusText, resolveClaimStatusKey,
  getClaimStatusIcon, getClaimStatusChartColor,
} from '../../shared/utils/claimStatus'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
import type { Claim, SortState, TableColumn } from '../../shared/types'

const DEFAULT_PAGE_SIZE = 20

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClaimsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState<SortState | null>(null)
  const queryClient = useQueryClient()

  const { data: result, isLoading, isFetching, isError } = useQuery(claimQueries.listPaginated({
    page,
    limit,
    search: search.trim() || undefined,
    status: filterStatus ? normalizeClaimStatusText(filterStatus) : undefined,
    claimType: filterType || undefined,
    ...toSortParams(sort),
    includeSummary: true,
  }))
  const all = useMemo(() => result?.data ?? [], [result?.data])
  const pagination = result?.pagination
  // Montos sobre todo el resultado filtrado y distribución por estado (estados
  // reales, dinámicos) ignorando solo el filtro de estado — ambos del backend.
  const summary = result?.summary
  const summaryHint = isFetching ? 'Calculando…' : 'No disponible'
  const { data: allAssets = [] } = useQuery(assetQueries.list())
  const { data: allPolicies = [] } = useQuery(policyQueries.list())
  const { data: claimStatusCatalog = [] } = useQuery(catalogQueries.byCategory('claim_status'))

  const TYPE_OPTIONS = useMemo(() => {
    const unique = [...new Set(all.map((c) => c.claimType))].sort()
    return unique.map((v) => ({ value: v, label: v }))
  }, [all])

  // Estados reales para el filtro — primero los del catálogo (respeta su
  // sortOrder), después cualquier valor presente en los siniestros cargados
  // que el catálogo no contemple (ej. quedó de un estado ya renombrado/
  // borrado del catálogo pero sigue en datos viejos). Nunca una lista fija:
  // si el admin agrega "En pericia" al catálogo, aparece acá solo.
  const STATUS_OPTIONS = useMemo(() => {
    const seen = new Set<string>()
    const options: { value: string; label: string }[] = []
    for (const item of [...claimStatusCatalog].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const key = normalizeClaimStatusText(item.label)
      if (!key || seen.has(key)) continue
      seen.add(key)
      options.push({ value: item.label, label: item.label })
    }
    for (const c of all) {
      const key = normalizeClaimStatusText(c.status)
      if (!key || seen.has(key)) continue
      seen.add(key)
      options.push({ value: c.status, label: c.status })
    }
    return options
  }, [claimStatusCatalog, all])

  async function handleDelete(id: string) {
    await claimsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: claimKeys.all })
    setDeleteId(null)
  }

  // Distribución real por estado — el backend agrupa por el texto tal cual
  // está en cada siniestro (nunca se relabelea ni se inventa una categoría),
  // ya ordenada de mayor a menor para el gráfico "Siniestros por estado".
  const statusDistribution = useMemo(() => {
    const total = summary?.statusTotal ?? 0
    return (summary?.byStatus ?? []).map(({ status, count }) => ({
      status,
      count,
      pct: total > 0 ? (count / total) * 100 : 0,
    }))
  }, [summary])
  const topStatus = statusDistribution[0] ?? null

  const assetById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets])
  const policyById = useMemo(() => new Map(allPolicies.map((p) => [p.id, p])), [allPolicies])

  const filtered = all

  const ALL_COLUMNS: TableColumn<Claim>[] = useMemo(() => [
    {
      id: 'claimNumber',
      key: 'claimNumber',
      label: 'N° Siniestro',
      defaultVisible: true,
      sortable: true,
      className: 'font-mono text-xs text-slate-600 min-w-[140px]',
    },
    {
      id: 'title',
      key: 'title',
      label: 'Título',
      defaultVisible: true,
      sortable: true,
      render: (v) => v ? <OverflowCell value={v as string} lines={1} className="text-sm text-slate-700 max-w-[220px]" /> : <span className="text-xs text-slate-400">—</span>,
    },
    {
      id: 'claimType',
      key: 'claimType',
      label: 'Tipo',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-sm text-slate-800 font-medium">{String(v)}</span>,
    },
    {
      id: 'assetId',
      key: 'assetId',
      label: 'Activo',
      defaultVisible: true,
      sortable: true,
      exportValue: (row) => {
        const a = row.assetId ? assetById.get(row.assetId) : null
        return a ? `${a.name} (${a.internalCode})` : ''
      },
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400">—</span>
        const asset = assetById.get(v as string)
        if (!asset) return <span className="text-xs text-slate-400">—</span>
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/assets/${v}`) }}
            className="text-left block min-w-0 max-w-[200px] group"
          >
            <OverflowCell value={asset.name} lines={1} className="text-xs text-brand-600 group-hover:underline" />
            <OverflowCell value={asset.internalCode} lines={1} className="text-slate-400 font-mono text-[10px] mt-0.5" />
          </button>
        )
      },
    },
    {
      id: 'policyId',
      key: 'policyId',
      label: 'Póliza',
      defaultVisible: true,
      sortable: true,
      exportValue: (row) => {
        const p = row.policyId ? policyById.get(row.policyId) : null
        return p?.policyNumber ?? ''
      },
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400">—</span>
        const pol = policyById.get(v as string)
        return pol
          ? <span className="text-xs font-mono text-slate-600">{pol.policyNumber}</span>
          : <span className="text-xs text-slate-400">—</span>
      },
    },
    {
      id: 'occurrenceDate',
      key: 'occurrenceDate',
      label: 'Fecha hecho',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      id: 'insuranceCompany',
      key: 'insuranceCompany',
      label: 'Aseguradora',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-600">{String(v)}</span>,
    },
    {
      id: 'claimedAmountArs',
      key: 'claimedAmountArs',
      label: 'Reclamado',
      defaultVisible: true,
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => String(row.claimedAmountArs),
      render: (v) => (
        <span className="text-sm font-semibold text-slate-800 tabular-nums">
          {formatCurrencyCompact(v as number, 'ARS')}
        </span>
      ),
    },
    {
      id: 'settledAmountArs',
      key: 'settledAmountArs',
      label: 'Liquidado',
      defaultVisible: true,
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => row.settledAmountArs != null ? String(row.settledAmountArs) : '',
      render: (v) =>
        v != null ? (
          <span className="text-sm font-semibold text-emerald-700 tabular-nums">
            {formatCurrencyCompact(v as number, 'ARS')}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      sortable: true,
      render: (v) => (
        <StatusPill status={resolveClaimStatusKey(String(v))} label={String(v)} icon={getClaimStatusIcon(String(v))} size="sm" />
      ),
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'reportDate',
      key: 'reportDate',
      label: 'Fecha denuncia',
      defaultVisible: false,
      sortable: true,
      render: (v) =>
        v
          ? <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'realAmountArs',
      key: 'realAmountArs',
      label: 'Monto real ARS',
      defaultVisible: false,
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => row.realAmountArs != null ? String(row.realAmountArs) : '',
      render: (v) =>
        v != null && (v as number) > 0
          ? <span className="tabular-nums text-slate-700">{formatCurrencyCompact(v as number, 'ARS')}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'deductibleArs',
      key: 'deductibleArs',
      label: 'Franquicia ARS',
      defaultVisible: false,
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => row.deductibleArs != null ? String(row.deductibleArs) : '',
      render: (v) =>
        v != null && (v as number) > 0
          ? <span className="tabular-nums text-slate-700">{formatCurrencyCompact(v as number, 'ARS')}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'currency',
      key: 'currency',
      label: 'Moneda',
      defaultVisible: false,
      sortable: true,
      render: (v) =>
        v
          ? <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{String(v)}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'description',
      key: 'description',
      label: 'Descripción',
      defaultVisible: false,
      sortable: true,
      render: (v) => (
        <div className="max-w-[200px]">
          <OverflowCell value={(v as string) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      id: 'observations',
      key: 'observations',
      label: 'Observaciones',
      defaultVisible: false,
      sortable: true,
      render: (v) => (
        <div className="max-w-[200px]">
          <OverflowCell value={(v as string) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      label: 'Fecha de alta',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    // ── Acciones ────────────────────────────────────────────────────────────────
    {
      id: 'actions',
      key: 'id',
      label: '',
      hideable: false,
      className: 'w-20',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/claims/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/claims/${row.id}/edit`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Editar"
            aria-label="Editar"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar siniestro"
            aria-label="Eliminar siniestro"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ], [navigate, assetById, policyById])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('claims', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Siniestros"
        subtitle="Gestión y seguimiento de siniestros asociados a activos y pólizas"
        actions={
          <button
            onClick={() => navigate('/claims/new')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Siniestro
          </button>
        }
      />

      <MetricGrid cols={3} className="mb-5">
        <KpiCard label="Total de Siniestros" value={pagination?.total ?? 0} description="Resultados del listado" icon={ClipboardList} variant="info" />
        <KpiCard label="Monto Reclamado" value={summary ? formatCurrencyCompact(summary.totalClaimedArs, 'ARS') : '—'} description={summary ? 'Total de los resultados' : summaryHint} icon={ShieldAlert} variant="info" />
        <KpiCard label="Monto Liquidado" value={summary ? formatCurrencyCompact(summary.totalSettledArs, 'ARS') : '—'} description={summary ? 'Total de los resultados' : summaryHint} icon={CheckCircle2} variant={summary?.totalSettledArs ? 'success' : 'default'} />
      </MetricGrid>

      <ChartCard
        title="Siniestros por estado"
        subtitle={
          topStatus
            ? `Estado más frecuente: "${topStatus.status}" — ${topStatus.count} (${topStatus.pct.toFixed(0)}%)`
            : 'Distribución de los siniestros con los filtros aplicados (sin el filtro de estado)'
        }
        className="mb-5"
        height={statusDistribution.length > 0 ? Math.max(220, statusDistribution.length * 52 + 24) : 200}
      >
        {!summary ? (
          <LoadingState rows={3} />
        ) : statusDistribution.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              title="Sin siniestros"
              description="No hay siniestros con los filtros aplicados para mostrar la distribución por estado."
              icon={ShieldAlert}
            />
          </div>
        ) : (
          // Barras propias en HTML/CSS en vez de Recharts — con estados
          // dinámicos (el admin agrega los que quiera) el alto por fila queda
          // bajo control directo acá, sin depender de que ResponsiveContainer
          // reparta bien el espacio disponible entre categorías (ahí es
          // donde Recharts venía quedando apretado/desalineado).
          <div className="h-full overflow-y-auto pr-1 space-y-2.5">
            {statusDistribution.map((item) => {
              const barPct = topStatus && topStatus.count > 0 ? (item.count / topStatus.count) * 100 : 0
              const color = getClaimStatusChartColor(item.status)
              return (
                <div
                  key={item.status}
                  className="grid grid-cols-[6rem_1fr_auto] sm:grid-cols-[9rem_1fr_auto] lg:grid-cols-[11rem_1fr_auto] items-center gap-3 sm:gap-4 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-700 truncate" title={item.status}>
                    {item.status}
                  </span>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(barPct, 4)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 tabular-nums whitespace-nowrap text-right">
                    {item.count} · {item.pct.toFixed(0)}%
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </ChartCard>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(value) => { setPage(1); setSearch(value) }}
            placeholder="Buscar por N° siniestro, activo, aseguradora…"
            className="w-full sm:w-80"
          />
          <FilterBar filters={[
            {
              key: 'status', label: 'Estado', options: STATUS_OPTIONS, value: filterStatus,
              onChange: (value) => { setPage(1); setFilterStatus(value) },
            },
            {
              key: 'type', label: 'Tipo', options: TYPE_OPTIONS, value: filterType,
              onChange: (value) => { setPage(1); setFilterType(value) },
            },
          ]} />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} visibles en esta página · {pagination?.total ?? 0} resultados
            </span>
            <ExportPresetsButton
              tableKey="claims"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="siniestros"
              onApplyPreset={applyPreset}
            />
            <span className="text-[11px] text-slate-400">Exporta la página actual</span>
            <ColumnConfigButton
              columnConfigs={columnConfigs}
              onToggle={toggle}
              onReorder={reorder}
              onReset={reset}
            />
          </div>
        </div>
        <DataTable
          tableKey="claims"
          columns={visibleColumns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          onRowClick={(row) => navigate(`/claims/${row.id}`)}
          emptyTitle="Sin siniestros"
          emptyDescription="No se encontraron siniestros con los filtros aplicados."
          sort={sort}
          onSortChange={(next) => { setPage(1); setSort(next) }}
          minWidth={900}
        />
        {pagination && (
          <PaginationControls
            {...pagination}
            isLoading={isFetching}
            onPageChange={setPage}
            onLimitChange={(nextLimit) => {
              setPage(1)
              setLimit(nextLimit)
            }}
          />
        )}
      </SectionCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar siniestro"
        description={`¿Eliminar el siniestro "${all.find((c) => c.id === deleteId)?.claimNumber ?? ''}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
