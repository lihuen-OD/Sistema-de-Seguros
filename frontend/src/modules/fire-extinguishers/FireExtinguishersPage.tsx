import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, Flame, ShieldCheck, ShieldOff, AlertTriangle, Eye, RefreshCw, X } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { TableShell } from '../../shared/components/data-table/TableShell'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { fireExtinguisherRepository } from '../../services/repositories/fire-extinguisher.repository'
import type { RechargeData } from '../../services/repositories/fire-extinguisher.repository'
import { mockAssets } from '../../data/mock-assets'
import { FIRE_EXT_STATUS_LABELS, LOCATION_TYPES } from '../../shared/constants'
import { RechargeModal } from './RechargeModal'
import type { FireExtinguisher } from '../../shared/types'

const STATUS_OPTIONS = Object.entries(FIRE_EXT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const LOCATION_OPTIONS = Object.entries(LOCATION_TYPES).map(([value, label]) => ({ value, label }))

// ─── SelectAll checkbox (handles indeterminate) ───────────────────────────────

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (v: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600"
    />
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FireExtinguishersPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLocation, setFilterLocation] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showRechargeModal, setShowRechargeModal] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const all = useMemo(() => fireExtinguisherRepository.findAll(), [refreshKey])
  const counts = useMemo(() => fireExtinguisherRepository.getCountByStatus(), [refreshKey])

  const filtered = useMemo(() => {
    return all.filter((fe) => {
      const q = search.toLowerCase()
      const asset = fe.associatedAssetId
        ? mockAssets.find((a) => a.id === fe.associatedAssetId)
        : null
      const matchSearch =
        !search ||
        fe.code.toLowerCase().includes(q) ||
        fe.type.toLowerCase().includes(q) ||
        (asset?.name.toLowerCase().includes(q) ?? false)
      const matchStatus = !filterStatus || fe.status === filterStatus
      const matchLocation = !filterLocation || fe.associatedLocationType === filterLocation
      return matchSearch && matchStatus && matchLocation
    })
  }, [all, search, filterStatus, filterLocation])

  // Selection helpers
  const selectedCount = selectedIds.size
  const allFilteredSelected = filtered.length > 0 && filtered.every((fe) => selectedIds.has(fe.id))
  const someFilteredSelected = filtered.some((fe) => selectedIds.has(fe.id))

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filtered.map((fe) => fe.id)) : new Set())
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function handleRecharge(data: RechargeData) {
    fireExtinguisherRepository.bulkRecharge([...selectedIds], data)
    setShowRechargeModal(false)
    setSelectedIds(new Set())
    setRefreshKey((k) => k + 1)
  }

  // Extinguishers selected (for modal)
  const selectedExtinguishers = useMemo(
    () => all.filter((fe) => selectedIds.has(fe.id)),
    [all, selectedIds],
  )

  return (
    <PageContent>
      <PageHeader
        title="Matafuegos"
        subtitle="Control de vencimientos y estado del parque"
        actions={
          <button
            onClick={() => navigate('/fire-extinguishers/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Matafuego
          </button>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-5">
        <KpiCard
          label="Vigentes"
          value={counts.vigente}
          description="Con carga al día"
          icon={ShieldCheck}
          variant="success"
        />
        <KpiCard
          label="Próximos a Vencer"
          value={counts.proximo_vencer}
          description="Vencen en los próximos 30 días"
          icon={AlertTriangle}
          variant="warning"
        />
        <KpiCard
          label="Vencidos"
          value={counts.vencido}
          description="Requieren recarga inmediata"
          icon={ShieldOff}
          variant={counts.vencido > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          label="Total"
          value={all.length}
          description="Matafuegos registrados"
          icon={Flame}
          variant="default"
        />
      </MetricGrid>

      {/* Alert banner */}
      {counts.vencido > 0 && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>
              {counts.vencido} matafuego{counts.vencido !== 1 ? 's' : ''} vencido{counts.vencido !== 1 ? 's' : ''}
            </strong>{' '}
            requieren recarga inmediata. Seleccionálos en la tabla para registrar la recarga en bloque.
          </span>
        </div>
      )}

      {/* Table card */}
      <SectionCard noPadding>
        {/* Filter bar */}
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, tipo o activo…"
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
                key: 'location',
                label: 'Ubicación',
                options: LOCATION_OPTIONS,
                value: filterLocation,
                onChange: setFilterLocation,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {all.length} matafuegos
          </span>
        </div>

        {/* Selection action strip */}
        {selectedCount > 0 && (
          <div className="px-5 py-2.5 bg-blue-50 border-b border-blue-100 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-blue-800">
              {selectedCount} matafuego{selectedCount !== 1 ? 's' : ''} seleccionado{selectedCount !== 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setShowRechargeModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <RefreshCw size={13} />
              Registrar Recarga
            </button>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 rounded-lg transition-colors ml-auto"
            >
              <X size={13} />
              Limpiar selección
            </button>
          </div>
        )}

        {/* Table */}
        <FireExtTable
          extinguishers={filtered}
          selectedIds={selectedIds}
          allSelected={allFilteredSelected}
          someSelected={someFilteredSelected}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          onNavigate={(id) => navigate(`/fire-extinguishers/${id}`)}
        />
      </SectionCard>

      {/* Recharge modal */}
      {showRechargeModal && (
        <RechargeModal
          extinguishers={selectedExtinguishers}
          onConfirm={handleRecharge}
          onClose={() => setShowRechargeModal(false)}
        />
      )}
    </PageContent>
  )
}

// ─── Custom table with checkboxes ─────────────────────────────────────────────

interface FireExtTableProps {
  extinguishers: FireExtinguisher[]
  selectedIds: Set<string>
  allSelected: boolean
  someSelected: boolean
  onToggleAll: (checked: boolean) => void
  onToggleOne: (id: string) => void
  onNavigate: (id: string) => void
}

function FireExtTable({
  extinguishers,
  selectedIds,
  allSelected,
  someSelected,
  onToggleAll,
  onToggleOne,
  onNavigate,
}: FireExtTableProps) {
  const navigate = useNavigate()

  if (extinguishers.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="Sin matafuegos"
          description="No se encontraron matafuegos con los filtros aplicados."
        />
      </div>
    )
  }

  return (
    <TableShell minWidth={1040}>
      <table className="enterprise-table">
        <thead>
          <tr>
            <th className="w-10 px-4 py-3 bg-slate-50">
              <SelectAllCheckbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={onToggleAll}
              />
            </th>
            {['Código', 'Tipo', 'Cap.', 'Activo / Ubicación', 'Fecha Carga', 'Fecha Venc.', 'Estado', 'Días', ''].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {extinguishers.map((fe, i) => {
            const isSelected = selectedIds.has(fe.id)
            const days = daysUntil(fe.expirationDate)
            const isExp = days < 0
            const isSoon = !isExp && days <= 30
            const asset = fe.associatedAssetId
              ? mockAssets.find((a) => a.id === fe.associatedAssetId)
              : null
            const locationLabel = LOCATION_TYPES[fe.associatedLocationType] ?? fe.associatedLocationType

            return (
              <tr
                key={fe.id}
                onClick={() => onNavigate(fe.id)}
                className={clsx(
                  'border-b border-slate-100 cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-blue-50/60 hover:bg-blue-50'
                    : i % 2 === 1
                    ? 'bg-slate-50/40 hover:bg-slate-50'
                    : 'hover:bg-slate-50/60',
                  isExp && !isSelected && 'border-l-2 border-l-red-400',
                  isSoon && !isSelected && !isExp && 'border-l-2 border-l-amber-400',
                )}
              >
                {/* Checkbox */}
                <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleOne(fe.id)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 cursor-pointer accent-blue-600"
                  />
                </td>

                {/* Code */}
                <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                  {fe.code}
                </td>

                {/* Type */}
                <td className="px-4 py-3 text-sm text-slate-800 font-medium whitespace-nowrap">
                  {fe.type}
                </td>

                {/* Capacity */}
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                  {fe.capacity}
                </td>

                {/* Asset / location */}
                <td className="px-4 py-3">
                  {asset ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/assets/${asset.id}`) }}
                      className="text-left block min-w-0 max-w-[200px] group"
                    >
                      <OverflowCell value={asset.name} lines={1} className="text-xs text-blue-600 group-hover:underline" />
                      <span className="block text-xs text-slate-400 mt-0.5">{locationLabel}</span>
                    </button>
                  ) : (
                    <div className="min-w-0 max-w-[200px]">
                      <span className="block text-xs text-slate-400">Sin activo</span>
                      <span className="block text-xs text-slate-400">{locationLabel}</span>
                    </div>
                  )}
                </td>

                {/* Charge date */}
                <td className="px-4 py-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                  {formatDate(fe.chargeDate)}
                </td>

                {/* Expiration date */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={clsx('text-xs tabular-nums font-medium', isExp ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-slate-600')}>
                    {formatDate(fe.expirationDate)}
                  </span>
                </td>

                {/* Status */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <StatusPill status={fe.status} size="sm" />
                </td>

                {/* Days badge */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={clsx(
                      'inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full',
                      isExp ? 'bg-red-50 text-red-700' : isSoon ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                    )}
                  >
                    {isExp ? `−${Math.abs(days)}d` : `${days}d`}
                  </span>
                </td>

                {/* Action */}
                <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => onNavigate(fe.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}
