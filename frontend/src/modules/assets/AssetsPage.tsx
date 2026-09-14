import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, DollarSign, AlertTriangle, Archive, Eye, Trash2 } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { PaginationControls } from '../../shared/components/data-table/PaginationControls'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { formatCurrencyFull, formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { assetsApi, assetKeys, assetQueries } from '../../shared/api/assets.api'
import { companyQueries } from '../../shared/api/companies.api'
import { costCenterQueries } from '../../shared/api/cost-centers.api'
import { claimKeys } from '../../shared/api/claims.api'
import { policyKeys } from '../../shared/api/policies.api'
import { fireExtinguisherKeys } from '../../shared/api/fire-extinguishers.api'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { ASSET_TYPES } from '../../shared/constants'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
import type { Asset, TableColumn } from '../../shared/types'

const TYPE_OPTIONS = ASSET_TYPES.map((t) => ({ value: t, label: t }))
const DEFAULT_PAGE_SIZE = 20

export default function AssetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deBajaId, setDeBajaId] = useState<string | null>(null)

  const { data: result, isLoading, isFetching, isError } = useQuery(assetQueries.listPaginated({
    page,
    limit,
    search: search.trim() || undefined,
    assetType: filterType || undefined,
  }))
  const allAssets = useMemo(() => result?.data ?? [], [result?.data])
  const pagination = result?.pagination
  const { data: allCompanies = [] } = useQuery(companyQueries.list())
  const { data: allCostCenters = [] } = useQuery(costCenterQueries.list())

  async function handleDeBaja(id: string) {
    await assetsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: assetKeys.all })
    setDeBajaId(null)
  }

  async function handleDelete(id: string) {
    await assetsApi.hardDelete(id)
    queryClient.invalidateQueries({ queryKey: assetKeys.all })
    // Eliminar el activo desvincula (sin borrarlos) los siniestros, líneas de
    // póliza y matafuegos que lo referenciaban — sin esto, esas pantallas
    // seguían mostrando el vínculo viejo si ya estaban cacheadas.
    queryClient.invalidateQueries({ queryKey: claimKeys.all })
    queryClient.invalidateQueries({ queryKey: policyKeys.all })
    queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
    setDeleteId(null)
  }

  const filtered = allAssets

  const { active, baja, vendido, totalValueUsd } = useMemo(() => {
    const active = allAssets.filter((a) => a.status === 'activo')
    return {
      active,
      baja: allAssets.filter((a) => a.status === 'baja'),
      vendido: allAssets.filter((a) => a.status === 'vendido'),
      totalValueUsd: active.reduce((s, a) => s + (a.patrimonialValueUsd ?? 0), 0),
    }
  }, [allAssets])

  const companyNameById = useMemo(() => new Map(allCompanies.map((c) => [c.id, c.name])), [allCompanies])
  const costCenterById = useMemo(
    () => new Map(allCostCenters.map((cc) => [cc.id, { code: cc.code, name: cc.name }])),
    [allCostCenters],
  )

  const ALL_COLUMNS: TableColumn<Asset>[] = useMemo(() => [
    {
      id: 'internalCode',
      key: 'internalCode',
      label: 'Código',
      defaultVisible: true,
      sortable: true,
      className: 'font-mono text-slate-600',
    },
    {
      id: 'name',
      key: 'name',
      label: 'Nombre',
      defaultVisible: true,
      sortable: true,
      exportValue: (row) => `${row.name} (${row.brand} ${row.model}${row.year > 0 ? ` ${row.year}` : ''})`.trim(),
      render: (_, row) => (
        <div className="min-w-0 max-w-[220px]">
          <OverflowCell value={row.name} lines={1} className="font-medium text-slate-800 text-sm" />
          <OverflowCell
            value={`${row.brand} ${row.model}${row.year > 0 ? ` — ${row.year}` : ''}`.trim()}
            lines={1}
            className="text-xs text-slate-400 mt-0.5"
          />
        </div>
      ),
    },
    {
      id: 'assetType',
      key: 'assetType',
      label: 'Tipo',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-slate-600 whitespace-normal">{String(v)}</span>,
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      sortable: true,
      render: (v) => <StatusPill status={v as string} />,
    },
    {
      id: 'companyId',
      key: 'companyId',
      label: 'Empresa',
      defaultVisible: true,
      sortable: true,
      sortValue: (row) => companyNameById.get(row.companyId) ?? null,
      exportValue: (row) => companyNameById.get(row.companyId) ?? '',
      render: (v) => {
        const name = v ? companyNameById.get(v as string) : null
        return <span className="text-slate-600 text-xs">{name ?? '—'}</span>
      },
    },
    {
      id: 'costCenterId',
      key: 'costCenterId',
      label: 'C. Costo',
      defaultVisible: true,
      sortable: true,
      sortValue: (row) => costCenterById.get(row.costCenterId)?.code ?? null,
      exportValue: (row) => costCenterById.get(row.costCenterId)?.code ?? '',
      render: (v) => {
        const cc = v ? costCenterById.get(v as string) : null
        return <span className="text-slate-500 text-xs">{cc?.code ?? '—'}</span>
      },
    },
    {
      id: 'patrimonialValueUsd',
      key: 'patrimonialValueUsd',
      label: 'Valor (USD)',
      defaultVisible: true,
      sortable: true,
      exportValue: (row) => row.patrimonialValueUsd != null ? String(row.patrimonialValueUsd) : '',
      render: (v) =>
        v != null
          ? <span className="font-semibold text-slate-800 tabular-nums">{formatCurrencyFull(v as number, 'USD')}</span>
          : <span className="text-slate-400">Sin valuar</span>,
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'valuationDate',
      key: 'valuationDate',
      label: 'Valuación',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-slate-500 text-xs">{formatDate(v as string)}</span>,
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'brand',
      key: 'brand',
      label: 'Marca',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'model',
      key: 'model',
      label: 'Modelo',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'year',
      key: 'year',
      label: 'Año',
      defaultVisible: false,
      sortable: true,
      exportValue: (row) => row.year > 0 ? String(row.year) : '',
      render: (v) => <span className="tabular-nums text-slate-600">{(v as number) > 0 ? String(v) : '—'}</span>,
      className: 'text-center',
      headerClassName: 'text-center',
    },
    {
      id: 'serialNumber',
      key: 'serialNumber',
      label: 'N° de Serie',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="font-mono text-xs text-slate-600">{(v as string) || '—'}</span>,
    },
    {
      id: 'chassisNumber',
      key: 'chassisNumber',
      label: 'N° Chasis',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="font-mono text-xs text-slate-600">{(v as string) || '—'}</span>,
    },
    {
      id: 'plate',
      key: 'plate',
      label: 'Patente',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="font-mono text-xs text-slate-600">{(v as string) || '—'}</span>,
    },
    {
      id: 'engineNumber',
      key: 'engineNumber',
      label: 'N° Motor',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="font-mono text-xs text-slate-600">{(v as string) || '—'}</span>,
    },
    {
      id: 'fixedAssetCode',
      key: 'fixedAssetId',
      label: 'Bien de Uso',
      defaultVisible: false,
      sortable: true,
      sortValue: (row) => row.fixedAsset?.name ?? null,
      render: (_, row) =>
        row.fixedAsset ? (
          <div className="min-w-0">
            <OverflowCell value={row.fixedAsset.name} lines={1} className="text-xs text-slate-700" />
            <span className="block text-[10px] text-slate-400 font-mono">{row.fixedAsset.code}</span>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      exportValue: (row) => (row.fixedAsset ? `${row.fixedAsset.name} (${row.fixedAsset.code})` : ''),
    },
    {
      id: 'patrimonialValueNew',
      key: 'patrimonialValueNew',
      label: 'Valor a Nuevo (USD)',
      defaultVisible: false,
      sortable: true,
      // patrimonialValueNew es el valor crudo en la moneda del activo (puede
      // ser ARS) — para esta columna, que se anuncia en USD, prioriza el
      // cierre en dólares (ver mismo criterio en assets.api.ts#mapAsset).
      sortValue: (row) => row.patrimonialValueNewUsd ?? row.patrimonialValueNew ?? null,
      exportValue: (row) => {
        const v = row.patrimonialValueNewUsd ?? row.patrimonialValueNew
        return v != null ? String(v) : ''
      },
      render: (_, row) => {
        const v = row.patrimonialValueNewUsd ?? row.patrimonialValueNew
        return v != null && v > 0
          ? <span className="font-semibold tabular-nums text-slate-700">{formatCurrencyFull(v, 'USD')}</span>
          : <span className="text-slate-400">—</span>
      },
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'costCenterName',
      key: 'costCenterId',
      label: 'Centro de costo',
      defaultVisible: false,
      sortable: true,
      // Distinta de la columna "C. Costo" (que ordena por código): acá el
      // diferencial de esta columna es el nombre, así que ordena por nombre.
      sortValue: (row) => costCenterById.get(row.costCenterId)?.name ?? null,
      exportValue: (row) => {
        const cc = costCenterById.get(row.costCenterId)
        return cc ? `${cc.code} — ${cc.name}` : ''
      },
      render: (v) => {
        const cc = v ? costCenterById.get(v as string) : null
        return cc
          ? <span className="text-xs text-slate-600">{cc.code} — {cc.name}</span>
          : <span className="text-slate-400">—</span>
      },
    },
    {
      id: 'productiveUnit',
      key: 'productiveUnit',
      label: 'Unidad Productiva',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'area',
      key: 'area',
      label: 'Área',
      defaultVisible: false,
      sortable: true,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'dischargeDate',
      key: 'dischargeDate',
      label: 'Fecha de baja',
      defaultVisible: false,
      sortable: true,
      render: (v) =>
        v
          ? <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'saleDate',
      key: 'saleDate',
      label: 'Fecha de venta',
      defaultVisible: false,
      sortable: true,
      render: (v) =>
        v
          ? <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'attachmentsCount',
      key: 'attachmentsCount',
      label: 'Adjuntos',
      defaultVisible: false,
      sortable: true,
      exportValue: (row) => String(row.attachmentsCount ?? 0),
      render: (v) => {
        const n = v as number | undefined
        return n != null && n > 0
          ? <span className="text-sm font-medium text-slate-700">{n}</span>
          : <span className="text-slate-400">—</span>
      },
      className: 'text-center',
      headerClassName: 'text-center',
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
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/assets/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeBajaId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Dar de baja"
            aria-label="Dar de baja"
          >
            <Archive size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar activo"
            aria-label="Eliminar activo"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      className: 'w-28',
    },
  ], [companyNameById, costCenterById, navigate])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('assets', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Gestión de Activos"
        subtitle="Inventario patrimonial y bienes de uso"
        actions={
          <button
            onClick={() => navigate('/assets/new')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Activo
          </button>
        }
      />

      <MetricGrid cols={4} className="mb-6">
        <KpiCard label="Activos Totales" value={pagination?.total ?? 0} description={`${active.length} operativos en esta página`} icon={Package} variant="info" />
        <KpiCard label="Valor Patrimonial" value={formatCurrencyCompact(totalValueUsd, 'USD')} description="Activos operativos de esta página" icon={DollarSign} variant="success" />
        <KpiCard label="Dados de Baja" value={baja.length} description="En esta página" icon={AlertTriangle} variant={baja.length > 0 ? 'warning' : 'default'} />
        <KpiCard label="Vendidos" value={vendido.length} description="En esta página" icon={Archive} variant="default" />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(value) => { setPage(1); setSearch(value) }}
            placeholder="Buscar por código, nombre, marca, modelo, tipo, patente, chasis, motor o N° de serie…"
            className="w-full sm:w-72"
          />
          <FilterBar filters={[{
            key: 'type', label: 'Tipo', options: TYPE_OPTIONS, value: filterType,
            onChange: (value) => { setPage(1); setFilterType(value) },
          }]} />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} visibles en esta página · {pagination?.total ?? 0} resultados
            </span>
            <ExportPresetsButton
              tableKey="assets"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="activos"
              onApplyPreset={applyPreset}
            />
            <span className="text-[11px] text-slate-400">Ordena y exporta la página actual</span>
            <ColumnConfigButton
              columnConfigs={columnConfigs}
              onToggle={toggle}
              onReorder={reorder}
              onReset={reset}
            />
          </div>
        </div>
        <DataTable
          tableKey="assets"
          columns={visibleColumns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          onRowClick={(row) => navigate(`/assets/${row.id}`)}
          emptyTitle="Sin activos"
          emptyDescription="No se encontraron activos con los filtros aplicados."
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
        title="Eliminar activo"
        description={`¿Eliminar el activo "${allAssets.find((a) => a.id === deleteId)?.name ?? ''}" de forma permanente? Esta acción no se puede deshacer. Se van a eliminar sus imputaciones, historial de valuación, adjuntos y auditorías de seguros, y se va a desvincular (sin borrarlos) de los siniestros, matafuegos y líneas de póliza que lo referencian — esos registros quedan, pero sin este activo asociado.`}
        confirmLabel="Eliminar definitivamente"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={deBajaId !== null}
        title="Dar de baja"
        description={`¿Dar de baja a "${allAssets.find((a) => a.id === deBajaId)?.name ?? 'este activo'}"? El activo quedará inactivo y se registrará en el historial. Podés reactivarlo más adelante.`}
        confirmLabel="Dar de baja"
        onConfirm={() => deBajaId && handleDeBaja(deBajaId)}
        onCancel={() => setDeBajaId(null)}
      />
    </PageContent>
  )
}
