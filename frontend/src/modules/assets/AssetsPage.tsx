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
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import { assetsApi } from '../../shared/api/assets.api'
import { companiesApi } from '../../shared/api/companies.api'
import { costCentersApi } from '../../shared/api/cost-centers.api'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { ASSET_TYPES, ASSET_STATUS_LABELS } from '../../shared/constants'
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

  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
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

  // KPIs
  const active = allAssets.filter((a) => a.status === 'activo')
  const baja = allAssets.filter((a) => a.status === 'baja')
  const vendido = allAssets.filter((a) => a.status === 'vendido')
  const totalValueUsd = active.reduce((s, a) => s + a.patrimonialValueUsd, 0)

  const companyOptions = allCompanies.map((c) => ({ value: c.id, label: c.name }))

  const columns: TableColumn<Asset>[] = [
    {
      key: 'internalCode',
      label: 'Código',
      className: 'font-mono text-slate-600',
    },
    {
      key: 'name',
      label: 'Nombre',
      render: (_, row) => (
        <div className="min-w-0 max-w-[220px]">
          <OverflowCell value={row.name} lines={1} className="font-medium text-slate-800 text-sm" />
          <p className="text-xs text-slate-400 mt-0.5">{row.brand} {row.model}{row.year > 0 ? ` — ${row.year}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'assetType',
      label: 'Tipo',
      render: (v) => <span className="text-slate-600 whitespace-normal">{String(v)}</span>,
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} />,
    },
    {
      key: 'companyId',
      label: 'Empresa',
      render: (v) => {
        const c = allCompanies.find((co) => co.id === v)
        return <span className="text-slate-600 text-xs">{c?.name ?? '—'}</span>
      },
    },
    {
      key: 'costCenterId',
      label: 'C. Costo',
      render: (v) => {
        const cc = allCostCenters.find((c) => c.id === v)
        return <span className="text-slate-500 text-xs">{cc?.code ?? '—'}</span>
      },
    },
    {
      key: 'patrimonialValueUsd',
      label: 'Valor (USD)',
      render: (v) => (
        <span className="font-semibold text-slate-800 tabular-nums">
          {formatCurrencyFull(v as number, 'USD')}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'valuationDate',
      label: 'Valuación',
      render: (v) => <span className="text-slate-500 text-xs">{formatDate(v as string)}</span>,
    },
    {
      key: 'id',
      label: '',
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
  ]

  return (
    <PageContent>
      <PageHeader
        title="Gestión de Activos"
        subtitle="Inventario patrimonial y bienes de uso"
        actions={
          <button
            onClick={() => navigate('/assets/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Activo
          </button>
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
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {allAssets.length} activos
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          onRowClick={(row) => navigate(`/assets/${row.id}`)}
          emptyTitle="Sin activos"
          emptyDescription="No se encontraron activos con los filtros aplicados."
          minWidth={1020}
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
