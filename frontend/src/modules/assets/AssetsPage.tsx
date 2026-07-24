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
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { MultiSelectFilter } from '../../shared/components/filters/MultiSelectFilter'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { formatCurrencyFull, formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { assetsApi, assetKeys, assetQueries } from '../../shared/api/assets.api'
import { companyQueries } from '../../shared/api/companies.api'
import { costCenterQueries } from '../../shared/api/cost-centers.api'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { ASSET_TYPES, ASSET_STATUS_LABELS } from '../../shared/constants'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
import type { Asset, TableColumn } from '../../shared/types'

const STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const TYPE_OPTIONS = ASSET_TYPES.map((t) => ({ value: t, label: t }))

export default function AssetsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterType, setFilterType] = useState<string[]>([])
  const [filterCompany, setFilterCompany] = useState<string[]>([])
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: allAssets = [], isLoading, isError } = useQuery(assetQueries.list())
  const { data: allCompanies = [] } = useQuery(companyQueries.list())
  const { data: allCostCenters = [] } = useQuery(costCenterQueries.list())

  async function handleDelete(id: string) {
    await assetsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: assetKeys.all })
    setDeleteId(null)
  }

  const filtered = useMemo(() => {
    return allAssets.filter((a) => {
      const matchSearch =
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.internalCode.toLowerCase().includes(search.toLowerCase()) ||
        a.brand.toLowerCase().includes(search.toLowerCase())
      const matchStatus = filterStatus.length === 0 || filterStatus.includes(a.status)
      const matchType = filterType.length === 0 || filterType.includes(a.assetType)
      const matchCompany = filterCompany.length === 0 || filterCompany.includes(a.companyId)
      return matchSearch && matchStatus && matchType && matchCompany
    })
  }, [allAssets, search, filterStatus, filterType, filterCompany])

  const { active, baja, vendido, totalValueUsd } = useMemo(() => {
    const active = allAssets.filter((a) => a.status === 'activo')
    return {
      active,
      baja: allAssets.filter((a) => a.status === 'baja'),
      vendido: allAssets.filter((a) => a.status === 'vendido'),
      totalValueUsd: active.reduce((s, a) => s + (a.patrimonialValueUsd ?? 0), 0),
    }
  }, [allAssets])

  const companyOptions = useMemo(() => allCompanies.map((c) => ({ value: c.id, label: c.name })), [allCompanies])
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
      sortValue: (row) => row.fixedAsset?.code ?? null,
      render: (_, row) => (
        <span className="font-mono text-xs text-slate-600" title={row.fixedAsset?.name}>
          {row.fixedAsset?.code || '—'}
        </span>
      ),
      exportValue: (row) => row.fixedAsset?.code ?? '',
    },
    {
      id: 'patrimonialValueNew',
      key: 'patrimonialValueNew',
      label: 'Valor a Nuevo (USD)',
      defaultVisible: false,
      sortable: true,
      exportValue: (row) => row.patrimonialValueNew != null ? String(row.patrimonialValueNew) : '',
      render: (v) =>
        v != null && (v as number) > 0
          ? <span className="font-semibold tabular-nums text-slate-700">{formatCurrencyFull(v as number, 'USD')}</span>
          : <span className="text-slate-400">—</span>,
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
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Dar de baja"
            aria-label="Dar de baja"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      className: 'w-20',
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
        <KpiCard label="Activos Totales" value={allAssets.length} description={`${active.length} activos operativos`} icon={Package} variant="info" />
        <KpiCard label="Valor Patrimonial" value={formatCurrencyCompact(totalValueUsd, 'USD')} description="Activos operativos" icon={DollarSign} variant="success" />
        <KpiCard label="Dados de Baja" value={baja.length} description="Activos inactivos o retirados" icon={AlertTriangle} variant={baja.length > 0 ? 'warning' : 'default'} />
        <KpiCard label="Vendidos" value={vendido.length} description="Activos transferidos o vendidos" icon={Archive} variant="default" />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, nombre o marca…"
            className="w-full sm:w-72"
          />
          <MultiSelectFilter label="Estado" options={STATUS_OPTIONS} value={filterStatus} onChange={setFilterStatus} />
          <MultiSelectFilter label="Tipo" options={TYPE_OPTIONS} value={filterType} onChange={setFilterType} />
          <MultiSelectFilter label="Empresa" options={companyOptions} value={filterCompany} onChange={setFilterCompany} />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} de {allAssets.length} activos
            </span>
            <ExportPresetsButton
              tableKey="assets"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="activos"
              onApplyPreset={applyPreset}
            />
            <ColumnConfigButton
              columnConfigs={columnConfigs}
              onToggle={toggle}
              onReorder={reorder}
              onReset={reset}
            />
          </div>
        </div>
        <DataTable
          columns={visibleColumns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          onRowClick={(row) => navigate(`/assets/${row.id}`)}
          emptyTitle="Sin activos"
          emptyDescription="No se encontraron activos con los filtros aplicados."
          minWidth={900}
        />
      </SectionCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Dar de baja"
        description={`¿Dar de baja a "${allAssets.find((a) => a.id === deleteId)?.name ?? 'este activo'}"? El activo quedará inactivo y se registrará en el historial.`}
        confirmLabel="Dar de baja"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
