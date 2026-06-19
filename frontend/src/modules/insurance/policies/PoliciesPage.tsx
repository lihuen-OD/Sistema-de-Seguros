import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, ShieldOff, AlertTriangle, DollarSign, Eye, Trash2 } from 'lucide-react'
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
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { policiesApi } from '../../../shared/api/policies.api'
import { producersApi } from '../../../shared/api/producers.api'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { POLICY_STATUS_LABELS } from '../../../shared/constants'
import type { Policy, TableColumn } from '../../../shared/types'

const STATUS_OPTIONS = Object.entries(POLICY_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export default function PoliciesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: policiesApi.findAll })
  const { data: allProducers = [] } = useQuery({ queryKey: ['producers'], queryFn: producersApi.findAll })

  async function handleDelete(id: string) {
    await policiesApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: ['policies'] })
    setDeleteId(null)
  }

  const filtered = useMemo(() => {
    return allPolicies.filter((p) => {
      const q = search.toLowerCase()
      const matchSearch =
        !search ||
        p.policyNumber.toLowerCase().includes(q) ||
        p.insuranceType.toLowerCase().includes(q)
      const matchStatus = !filterStatus || p.status === filterStatus
      const matchType = !filterType || p.insuranceType === filterType
      return matchSearch && matchStatus && matchType
    })
  }, [allPolicies, search, filterStatus, filterType])

  const typeOptions = useMemo(
    () => [...new Set(allPolicies.map((p) => p.insuranceType).filter(Boolean))].map((t) => ({ value: t, label: t })),
    [allPolicies],
  )

  // KPI counts computed locally
  const counts = useMemo(() => ({
    vigente: allPolicies.filter((p) => p.status === 'vigente').length,
    vencida: allPolicies.filter((p) => p.status === 'vencida').length,
    proximo_vencer: allPolicies.filter((p) => p.status === 'proximo_vencer').length,
  }), [allPolicies])
  const totalInsuredArs = useMemo(
    () => allPolicies.filter((p) => p.status === 'vigente').reduce((s, p) => s + p.insuredAmountArs, 0),
    [allPolicies],
  )

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
        const producer = allProducers.find((p) => p.id === v)
        return (
          <div className="max-w-[180px]">
            <OverflowCell value={producer?.name ?? null} lines={1} className="text-xs text-slate-500" />
          </div>
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
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/insurance/policies/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar póliza"
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
                options: typeOptions,
                value: filterType,
                onChange: setFilterType,
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
          minWidth={1100}
        />
      </SectionCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar póliza"
        description={`¿Eliminar la póliza "${allPolicies.find((p) => p.id === deleteId)?.policyNumber ?? ''}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
