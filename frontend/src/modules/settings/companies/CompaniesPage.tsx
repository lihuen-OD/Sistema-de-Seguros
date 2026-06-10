import { useState, useMemo } from 'react'
import { Building2, CheckCircle2, XCircle, Hash, Plus, Edit2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { formatDate } from '../../../shared/utils/format'
import { mockCompanies } from '../../../data/mock-companies'
import { mockCostCenters } from '../../../data/mock-cost-centers'
import { mockAssets } from '../../../data/mock-assets'
import type { Company, TableColumn } from '../../../shared/types'

export default function CompaniesPage() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return mockCompanies
    const q = search.toLowerCase()
    return mockCompanies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.taxId.toLowerCase().includes(q),
    )
  }, [search])

  const activeCount = mockCompanies.filter((c) => c.status === 'activo').length
  const inactiveCount = mockCompanies.filter((c) => c.status === 'inactivo').length
  const totalCostCenters = mockCostCenters.filter((cc) => cc.status === 'activo').length
  const totalAssets = mockAssets.filter((a) => a.status === 'activo').length

  const columns: TableColumn<Company>[] = [
    {
      key: 'name',
      label: 'Razón Social',
      render: (v, row) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={16} className="text-blue-500" />
          </div>
          <div>
            <span className="font-medium text-slate-800 text-sm block">{String(v)}</span>
            <span className="text-xs text-slate-400 font-mono">CUIT {row.taxId}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'id',
      label: 'Centros de Costo',
      render: (v) => {
        const ccCount = mockCostCenters.filter((cc) => cc.companyId === v && cc.status === 'activo').length
        return (
          <span className="inline-flex items-center gap-1 text-xs text-slate-600">
            <Hash size={12} />
            {ccCount} centro{ccCount !== 1 ? 's' : ''}
          </span>
        )
      },
    },
    {
      key: 'id',
      label: 'Activos',
      render: (v) => {
        const assetCount = mockAssets.filter((a) => a.companyId === v && a.status === 'activo').length
        return (
          <span className="text-xs text-slate-600">
            {assetCount} activo{assetCount !== 1 ? 's' : ''}
          </span>
        )
      },
    },
    {
      key: 'createdAt',
      label: 'Alta',
      render: (v) => (
        <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
      ),
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
        title="Empresas"
        subtitle="Razones sociales que conforman el grupo económico"
        actions={
          <button
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva Empresa
          </button>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Empresas Activas"
          value={activeCount}
          description={`${mockCompanies.length} total registradas`}
          icon={Building2}
          variant="default"
        />
        <KpiCard
          label="Inactivas"
          value={inactiveCount}
          description="Fuera de operación"
          icon={XCircle}
          variant={inactiveCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Centros de Costo"
          value={totalCostCenters}
          description="Activos en todas las empresas"
          icon={Hash}
          variant="info"
        />
        <KpiCard
          label="Activos Asociados"
          value={totalAssets}
          description="Bienes en estado activo"
          icon={CheckCircle2}
          variant="success"
        />
      </MetricGrid>

      {/* Table */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por razón social o CUIT…"
            className="w-full sm:w-72"
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {mockCompanies.length} empresas
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          emptyTitle="Sin empresas"
          emptyDescription="No se encontraron empresas con los filtros aplicados."
        />
      </SectionCard>

      {/* Company cards — visual summary */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockCompanies.map((company) => {
          const ccList = mockCostCenters.filter((cc) => cc.companyId === company.id)
          const assetList = mockAssets.filter((a) => a.companyId === company.id && a.status === 'activo')
          return (
            <div
              key={company.id}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Building2 size={20} className="text-blue-500" />
                </div>
                <StatusPill status={company.status} size="sm" />
              </div>
              <h3 className="font-semibold text-slate-800 text-sm mb-1 leading-snug">{company.name}</h3>
              <p className="text-xs text-slate-400 font-mono mb-4">CUIT {company.taxId}</p>
              <div className="flex items-center gap-4 pt-3 border-t border-slate-100">
                <div className="text-center">
                  <span className="block text-lg font-bold text-slate-800">{ccList.length}</span>
                  <span className="block text-xs text-slate-400">CC</span>
                </div>
                <div className="w-px h-8 bg-slate-100" />
                <div className="text-center">
                  <span className="block text-lg font-bold text-slate-800">{assetList.length}</span>
                  <span className="block text-xs text-slate-400">Activos</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </PageContent>
  )
}
