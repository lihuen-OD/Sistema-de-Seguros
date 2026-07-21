import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus, ShieldAlert, Clock, CheckCircle2, Eye, Edit2, Trash2, X,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { MultiSelectFilter } from '../../shared/components/filters/MultiSelectFilter'
import { DateRangeMonthPicker } from '../../shared/components/filters/DateRangeMonthPicker'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { claimsApi, claimKeys, claimQueries } from '../../shared/api/claims.api'
import { assetQueries } from '../../shared/api/assets.api'
import { policyQueries } from '../../shared/api/policies.api'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { CLAIM_STATUS_STYLES, CLAIM_STATUS_ICONS, CLAIM_STATUS_DEFAULT_ICON } from '../../shared/constants/claim-status'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
import type { Claim, TableColumn } from '../../shared/types'

const STATUS_OPTIONS = Object.keys(CLAIM_STATUS_STYLES).map((s) => ({ value: s, label: s }))

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClaimsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterType, setFilterType] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: all = [], isLoading, isError } = useQuery(claimQueries.list())
  const { data: allAssets = [] } = useQuery(assetQueries.list())
  const { data: allPolicies = [] } = useQuery(policyQueries.list())

  const TYPE_OPTIONS = useMemo(() => {
    const unique = [...new Set(all.map((c) => c.claimType))].sort()
    return unique.map((v) => ({ value: v, label: v }))
  }, [all])

  async function handleDelete(id: string) {
    await claimsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: claimKeys.all })
    setDeleteId(null)
  }

  const counts = useMemo(() => ({
    denunciado: all.filter((c) => c.status === 'Denunciado').length,
    en_tramite: all.filter((c) => c.status === 'En trámite').length,
    liquidado: all.filter((c) => c.status === 'Liquidado').length,
    rechazado: all.filter((c) => c.status === 'Rechazado').length,
    cerrado: all.filter((c) => c.status === 'Cerrado').length,
  }), [all])

  const totals = useMemo(() => ({
    totalClaimed: all.reduce((s, c) => s + c.claimedAmountArs, 0),
    totalSettled: all.reduce((s, c) => s + (c.settledAmountArs ?? 0), 0),
  }), [all])

  const assetById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets])
  const policyById = useMemo(() => new Map(allPolicies.map((p) => [p.id, p])), [allPolicies])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all.filter((c) => {
      const asset = c.assetId ? assetById.get(c.assetId) : null
      const matchSearch =
        !search ||
        c.claimNumber.toLowerCase().includes(q) ||
        c.insuranceCompany.toLowerCase().includes(q) ||
        (asset?.name.toLowerCase().includes(q) ?? false) ||
        c.claimType.toLowerCase().includes(q)
      const matchStatus = filterStatus.length === 0 || filterStatus.includes(c.status)
      const matchType   = filterType.length === 0   || filterType.includes(c.claimType)
      const date = c.occurrenceDate ?? ''
      const matchDateFrom = !filterDateFrom || date.slice(0, 7) >= filterDateFrom
      const matchDateTo   = !filterDateTo   || date.slice(0, 7) <= filterDateTo
      return matchSearch && matchStatus && matchType && matchDateFrom && matchDateTo
    })
  }, [all, assetById, search, filterStatus, filterType, filterDateFrom, filterDateTo])

  const inProgress = counts.denunciado + counts.en_tramite

  const ALL_COLUMNS: TableColumn<Claim>[] = useMemo(() => [
    {
      id: 'claimNumber',
      key: 'claimNumber',
      label: 'N° Siniestro',
      defaultVisible: true,
      className: 'font-mono text-xs text-slate-600 min-w-[140px]',
    },
    {
      id: 'claimType',
      key: 'claimType',
      label: 'Tipo',
      defaultVisible: true,
      render: (v) => <span className="text-sm text-slate-800 font-medium">{String(v)}</span>,
    },
    {
      id: 'assetId',
      key: 'assetId',
      label: 'Activo',
      defaultVisible: true,
      exportValue: (row) => {
        const a = row.assetId ? assetById.get(row.assetId) : null
        return a ? `${a.name} (${a.internalCode})` : ''
      },
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400">—</span>
        const asset = assetById.get(v as string)
        if (!asset) return <span className="text-xs text-slate-400">—</span>
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/assets/${v}`) }}
            className="text-left block min-w-0 max-w-[200px] group"
          >
            <OverflowCell value={asset.name} lines={1} className="text-xs text-brand-600 group-hover:underline" />
            <span className="block text-slate-400 font-mono text-[10px] mt-0.5">{asset.internalCode}</span>
          </button>
        )
      },
    },
    {
      id: 'policyId',
      key: 'policyId',
      label: 'Póliza',
      defaultVisible: true,
      exportValue: (row) => {
        const p = row.policyId ? policyById.get(row.policyId) : null
        return p?.policyNumber ?? ''
      },
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400">—</span>
        const pol = policyById.get(v as string)
        return pol
          ? <span className="text-xs font-mono text-slate-600">{pol.policyNumber}</span>
          : <span className="text-xs text-slate-400">—</span>
      },
    },
    {
      id: 'occurrenceDate',
      key: 'occurrenceDate',
      label: 'Fecha hecho',
      defaultVisible: true,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      id: 'insuranceCompany',
      key: 'insuranceCompany',
      label: 'Aseguradora',
      defaultVisible: true,
      render: (v) => <span className="text-xs text-slate-600">{String(v)}</span>,
    },
    {
      id: 'claimedAmountArs',
      key: 'claimedAmountArs',
      label: 'Reclamado',
      defaultVisible: true,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => String(row.claimedAmountArs),
      render: (v) => (
        <span className="text-sm font-semibold text-slate-800 tabular-nums">
          {formatCurrencyCompact(v as number, 'ARS')}
        </span>
      ),
    },
    {
      id: 'settledAmountArs',
      key: 'settledAmountArs',
      label: 'Liquidado',
      defaultVisible: true,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => row.settledAmountArs != null ? String(row.settledAmountArs) : '',
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
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      render: (v) => (
        <StatusPill status={String(v)} icon={CLAIM_STATUS_ICONS[String(v)] ?? CLAIM_STATUS_DEFAULT_ICON} size="sm" />
      ),
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'reportDate',
      key: 'reportDate',
      label: 'Fecha denuncia',
      defaultVisible: false,
      render: (v) =>
        v
          ? <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'realAmountArs',
      key: 'realAmountArs',
      label: 'Monto real ARS',
      defaultVisible: false,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => row.realAmountArs != null ? String(row.realAmountArs) : '',
      render: (v) =>
        v != null && (v as number) > 0
          ? <span className="tabular-nums text-slate-700">{formatCurrencyCompact(v as number, 'ARS')}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'deductibleArs',
      key: 'deductibleArs',
      label: 'Franquicia ARS',
      defaultVisible: false,
      headerClassName: 'text-right',
      className: 'text-right',
      exportValue: (row) => row.deductibleArs != null ? String(row.deductibleArs) : '',
      render: (v) =>
        v != null && (v as number) > 0
          ? <span className="tabular-nums text-slate-700">{formatCurrencyCompact(v as number, 'ARS')}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'currency',
      key: 'currency',
      label: 'Moneda',
      defaultVisible: false,
      render: (v) =>
        v
          ? <span className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{String(v)}</span>
          : <span className="text-slate-400">—</span>,
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
      id: 'observations',
      key: 'observations',
      label: 'Observaciones',
      defaultVisible: false,
      render: (v) => (
        <div className="max-w-[200px]">
          <OverflowCell value={(v as string) || null} lines={1} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      label: 'Fecha de alta',
      defaultVisible: false,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    // ── Acciones ────────────────────────────────────────────────────────────────
    {
      id: 'actions',
      key: 'id',
      label: '',
      hideable: false,
      className: 'w-20',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/claims/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/claims/${row.id}/edit`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Editar"
            aria-label="Editar"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar siniestro"
            aria-label="Eliminar siniestro"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ], [navigate, assetById, policyById])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('claims', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Siniestros"
        subtitle="Gestión y seguimiento de siniestros asociados a activos y pólizas"
        actions={
          <button
            onClick={() => navigate('/claims/new')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Siniestro
          </button>
        }
      />

      <MetricGrid cols={4} className="mb-5">
        <KpiCard label="En Gestión" value={inProgress} description="Denunciados o en trámite" icon={Clock} variant={inProgress > 0 ? 'warning' : 'default'} />
        <KpiCard label="Liquidados" value={counts.liquidado} description="Con indemnización aprobada" icon={CheckCircle2} variant="success" />
        <KpiCard label="Monto Reclamado" value={formatCurrencyCompact(totals.totalClaimed, 'ARS')} description="Total histórico reclamado" icon={ShieldAlert} variant="info" />
        <KpiCard label="Monto Liquidado" value={formatCurrencyCompact(totals.totalSettled, 'ARS')} description="Total indemnizado efectivo" icon={CheckCircle2} variant={totals.totalSettled > 0 ? 'success' : 'default'} />
      </MetricGrid>

      {inProgress > 0 && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <Clock size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>{inProgress} siniestro{inProgress !== 1 ? 's' : ''}</strong> en gestión activa requieren
            seguimiento con la aseguradora.
          </span>
        </div>
      )}

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por N° siniestro, activo, aseguradora…"
            className="w-full sm:w-80"
          />
          <MultiSelectFilter label="Estado" options={STATUS_OPTIONS} value={filterStatus} onChange={setFilterStatus} />
          <MultiSelectFilter label="Tipo" options={TYPE_OPTIONS} value={filterType} onChange={setFilterType} />
          <DateRangeMonthPicker
            from={filterDateFrom}
            to={filterDateTo}
            onChange={(from, to) => { setFilterDateFrom(from); setFilterDateTo(to) }}
          />
          {(filterDateFrom || filterDateTo) && (
            <button
              type="button"
              onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <X size={12} />
              Limpiar fechas
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} de {all.length} siniestros
            </span>
            <ExportPresetsButton
              tableKey="claims"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="siniestros"
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
          onRowClick={(row) => navigate(`/claims/${row.id}`)}
          emptyTitle="Sin siniestros"
          emptyDescription="No se encontraron siniestros con los filtros aplicados."
          minWidth={900}
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
