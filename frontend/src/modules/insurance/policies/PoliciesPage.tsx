import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ShieldCheck, ShieldOff, AlertTriangle, DollarSign, Eye } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { policyRepository } from '../../../services/repositories/policy.repository'
import { mockProducers } from '../../../data/mock-producers'
import {
  INSURANCE_TYPES,
  INSURANCE_COMPANIES,
  POLICY_STATUS_LABELS,
} from '../../../shared/constants'
import type { Policy, TableColumn } from '../../../shared/types'

const STATUS_OPTIONS = Object.entries(POLICY_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))
const TYPE_OPTIONS = INSURANCE_TYPES.map((t) => ({ value: t, label: t }))
const COMPANY_OPTIONS = INSURANCE_COMPANIES.map((c) => ({ value: c, label: c }))

export default function PoliciesPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterCompany, setFilterCompany] = useState('')

  const allPolicies = policyRepository.findAll()

  const filtered = useMemo(() => {
    return allPolicies.filter((p) => {
      const q = search.toLowerCase()
      const matchSearch =
        !search ||
        p.policyNumber.toLowerCase().includes(q) ||
        p.insuranceCompany.toLowerCase().includes(q) ||
        p.insuranceType.toLowerCase().includes(q)
      const matchStatus = !filterStatus || p.status === filterStatus
      const matchType = !filterType || p.insuranceType === filterType
      const matchCompany = !filterCompany || p.insuranceCompany === filterCompany
      return matchSearch && matchStatus && matchType && matchCompany
    })
  }, [allPolicies, search, filterStatus, filterType, filterCompany])

  // KPI counts
  const counts = policyRepository.getCountByStatus()
  const totalInsuredArs = policyRepository.getTotalInsuredAmountArs()

  const columns: TableColumn<Policy>[] = [
    {
      key: 'policyNumber',
      label: 'N° Póliza',
      className: 'font-mono text-slate-600 text-xs',
    },
    {
      key: 'insuranceCompany',
      label: 'Aseguradora',
      render: (v) => <span className="font-medium text-slate-800">{String(v)}</span>,
    },
    {
      key: 'producerId',
      label: 'Productor',
      render: (v) => {
        const producer = mockProducers.find((p) => p.id === v)
        return (
          <span className="text-xs text-slate-500 truncate max-w-[160px] block">
            {producer?.name ?? '—'}
          </span>
        )
      },
    },
    {
      key: 'insuranceType',
      label: 'Tipo',
      render: (v) => <span className="text-slate-600">{String(v)}</span>,
    },
    {
      key: 'coverageType',
      label: 'Cobertura',
      render: (v) => <span className="text-xs text-slate-500">{String(v)}</span>,
    },
    {
      key: 'startDate',
      label: 'Inicio',
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      key: 'endDate',
      label: 'Vencimiento',
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      key: 'insuredAmountArs',
      label: 'Suma Aseg. ARS',
      render: (v) => (
        <span className="font-semibold text-slate-800 tabular-nums">
          {formatCurrencyFull(v as number, 'ARS')}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/insurance/policies/${row.id}`)
          }}
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
        title="Pólizas de Seguros"
        subtitle="Administración de pólizas vigentes, vencidas y próximas a vencer"
        actions={
          <button
            onClick={() => navigate('/insurance/policies/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva Póliza
          </button>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Vigentes"
          value={counts.vigente}
          description="Pólizas con cobertura activa"
          icon={ShieldCheck}
          variant="success"
        />
        <KpiCard
          label="Vencidas"
          value={counts.vencida}
          description="Requieren renovación"
          icon={ShieldOff}
          variant="danger"
        />
        <KpiCard
          label="Próximas a Vencer"
          value={counts.proximo_vencer}
          description="Vencen en los próximos 30 días"
          icon={AlertTriangle}
          variant="warning"
        />
        <KpiCard
          label="Suma Asegurada"
          value={formatCurrencyCompact(totalInsuredArs, 'ARS')}
          description="Pólizas vigentes — ARS"
          icon={DollarSign}
          variant="info"
        />
      </MetricGrid>

      {/* Filters + Table */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por N° póliza, aseguradora o tipo…"
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              {
                key: 'status',
                label: 'Estado',
                options: STATUS_OPTIONS,
                value: filterStatus,
                onChange: setFilterStatus,
              },
              {
                key: 'type',
                label: 'Tipo',
                options: TYPE_OPTIONS,
                value: filterType,
                onChange: setFilterType,
              },
              {
                key: 'company',
                label: 'Aseguradora',
                options: COMPANY_OPTIONS,
                value: filterCompany,
                onChange: setFilterCompany,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {allPolicies.length} pólizas
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/policies/${row.id}`)}
          emptyTitle="Sin pólizas"
          emptyDescription="No se encontraron pólizas con los filtros aplicados."
        />
      </SectionCard>
    </PageContent>
  )
}
