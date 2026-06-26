import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldCheck, ShieldOff, AlertTriangle, DollarSign, Eye, Trash2, Download } from 'lucide-react'
import { downloadCSV } from '../../../shared/utils/export'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { OverflowCell } from '../../../shared/components/data-table/OverflowCell'
import { ColumnConfigButton } from '../../../shared/components/data-table/ColumnConfigButton'
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
import { assetsApi } from '../../../shared/api/assets.api'
import { companiesApi } from '../../../shared/api/companies.api'
import { costCentersApi } from '../../../shared/api/cost-centers.api'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { POLICY_STATUS_LABELS } from '../../../shared/constants'
import { useColumnConfig } from '../../../shared/hooks/useColumnConfig'
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

  const { data: allPolicies = [], isLoading, isError } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: allProducers = [] } = useQuery({ queryKey: ['producers'], queryFn: producersApi.findAll })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: allCompanies = [] } = useQuery({ queryKey: ['companies'], queryFn: companiesApi.findAll })
  const { data: allCostCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: costCentersApi.findAll })

  async function handleDelete(id: string) {
    await policiesApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: ['policies'] })
    setDeleteId(null)
  }

  const assetNameById = useMemo(() => {
    const map = new Map<string, string>()
    allAssets.forEach((a) => map.set(a.id, a.name))
    return map
  }, [allAssets])

  const companyNameById = useMemo(() => {
    const map = new Map<string, string>()
    allCompanies.forEach((c) => map.set(c.id, c.name))
    return map
  }, [allCompanies])

  const costCenterById = useMemo(() => {
    const map = new Map<string, string>()
    allCostCenters.forEach((cc) => map.set(cc.id, `${cc.code} — ${cc.name}`))
    return map
  }, [allCostCenters])

  const filtered = useMemo(() => {
    return allPolicies.filter((p) => {
      const q = search.toLowerCase()
      const assetName = p.assetId ? (assetNameById.get(p.assetId) ?? '') : ''
      const matchSearch =
        !search ||
        p.policyNumber.toLowerCase().includes(q) ||
        p.insuranceType.toLowerCase().includes(q) ||
        p.insuranceCompany.toLowerCase().includes(q) ||
        assetName.toLowerCase().includes(q)
      const matchStatus = !filterStatus || p.status === filterStatus
      const matchType = !filterType || p.insuranceType === filterType
      return matchSearch && matchStatus && matchType
    })
  }, [allPolicies, assetNameById, search, filterStatus, filterType])

  const typeOptions = useMemo(
    () => [...new Set(allPolicies.map((p) => p.insuranceType).filter(Boolean))].map((t) => ({ value: t, label: t })),
    [allPolicies],
  )

  const counts = useMemo(() => ({
    vigente: allPolicies.filter((p) => p.status === 'vigente').length,
    vencida: allPolicies.filter((p) => p.status === 'vencida').length,
    proximo_vencer: allPolicies.filter((p) => p.status === 'proximo_vencer').length,
  }), [allPolicies])

  const totalInsuredArs = useMemo(
    () => allPolicies.filter((p) => p.status === 'vigente').reduce((s, p) => s + p.insuredAmountArs, 0),
    [allPolicies],
  )

  const ALL_COLUMNS: TableColumn<Policy>[] = useMemo(() => [
    {
      id: 'policyNumber',
      key: 'policyNumber',
      label: 'N° Póliza',
      defaultVisible: true,
      className: 'font-mono text-slate-600 text-xs',
    },
    {
      id: 'insuranceCompany',
      key: 'insuranceCompany',
      label: 'Aseguradora',
      defaultVisible: true,
      render: (v) => <span className="font-medium text-slate-800">{String(v)}</span>,
    },
    {
      id: 'producerId',
      key: 'producerId',
      label: 'Productor',
      defaultVisible: true,
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
      id: 'insuranceType',
      key: 'insuranceType',
      label: 'Tipo',
      defaultVisible: true,
      render: (v) => <span className="text-slate-600">{String(v)}</span>,
    },
    {
      id: 'coverageType',
      key: 'coverageType',
      label: 'Cobertura',
      defaultVisible: true,
      render: (_v, row) => {
        const names = row.coverageNames?.length ? row.coverageNames : (row.coverageType ? [row.coverageType] : [])
        const label = names.join(', ') || null
        return (
          <div className="max-w-[180px]">
            <OverflowCell value={label} lines={1} className="text-xs text-slate-500" />
          </div>
        )
      },
    },
    {
      id: 'startDate',
      key: 'startDate',
      label: 'Inicio',
      defaultVisible: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      id: 'endDate',
      key: 'endDate',
      label: 'Vencimiento',
      defaultVisible: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      id: 'insuredAmountArs',
      key: 'insuredAmountArs',
      label: 'Suma aseg. ARS',
      defaultVisible: true,
      render: (v) => (
        <span className="font-semibold text-slate-800 tabular-nums">
          {(v as number) > 0 ? formatCurrencyFull(v as number, 'ARS') : <span className="text-slate-400">—</span>}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'assetName',
      key: 'assetId',
      label: 'Activo asociado',
      defaultVisible: false,
      render: (_v, row) => {
        const name = row.assetId ? assetNameById.get(row.assetId) : null
        return name
          ? <span className="text-sm text-slate-700">{name}</span>
          : <span className="text-slate-400">—</span>
      },
    },
    {
      id: 'insuredAmountUsd',
      key: 'insuredAmountUsd',
      label: 'Suma aseg. USD',
      defaultVisible: false,
      render: (v) => (
        <span className="tabular-nums text-slate-700">
          {(v as number) > 0 ? formatCurrencyFull(v as number, 'USD') : <span className="text-slate-400">—</span>}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'currency',
      key: 'currency',
      label: 'Moneda',
      defaultVisible: false,
      render: (v) => <span className="text-xs font-mono text-slate-600">{String(v ?? '—')}</span>,
    },
    {
      id: 'exchangeRate',
      key: 'exchangeRate',
      label: 'Tipo de cambio',
      defaultVisible: false,
      render: (v) => (
        <span className="tabular-nums text-slate-600 text-sm">
          {(v as number) > 0 ? `$${(v as number).toLocaleString('es-AR')}` : <span className="text-slate-400">—</span>}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'companyId',
      key: 'companyId',
      label: 'Empresa',
      defaultVisible: false,
      render: (v) => {
        const name = v ? companyNameById.get(v as string) : null
        return <span className="text-sm text-slate-700">{name ?? <span className="text-slate-400">—</span>}</span>
      },
    },
    {
      id: 'costCenterId',
      key: 'costCenterId',
      label: 'Centro de costo',
      defaultVisible: false,
      render: (v) => {
        const label = v ? costCenterById.get(v as string) : null
        return label
          ? <span className="text-xs text-slate-600">{label}</span>
          : <span className="text-slate-400">—</span>
      },
    },
    {
      id: 'beneficiaryDescription',
      key: 'beneficiaryDescription',
      label: 'Beneficiario',
      defaultVisible: false,
      render: (v) => (
        <div className="max-w-[200px]">
          <OverflowCell value={(v as string) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      id: 'description',
      key: 'description',
      label: 'Descripción',
      defaultVisible: false,
      render: (v) => (
        <div className="max-w-[200px]">
          <OverflowCell value={(v as string) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
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
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
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
  ], [allProducers, assetNameById, companyNameById, costCenterById, navigate])

  const { visibleColumns, columnConfigs, toggle, reorder, reset } = useColumnConfig('policies', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Pólizas de Seguros"
        subtitle="Administración de pólizas vigentes, vencidas y próximas a vencer"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const rows = [
                  ['N° Póliza', 'Aseguradora', 'Productor', 'Tipo de Seguro', 'Cobertura', 'Inicio', 'Vencimiento', 'Suma Asegurada ARS', 'Estado'],
                  ...filtered.map((p) => [
                    p.policyNumber,
                    p.insuranceCompany,
                    allProducers.find((pr) => pr.id === p.producerId)?.name ?? '',
                    p.insuranceType,
                    p.coverageType ?? '',
                    p.startDate,
                    p.endDate,
                    String(p.insuredAmountArs),
                    p.status,
                  ]),
                ]
                downloadCSV(rows, `polizas-${new Date().toISOString().slice(0, 10)}.csv`)
              }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={15} />
              Exportar CSV
            </button>
            <button
              onClick={() => navigate('/insurance/policies/new')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Nueva Póliza
            </button>
          </div>
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
            placeholder="Buscar por N° póliza, aseguradora, tipo o activo…"
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
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} de {allPolicies.length} pólizas
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
          onRowClick={(row) => navigate(`/insurance/policies/${row.id}`)}
          emptyTitle="Sin pólizas"
          emptyDescription="No se encontraron pólizas con los filtros aplicados."
          minWidth={900}
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
