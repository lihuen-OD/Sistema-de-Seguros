import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ShieldAlert, Clock, CheckCircle2, XCircle, FileSearch, Eye, Edit2, Trash2,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { claimsApi } from '../../shared/api/claims.api'
import { assetsApi } from '../../shared/api/assets.api'
import { policiesApi } from '../../shared/api/policies.api'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { CLAIM_TYPE_LABELS, CLAIM_STATUS_LABELS } from '../../shared/constants'
import { CLAIM_STATUS_STYLES, CLAIM_STATUS_ICONS } from '../../shared/constants/claim-status'
import type { Claim, ClaimStatus, ClaimType, TableColumn } from '../../shared/types'

// ── Status pill ───────────────────────────────────────────────────────────────

function ClaimStatusPill({ status }: { status: ClaimStatus }) {
  const Icon = CLAIM_STATUS_ICONS[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${CLAIM_STATUS_STYLES[status]}`}>
      <Icon size={10} />
      {CLAIM_STATUS_LABELS[status]}
    </span>
  )
}

// ── Filter options ────────────────────────────────────────────────────────────

const STATUS_OPTIONS = Object.entries(CLAIM_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const TYPE_OPTIONS = Object.entries(CLAIM_TYPE_LABELS).map(([value, label]) => ({ value, label }))

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClaimsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: all = [] } = useQuery({ queryKey: ['claims'], queryFn: claimsApi.findAll })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: policiesApi.findAll })

  async function handleDelete(id: string) {
    await claimsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: ['claims'] })
    setDeleteId(null)
  }

  const counts = useMemo(() => ({
    denunciado: all.filter((c) => c.status === 'denunciado').length,
    en_tramite: all.filter((c) => c.status === 'en_tramite').length,
    liquidado: all.filter((c) => c.status === 'liquidado').length,
    rechazado: all.filter((c) => c.status === 'rechazado').length,
    cerrado: all.filter((c) => c.status === 'cerrado').length,
  }), [all])

  const totals = useMemo(() => ({
    totalClaimed: all.reduce((s, c) => s + c.claimedAmountArs, 0),
    totalSettled: all.reduce((s, c) => s + (c.settledAmountArs ?? 0), 0),
  }), [all])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all.filter((c) => {
      const asset = c.assetId ? allAssets.find((a) => a.id === c.assetId) : null
      const matchSearch =
        !search ||
        c.claimNumber.toLowerCase().includes(q) ||
        c.insuranceCompany.toLowerCase().includes(q) ||
        (asset?.name.toLowerCase().includes(q) ?? false) ||
        CLAIM_TYPE_LABELS[c.claimType]?.toLowerCase().includes(q)
      const matchStatus = !filterStatus || c.status === filterStatus
      const matchType   = !filterType   || c.claimType === filterType
      return matchSearch && matchStatus && matchType
    })
  }, [all, allAssets, search, filterStatus, filterType])

  const inProgress = counts.denunciado + counts.en_tramite

  const columns: TableColumn<Claim>[] = [
    {
      key: 'claimNumber',
      label: 'N° Siniestro',
      className: 'font-mono text-xs text-slate-600 min-w-[140px]',
    },
    {
      key: 'claimType',
      label: 'Tipo',
      render: (v) => (
        <span className="text-sm text-slate-800 font-medium">
          {CLAIM_TYPE_LABELS[v as ClaimType] ?? String(v)}
        </span>
      ),
    },
    {
      key: 'assetId',
      label: 'Activo',
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400">—</span>
        const asset = allAssets.find((a) => a.id === v)
        if (!asset) return <span className="text-xs text-slate-400">—</span>
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/assets/${v}`) }}
            className="text-left block min-w-0 max-w-[200px] group"
          >
            <OverflowCell value={asset.name} lines={1} className="text-xs text-blue-600 group-hover:underline" />
            <span className="block text-slate-400 font-mono text-[10px] mt-0.5">{asset.internalCode}</span>
          </button>
        )
      },
    },
    {
      key: 'policyId',
      label: 'Póliza',
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400">—</span>
        const pol = allPolicies.find((p) => p.id === v)
        return pol
          ? <span className="text-xs font-mono text-slate-600">{pol.policyNumber}</span>
          : <span className="text-xs text-slate-400">—</span>
      },
    },
    {
      key: 'occurrenceDate',
      label: 'Fecha hecho',
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      key: 'insuranceCompany',
      label: 'Aseguradora',
      render: (v) => <span className="text-xs text-slate-600">{String(v)}</span>,
    },
    {
      key: 'claimedAmountArs',
      label: 'Reclamado',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (v) => (
        <span className="text-sm font-semibold text-slate-800 tabular-nums">
          {formatCurrencyCompact(v as number, 'ARS')}
        </span>
      ),
    },
    {
      key: 'settledAmountArs',
      label: 'Liquidado',
      headerClassName: 'text-right',
      className: 'text-right',
      render: (v) =>
        v != null ? (
          <span className="text-sm font-semibold text-emerald-700 tabular-nums">
            {formatCurrencyCompact(v as number, 'ARS')}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <ClaimStatusPill status={v as ClaimStatus} />,
    },
    {
      key: 'id',
      label: '',
      className: 'w-20',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/claims/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/claims/${row.id}/edit`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Editar"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar siniestro"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title="Siniestros"
        subtitle="Gestión y seguimiento de siniestros asociados a activos y pólizas"
        actions={
          <button
            onClick={() => navigate('/claims/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Siniestro
          </button>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-5">
        <KpiCard
          label="En Gestión"
          value={inProgress}
          description="Denunciados o en trámite"
          icon={Clock}
          variant={inProgress > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Liquidados"
          value={counts.liquidado}
          description="Con indemnización aprobada"
          icon={CheckCircle2}
          variant="success"
        />
        <KpiCard
          label="Monto Reclamado"
          value={formatCurrencyCompact(totals.totalClaimed, 'ARS')}
          description="Total histórico reclamado"
          icon={ShieldAlert}
          variant="info"
        />
        <KpiCard
          label="Monto Liquidado"
          value={formatCurrencyCompact(totals.totalSettled, 'ARS')}
          description="Total indemnizado efectivo"
          icon={CheckCircle2}
          variant={totals.totalSettled > 0 ? 'success' : 'default'}
        />
      </MetricGrid>

      {/* Alert: siniestros en trámite */}
      {inProgress > 0 && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Clock size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>{inProgress} siniestro{inProgress !== 1 ? 's' : ''}</strong> en gestión activa requieren
            seguimiento con la aseguradora.
          </span>
        </div>
      )}

      {/* Filtros + Tabla */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por N° siniestro, activo, aseguradora…"
            className="w-full sm:w-80"
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
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {all.length} siniestros
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          onRowClick={(row) => navigate(`/claims/${row.id}`)}
          emptyTitle="Sin siniestros"
          emptyDescription="No se encontraron siniestros con los filtros aplicados."
          minWidth={1060}
        />
      </SectionCard>
      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar siniestro"
        description={`¿Eliminar el siniestro "${all.find((c) => c.id === deleteId)?.claimNumber ?? ''}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
