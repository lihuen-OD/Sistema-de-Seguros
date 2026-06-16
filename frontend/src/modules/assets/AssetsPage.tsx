import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Package, DollarSign, AlertTriangle, Wrench, Eye } from 'lucide-react'
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
import { formatCurrencyFull, formatDate, formatCurrencyCompact } from '../../shared/utils/format'
import { assetRepository } from '../../services/repositories/asset.repository'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import { ASSET_TYPES, ASSET_STATUS_LABELS } from '../../shared/constants'
import type { Asset, TableColumn } from '../../shared/types'

const STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const TYPE_OPTIONS = ASSET_TYPES.map((t) => ({ value: t, label: t }))

export default function AssetsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCompany, setFilterCompany] = useState('')

  const allAssets = assetRepository.findAll()

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
  const inRepair = allAssets.filter((a) => a.status === 'en_reparacion')
  const totalValueUsd = active.reduce((s, a) => s + a.patrimonialValueUsd, 0)

  const companyOptions = mockCompanies.map((c) => ({ value: c.id, label: c.name }))

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
        const c = mockCompanies.find((co) => co.id === v)
        return <span className="text-slate-600 text-xs">{c?.name ?? '—'}</span>
      },
    },
    {
      key: 'costCenterId',
      label: 'C. Costo',
      render: (v) => {
        const cc = mockCostCenters.find((c) => c.id === v)
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
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/assets/${row.id}`) }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Eye size={15} />
        </button>
      ),
      className: 'w-10',
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
          label="En Reparación"
          value={inRepair.length}
          description="Requieren seguimiento"
          icon={Wrench}
          variant={inRepair.length > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Pendientes Doc."
          value={allAssets.filter((a) => a.status === 'pendiente_documentacion').length}
          description="Documentación incompleta"
          icon={AlertTriangle}
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
    </PageContent>
  )
}
