import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Flame, ShieldCheck, ShieldOff, AlertTriangle, Eye } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { fireExtinguisherRepository } from '../../services/repositories/fire-extinguisher.repository'
import { mockAssets } from '../../data/mock-assets'
import { FIRE_EXT_STATUS_LABELS, LOCATION_TYPES } from '../../shared/constants'
import type { FireExtinguisher, TableColumn } from '../../shared/types'

const STATUS_OPTIONS = Object.entries(FIRE_EXT_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const LOCATION_OPTIONS = Object.entries(LOCATION_TYPES).map(([value, label]) => ({ value, label }))

export default function FireExtinguishersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLocation, setFilterLocation] = useState('')

  const all = fireExtinguisherRepository.findAll()
  const counts = fireExtinguisherRepository.getCountByStatus()

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

  const columns: TableColumn<FireExtinguisher>[] = [
    {
      key: 'code',
      label: 'Código',
      className: 'font-mono text-xs text-slate-600 min-w-[120px]',
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (v) => <span className="text-sm text-slate-800 font-medium">{String(v)}</span>,
    },
    {
      key: 'capacity',
      label: 'Capacidad',
      render: (v) => <span className="text-xs text-slate-500">{String(v)}</span>,
    },
    {
      key: 'associatedAssetId',
      label: 'Activo / Ubicación',
      render: (v, row) => {
        const locationLabel = LOCATION_TYPES[row.associatedLocationType] ?? row.associatedLocationType
        if (!v) {
          return (
            <div className="min-w-0 max-w-[200px]">
              <span className="block text-xs text-slate-400">Sin activo</span>
              <span className="block text-xs text-slate-400">{locationLabel}</span>
            </div>
          )
        }
        const asset = mockAssets.find((a) => a.id === v)
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/assets/${v}`) }}
            className="text-left block min-w-0 max-w-[200px] group"
          >
            <OverflowCell value={asset?.name ?? String(v)} lines={1} className="text-xs text-blue-600 group-hover:underline" />
            <span className="block text-xs text-slate-400 mt-0.5">{locationLabel}</span>
          </button>
        )
      },
    },
    {
      key: 'chargeDate',
      label: 'Fecha Carga',
      render: (v) => (
        <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>
      ),
    },
    {
      key: 'expirationDate',
      label: 'Fecha Venc.',
      render: (v) => {
        const days = daysUntil(v as string)
        const isExp = days < 0
        const isSoon = !isExp && days <= 30
        return (
          <span className={`text-xs tabular-nums font-medium ${isExp ? 'text-red-600' : isSoon ? 'text-amber-600' : 'text-slate-600'}`}>
            {formatDate(v as string)}
          </span>
        )
      },
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'expirationDate',
      label: 'Días Restantes',
      render: (v) => {
        const days = daysUntil(v as string)
        const isExp = days < 0
        const isSoon = !isExp && days <= 30
        return (
          <span
            className={`inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${
              isExp
                ? 'bg-red-50 text-red-700'
                : isSoon
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {isExp ? `−${Math.abs(days)}d` : `${days}d`}
          </span>
        )
      },
    },
    {
      key: 'id',
      label: '',
      render: (_, row) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigate(`/fire-extinguishers/${row.id}`)
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

      {/* KPIs: Vigentes, Próximos, Vencidos, Total */}
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

      {/* Alert banner for expired extinguishers */}
      {counts.vencido > 0 && (
        <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>
              {counts.vencido} matafuego{counts.vencido !== 1 ? 's' : ''} vencido{counts.vencido !== 1 ? 's' : ''}
            </strong>{' '}
            requieren recarga inmediata.
          </span>
        </div>
      )}

      {/* Filters + Table */}
      <SectionCard noPadding>
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
        <DataTable
          columns={columns}
          data={filtered}
          rowKey="id"
          onRowClick={(row) => navigate(`/fire-extinguishers/${row.id}`)}
          emptyTitle="Sin matafuegos"
          emptyDescription="No se encontraron matafuegos con los filtros aplicados."
          minWidth={1000}
        />
      </SectionCard>
    </PageContent>
  )
}
