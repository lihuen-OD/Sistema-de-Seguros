import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Package, DollarSign, AlertTriangle, Archive, Eye, Trash2, Download } from 'lucide-react'
import { downloadCSV } from '../../shared/utils/export'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import { assetsApi } from '../../shared/api/assets.api'
import { companiesApi } from '../../shared/api/companies.api'
import { costCentersApi } from '../../shared/api/cost-centers.api'
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
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: allAssets = [], isLoading, isError } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: allCompanies = [] } = useQuery({ queryKey: ['companies'], queryFn: companiesApi.findAll })
  const { data: allCostCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: costCentersApi.findAll })

  async function handleDelete(id: string) {
    await assetsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: ['assets'] })
    setDeleteId(null)
  }

  const filtered = useMemo(() => {
    return allAssets.filter((a) => {
      const matchSearch =
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.internalCode.toLowerCase().includes(search.toLowerCase()) ||
        a.brand.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !filterStatus || a.status === filterStatus
      const matchType = !filterType || a.assetType === filterType
      const matchCompany = !filterCompany || a.companyId === filterCompany
      return matchSearch && matchStatus && matchType && matchCompany
    })
  }, [allAssets, search, filterStatus, filterType, filterCompany])

  const { active, baja, vendido, totalValueUsd } = useMemo(() => {
    const active = allAssets.filter((a) => a.status === 'activo')
    return {
      active,
      baja: allAssets.filter((a) => a.status === 'baja'),
      vendido: allAssets.filter((a) => a.status === 'vendido'),
      totalValueUsd: active.reduce((s, a) => s + a.patrimonialValueUsd, 0),
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
      className: 'font-mono text-slate-600',
    },
    {
      id: 'name',
      key: 'name',
      label: 'Nombre',
      defaultVisible: true,
      render: (_, row) => (
        <div className="min-w-0 max-w-[220px]">
          <OverflowCell value={row.name} lines={1} className="font-medium text-slate-800 text-sm" />
          <p className="text-xs text-slate-400 mt-0.5">{row.brand} {row.model}{row.year > 0 ? ` — ${row.year}` : ''}</p>
        </div>
      ),
    },
    {
      id: 'assetType',
      key: 'assetType',
      label: 'Tipo',
      defaultVisible: true,
      render: (v) => <span className="text-slate-600 whitespace-normal">{String(v)}</span>,
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      render: (v) => <StatusPill status={v as string} />,
    },
    {
      id: 'companyId',
      key: 'companyId',
      label: 'Empresa',
      defaultVisible: true,
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
      render: (v) => (
        <span className="font-semibold text-slate-800 tabular-nums">
          {formatCurrencyFull(v as number, 'USD')}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'valuationDate',
      key: 'valuationDate',
      label: 'Valuación',
      defaultVisible: true,
      render: (v) => <span className="text-slate-500 text-xs">{formatDate(v as string)}</span>,
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'brand',
      key: 'brand',
      label: 'Marca',
      defaultVisible: false,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'model',
      key: 'model',
      label: 'Modelo',
      defaultVisible: false,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'year',
      key: 'year',
      label: 'Año',
      defaultVisible: false,
      render: (v) => <span className="tabular-nums text-slate-600">{(v as number) > 0 ? String(v) : '—'}</span>,
      className: 'text-center',
      headerClassName: 'text-center',
    },
    {
      id: 'serialNumber',
      key: 'serialNumber',
      label: 'N° de Serie',
      defaultVisible: false,
      render: (v) => (
        <span className="font-mono text-xs text-slate-600">{(v as string) || '—'}</span>
      ),
    },
    {
      id: 'chassisNumber',
      key: 'chassisNumber',
      label: 'N° Chasis',
      defaultVisible: false,
      render: (v) => (
        <span className="font-mono text-xs text-slate-600">{(v as string) || <span className="text-slate-400">—</span>}</span>
      ),
    },
    {
      id: 'engineNumber',
      key: 'engineNumber',
      label: 'N° Motor',
      defaultVisible: false,
      render: (v) => (
        <span className="font-mono text-xs text-slate-600">{(v as string) || <span className="text-slate-400">—</span>}</span>
      ),
    },
    {
      id: 'fixedAssetCode',
      key: 'fixedAssetCode',
      label: 'Bien de Uso',
      defaultVisible: false,
      render: (v) => (
        <span className="font-mono text-xs text-slate-600">{(v as string) || <span className="text-slate-400">—</span>}</span>
      ),
    },
    {
      id: 'patrimonialValueNew',
      key: 'patrimonialValueNew',
      label: 'Valor a Nuevo (USD)',
      defaultVisible: false,
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
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'area',
      key: 'area',
      label: 'Área',
      defaultVisible: false,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'dischargeDate',
      key: 'dischargeDate',
      label: 'Fecha de baja',
      defaultVisible: false,
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
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    // ── Acciones (siempre visible, siempre última) ────────────────────────────
    {
      id: 'actions',
      key: 'id',
      label: '',
      hideable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/assets/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar activo"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
      className: 'w-20',
    },
  ], [companyNameById, costCenterById, navigate])

  const { visibleColumns, columnConfigs, toggle, reorder, reset } = useColumnConfig('assets', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Gestión de Activos"
        subtitle="Inventario patrimonial y bienes de uso"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const rows = [
                  ['Código', 'Nombre', 'Marca/Modelo', 'Tipo', 'Estado', 'Empresa', 'C. Costo', 'Valor USD', 'Fecha Valuación'],
                  ...filtered.map((a) => [
                    a.internalCode,
                    a.name,
                    `${a.brand} ${a.model}${a.year > 0 ? ` (${a.year})` : ''}`,
                    a.assetType,
                    a.status,
                    companyNameById.get(a.companyId) ?? '',
                    costCenterById.get(a.costCenterId)?.code ?? '',
                    String(a.patrimonialValueUsd),
                    a.valuationDate ?? '',
                  ]),
                ]
                downloadCSV(rows, `activos-${new Date().toISOString().slice(0, 10)}.csv`)
              }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={15} />
              Exportar CSV
            </button>
            <button
              onClick={() => navigate('/assets/new')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Nuevo Activo
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Activos Totales"
          value={allAssets.length}
          description={`${active.length} activos operativos`}
          icon={Package}
          variant="info"
        />
        <KpiCard
          label="Valor Patrimonial"
          value={`US$ ${(totalValueUsd / 1_000_000).toFixed(1).replace('.', ',')}M`}
          description="Activos operativos"
          icon={DollarSign}
          variant="success"
        />
        <KpiCard
          label="Dados de Baja"
          value={baja.length}
          description="Activos inactivos o retirados"
          icon={AlertTriangle}
          variant={baja.length > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Vendidos"
          value={vendido.length}
          description="Activos transferidos o vendidos"
          icon={Archive}
          variant="default"
        />
      </MetricGrid>

      {/* Filters + Table */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, nombre o marca…"
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              { key: 'status', label: 'Estado', options: STATUS_OPTIONS, value: filterStatus, onChange: setFilterStatus },
              { key: 'type', label: 'Tipo', options: TYPE_OPTIONS, value: filterType, onChange: setFilterType },
              { key: 'company', label: 'Empresa', options: companyOptions, value: filterCompany, onChange: setFilterCompany },
            ]}
          />
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} de {allAssets.length} activos
            </span>
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
        title="Eliminar activo"
        description={`¿Eliminar "${allAssets.find((a) => a.id === deleteId)?.name ?? 'este activo'}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
