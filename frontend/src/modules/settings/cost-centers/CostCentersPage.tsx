import { useState, useMemo } from 'react'
import { Hash, Building2, Plus, Edit2, CheckCircle2, XCircle } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { OverflowCell } from '../../../shared/components/data-table/OverflowCell'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { mockCostCenters } from '../../../data/mock-cost-centers'
import { mockCompanies } from '../../../data/mock-companies'
import { mockAssets } from '../../../data/mock-assets'
import type { CostCenter, TableColumn } from '../../../shared/types'

export default function CostCentersPage() {
  const [search, setSearch] = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filtered = useMemo(() => {
    return mockCostCenters.filter((cc) => {
      const q = search.toLowerCase()
      const matchSearch =
        !search ||
        cc.name.toLowerCase().includes(q) ||
        cc.code.toLowerCase().includes(q) ||
        cc.area.toLowerCase().includes(q)
      const matchCompany = !filterCompany || cc.companyId === filterCompany
      const matchStatus = !filterStatus || cc.status === filterStatus
      return matchSearch && matchCompany && matchStatus
    })
  }, [search, filterCompany, filterStatus])

  const activeCount = mockCostCenters.filter((cc) => cc.status === 'activo').length
  const inactiveCount = mockCostCenters.filter((cc) => cc.status === 'inactivo').length

  const COMPANY_OPTIONS = mockCompanies
    .filter((c) => c.status === 'activo')
    .map((c) => ({ value: c.id, label: c.name }))

  const STATUS_OPTIONS = [
    { value: 'activo', label: 'Activo' },
    { value: 'inactivo', label: 'Inactivo' },
  ]

  const columns: TableColumn<CostCenter>[] = [
    {
      key: 'code',
      label: 'Código',
      className: 'font-mono text-xs text-slate-600 min-w-[120px]',
    },
    {
      key: 'name',
      label: 'Centro de Costo',
      render: (v) => <span className="font-medium text-slate-800 text-sm">{String(v)}</span>,
    },
    {
      key: 'companyId',
      label: 'Empresa',
      render: (v) => {
        const company = mockCompanies.find((c) => c.id === v)
        return (
          <div className="max-w-[200px]">
            <OverflowCell value={company?.name ?? null} lines={1} className="text-xs text-slate-500" />
          </div>
        )
      },
    },
    {
      key: 'area',
      label: 'Área',
      render: (v) => (
        <span className="inline-block text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
          {String(v)}
        </span>
      ),
    },
    {
      key: 'id',
      label: 'Activos',
      render: (v) => {
        const count = mockAssets.filter((a) => a.costCenterId === v && a.status === 'activo').length
        return <span className="text-xs text-slate-500">{count} activo{count !== 1 ? 's' : ''}</span>
      },
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      render: () => (
        <button
          onClick={(e) => e.stopPropagation()}
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Edit2 size={15} />
        </button>
      ),
      className: 'w-10',
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title="Centros de Costo"
        subtitle="Unidades de imputación contable vinculadas a cada empresa"
        actions={
          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Centro de Costo
          </button>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Total"
          value={mockCostCenters.length}
          description="Centros de costo registrados"
          icon={Hash}
          variant="default"
        />
        <KpiCard
          label="Activos"
          value={activeCount}
          description="Habilitados para imputación"
          icon={CheckCircle2}
          variant="success"
        />
        <KpiCard
          label="Inactivos"
          value={inactiveCount}
          description="Sin movimiento activo"
          icon={XCircle}
          variant={inactiveCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Empresas"
          value={mockCompanies.filter((c) => c.status === 'activo').length}
          description="Con centros de costo activos"
          icon={Building2}
          variant="info"
        />
      </MetricGrid>

      {/* Filters + Table */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, nombre o área…"
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              {
                key: 'company',
                label: 'Empresa',
                options: COMPANY_OPTIONS,
                value: filterCompany,
                onChange: setFilterCompany,
              },
              {
                key: 'status',
                label: 'Estado',
                options: STATUS_OPTIONS,
                value: filterStatus,
                onChange: setFilterStatus,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {mockCostCenters.length} centros
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          emptyTitle="Sin centros de costo"
          emptyDescription="No se encontraron centros con los filtros aplicados."
          minWidth={780}
        />
      </SectionCard>

      {/* Grouped by company */}
      <div className="mt-5 space-y-4">
        {mockCompanies.filter((c) => c.status === 'activo').map((company) => {
          const ccs = mockCostCenters.filter((cc) => cc.companyId === company.id)
          if (ccs.length === 0) return null
          return (
            <SectionCard key={company.id} title={company.name} subtitle={`CUIT ${company.taxId}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {ccs.map((cc) => {
                  const assetCount = mockAssets.filter((a) => a.costCenterId === cc.id && a.status === 'activo').length
                  return (
                    <div
                      key={cc.id}
                      className={`rounded-lg border p-3.5 transition-colors ${
                        cc.status === 'activo'
                          ? 'border-slate-200 bg-white hover:border-blue-200'
                          : 'border-slate-100 bg-slate-50 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-xs font-mono text-slate-400">{cc.code}</span>
                        <StatusPill status={cc.status} size="sm" />
                      </div>
                      <p className="text-sm font-medium text-slate-800 leading-snug mb-1">{cc.name}</p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{cc.area}</span>
                        <span className="text-xs text-slate-500">{assetCount} activo{assetCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </SectionCard>
          )
        })}
      </div>
    </PageContent>
  )
}
