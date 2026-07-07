import { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { Plus, Flame, ShieldCheck, ShieldOff, AlertTriangle, Eye, RefreshCw, X, Trash2 } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { ColumnConfigButton } from '../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../shared/components/data-table/ExportPresetsButton'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { MultiSelectFilter } from '../../shared/components/filters/MultiSelectFilter'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { fireExtinguishersApi, fireExtinguisherKeys } from '../../shared/api/fire-extinguishers.api'
import type { RechargeInput } from '../../shared/api/fire-extinguishers.api'
import { assetsApi } from '../../shared/api/assets.api'
import { FIRE_EXT_STATUS_LABELS, LOCATION_TYPES } from '../../shared/constants'
import { RechargeModal } from './RechargeModal'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { useColumnConfig } from '../../shared/hooks/useColumnConfig'
import { FIRE_EXT_ESTABLISHMENTS } from '../../shared/types'
import type { FireExtinguisher, TableColumn } from '../../shared/types'

const STATUS_OPTIONS = Object.entries(FIRE_EXT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const LOCATION_OPTIONS = Object.entries(LOCATION_TYPES).map(([value, label]) => ({ value, label }))
const ESTABLISHMENT_OPTIONS = FIRE_EXT_ESTABLISHMENTS.map((e) => ({ value: e, label: e }))

function getExpiryFlags(fe: FireExtinguisher) {
  const days = daysUntil(fe.expirationDate)
  const isExp = days < 0
  const isSoon = !isExp && days <= 30
  return { days, isExp, isSoon }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FireExtinguishersPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterLocation, setFilterLocation] = useState<string[]>([])
  const [filterEstablishment, setFilterEstablishment] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showRechargeModal, setShowRechargeModal] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: all = [], isError } = useQuery({ queryKey: fireExtinguisherKeys.all, queryFn: () => fireExtinguishersApi.findAll() })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })

  const assetById = useMemo(() => new Map(allAssets.map((a) => [a.id, a])), [allAssets])

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const feRowClassName = useCallback(
    (fe: FireExtinguisher, idx: number) => {
      const isSelected = selectedIds.has(fe.id)
      const { isExp, isSoon } = getExpiryFlags(fe)
      return clsx(
        isSelected ? 'bg-blue-50/60 hover:bg-blue-50' : idx % 2 === 1 ? 'bg-slate-50/40 hover:bg-slate-50' : 'hover:bg-slate-50/60',
        isExp && !isSelected && 'border-l-2 border-l-red-400',
        isSoon && !isSelected && !isExp && 'border-l-2 border-l-amber-400',
      )
    },
    [selectedIds],
  )

  const FE_COL_DEFS: TableColumn<FireExtinguisher>[] = useMemo(() => [
    {
      id: 'code',
      key: 'code',
      label: 'Código',
      defaultVisible: true,
      hideable: true,
      render: (v) => <span className="font-mono text-xs text-slate-600">{v as string}</span>,
    },
    {
      id: 'internalNumber',
      key: 'internalNumber',
      label: 'Número interno',
      defaultVisible: false,
      hideable: true,
      render: (v) => (v ? <span className="font-mono text-xs text-slate-600">{v as string}</span> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'cylinderNumber',
      key: 'cylinderNumber',
      label: 'N° Cilindro',
      defaultVisible: false,
      hideable: true,
      render: (v) => (v ? <span className="font-mono text-xs text-slate-600">{v as string}</span> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'type',
      key: 'type',
      label: 'Tipo',
      defaultVisible: true,
      hideable: true,
      render: (v) => <span className="font-medium text-slate-800">{v as string}</span>,
    },
    { id: 'capacity', key: 'capacity', label: 'Cap.', defaultVisible: true, hideable: true, className: 'text-xs text-slate-500' },
    {
      id: 'brand',
      key: 'brand',
      label: 'Marca',
      defaultVisible: false,
      hideable: true,
      render: (v) => (v ? <span className="text-xs text-slate-600">{v as string}</span> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'manufacturingYear',
      key: 'manufacturingYear',
      label: 'Año Fab.',
      defaultVisible: false,
      hideable: true,
      render: (v) => (v != null ? <span className="text-xs text-slate-600 tabular-nums">{v as number}</span> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'establishment',
      key: 'establishment',
      label: 'Establecimiento',
      defaultVisible: true,
      hideable: true,
      render: (v) => (v ? <span className="text-xs text-slate-600">{v as string}</span> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'assetId',
      key: 'associatedAssetId',
      label: 'Activo / Ubicación',
      defaultVisible: true,
      hideable: true,
      exportValue: (row) => {
        const asset = row.associatedAssetId ? assetById.get(row.associatedAssetId) : null
        const locationLabel = LOCATION_TYPES[row.associatedLocationType] ?? row.associatedLocationType
        return asset ? `${asset.name} — ${locationLabel}` : locationLabel
      },
      render: (_, row) => {
        const asset = row.associatedAssetId ? assetById.get(row.associatedAssetId) : null
        const locationLabel = LOCATION_TYPES[row.associatedLocationType] ?? row.associatedLocationType
        return asset ? (
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
        )
      },
    },
    {
      id: 'location',
      key: 'location',
      label: 'Ubicación (detalle)',
      defaultVisible: false,
      hideable: true,
      render: (v) => (v ? <OverflowCell value={v as string} lines={1} className="text-xs text-slate-500 max-w-[180px]" /> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'chargeDate',
      key: 'chargeDate',
      label: 'Fecha Carga',
      defaultVisible: true,
      hideable: true,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      id: 'expirationDate',
      key: 'expirationDate',
      label: 'Vencimiento',
      defaultVisible: true,
      hideable: true,
      render: (v, row) => {
        const { isExp, isSoon } = getExpiryFlags(row)
        return (
          <span className={clsx('text-xs tabular-nums font-medium', isExp ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-slate-600')}>
            {formatDate(v as string)}
          </span>
        )
      },
    },
    {
      id: 'status',
      key: 'status',
      label: 'Estado',
      defaultVisible: true,
      hideable: true,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      id: 'daysUntil',
      key: 'expirationDate',
      label: 'Días',
      defaultVisible: true,
      hideable: true,
      render: (_, row) => {
        const { days, isExp, isSoon } = getExpiryFlags(row)
        return (
          <span
            className={clsx(
              'inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full',
              isExp ? 'bg-red-50 text-red-700' : isSoon ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
            )}
          >
            {isExp ? `−${Math.abs(days)}d` : `${days}d`}
          </span>
        )
      },
    },
    {
      id: 'observations',
      key: 'observations',
      label: 'Observaciones',
      defaultVisible: false,
      hideable: true,
      render: (v) => (v ? <OverflowCell value={v as string} lines={1} className="text-xs text-slate-500 max-w-[200px]" /> : <span className="text-slate-400">—</span>),
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      label: 'Fecha de alta',
      defaultVisible: false,
      hideable: true,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      id: 'actions',
      key: 'id',
      label: '',
      hideable: false,
      className: 'w-20',
      render: (_, row) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/fire-extinguishers/${row.id}`) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteId(row.id) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Eliminar matafuego"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ], [assetById, navigate])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('fire-extinguishers', FE_COL_DEFS)

  const counts = useMemo(() => ({
    vigente:        all.filter((f) => f.status === 'vigente').length,
    proximo_vencer: all.filter((f) => f.status === 'proximo_vencer').length,
    vencido:        all.filter((f) => f.status === 'vencido').length,
  }), [all])

  const filtered = useMemo(() => {
    return all.filter((fe) => {
      const q = search.toLowerCase()
      const asset = fe.associatedAssetId ? assetById.get(fe.associatedAssetId) : null
      const matchSearch =
        !search ||
        fe.code.toLowerCase().includes(q) ||
        fe.type.toLowerCase().includes(q) ||
        (fe.internalNumber?.toLowerCase().includes(q) ?? false) ||
        (fe.cylinderNumber?.toLowerCase().includes(q) ?? false) ||
        (fe.establishment?.toLowerCase().includes(q) ?? false) ||
        (fe.location?.toLowerCase().includes(q) ?? false) ||
        (fe.brand?.toLowerCase().includes(q) ?? false) ||
        (asset?.name.toLowerCase().includes(q) ?? false)
      const matchStatus        = filterStatus.length === 0        || filterStatus.includes(fe.status)
      const matchLocation      = filterLocation.length === 0      || filterLocation.includes(fe.associatedLocationType)
      const matchEstablishment = filterEstablishment.length === 0 || (fe.establishment != null && filterEstablishment.includes(fe.establishment))
      return matchSearch && matchStatus && matchLocation && matchEstablishment
    })
  }, [all, assetById, search, filterStatus, filterLocation, filterEstablishment])

  // Selection helpers
  const selectedCount = selectedIds.size

  function toggleAll(checked: boolean) {
    setSelectedIds(checked ? new Set(filtered.map((fe) => fe.id)) : new Set())
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleRecharge(data: RechargeInput) {
    await fireExtinguishersApi.bulkRecharge([...selectedIds], data)
    queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
    setShowRechargeModal(false)
    setSelectedIds(new Set())
  }

  async function handleDelete(id: string) {
    await fireExtinguishersApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
    setDeleteId(null)
  }

  const selectedExtinguishers = useMemo(
    () => all.filter((fe) => selectedIds.has(fe.id)),
    [all, selectedIds],
  )

  if (isError) return <PageContent><ErrorState /></PageContent>

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

      <MetricGrid cols={4} className="mb-5">
        <KpiCard label="Vigentes"          value={counts.vigente}        description="Con carga al día"                icon={ShieldCheck} variant="success" />
        <KpiCard label="Próximos a Vencer" value={counts.proximo_vencer} description="Vencen en los próximos 30 días" icon={AlertTriangle} variant="warning" />
        <KpiCard label="Vencidos"          value={counts.vencido}        description="Requieren recarga inmediata"     icon={ShieldOff} variant={counts.vencido > 0 ? 'danger' : 'default'} />
        <KpiCard label="Total"             value={all.length}            description="Matafuegos registrados"          icon={Flame} variant="default" />
      </MetricGrid>

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

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por código, tipo, cilindro, establecimiento, ubicación, marca o activo…"
            className="w-full sm:w-72"
          />
          <MultiSelectFilter
            label="Estado"
            options={STATUS_OPTIONS}
            value={filterStatus}
            onChange={setFilterStatus}
          />
          <MultiSelectFilter
            label="Ubicación"
            options={LOCATION_OPTIONS}
            value={filterLocation}
            onChange={setFilterLocation}
          />
          <MultiSelectFilter
            label="Establecimiento"
            options={ESTABLISHMENT_OPTIONS}
            value={filterEstablishment}
            onChange={setFilterEstablishment}
          />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} de {all.length} matafuegos
            </span>
            <ExportPresetsButton
              tableKey="fire-extinguishers"
              allColumns={FE_COL_DEFS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="matafuegos"
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

        <DataTable
          columns={visibleColumns}
          data={filtered}
          rowKey="id"
          selectable
          selectedIds={selectedIds}
          onToggleOne={toggleOne}
          onToggleAll={toggleAll}
          rowClassName={feRowClassName}
          onRowClick={(row) => navigate(`/fire-extinguishers/${row.id}`)}
          emptyTitle="Sin matafuegos"
          emptyDescription="No se encontraron matafuegos con los filtros aplicados."
          minWidth={900}
        />
      </SectionCard>

      {showRechargeModal && (
        <RechargeModal
          extinguishers={selectedExtinguishers}
          onConfirm={handleRecharge}
          onClose={() => setShowRechargeModal(false)}
        />
      )}

      <ConfirmDialog
        open={deleteId !== null}
        title="Eliminar matafuego"
        description={`¿Eliminar el matafuego "${all.find((f) => f.id === deleteId)?.code ?? ''}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => deleteId && handleDelete(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </PageContent>
  )
}
