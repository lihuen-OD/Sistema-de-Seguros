import { MetricGrid } from '../cards/MetricGrid'
import { KpiCard } from '../cards/KpiCard'
import { SectionCard } from '../cards/SectionCard'
import { DataTable } from '../data-table/DataTable'
import { FilterBar } from '../filters/FilterBar'
import { SearchInput } from '../filters/SearchInput'
import { ConfirmDialog } from '../dialogs/ConfirmDialog'
import type { TableColumn } from '../../types'

export interface SimpleCrudKpi {
  label: string
  value: number
  description: string
  icon: React.ElementType
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
}

export interface SimpleCrudDeleteConfirm {
  open: boolean
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
}

interface SimpleCrudManagerProps<T extends object> {
  kpis: SimpleCrudKpi[]
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  isLoading: boolean
  totalCount: number
  filteredCount: number
  entityLabelPlural: string
  emptyTitle: string
  emptyDescription: string
  columns: TableColumn<T>[]
  data: T[]
  rowKey: keyof T
  tableKey: string
  minWidth?: number
  deleteConfirm: SimpleCrudDeleteConfirm
}

const STATUS_FILTER_OPTIONS = [
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
]

// Cascarón compartido por las páginas de catálogo simple (Bienes de Uso,
// Centros de Costo, Perfiles de Acceso: misma fila de KPIs Total/Activos/
// Inactivos, misma barra de búsqueda + filtro de Estado + tabla, mismo
// diálogo de borrado). El modal de alta/edición NO va acá — sus campos son
// distintos por página (ver FixedAssetModal/AccessProfileModal/
// CostCenterModal), así que cada página sigue rindiéndolo por su cuenta con
// el componente <Modal> compartido.
export function SimpleCrudManager<T extends object>({
  kpis,
  search,
  onSearchChange,
  searchPlaceholder,
  statusFilter,
  onStatusFilterChange,
  isLoading,
  totalCount,
  filteredCount,
  entityLabelPlural,
  emptyTitle,
  emptyDescription,
  columns,
  data,
  rowKey,
  tableKey,
  minWidth,
  deleteConfirm,
}: SimpleCrudManagerProps<T>) {
  return (
    <>
      <MetricGrid cols={3} className="mb-6">
        {kpis.map((kpi) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            description={kpi.description}
            icon={kpi.icon}
            variant={kpi.variant ?? 'default'}
          />
        ))}
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              {
                key: 'status',
                label: 'Estado',
                options: STATUS_FILTER_OPTIONS,
                value: statusFilter,
                onChange: onStatusFilterChange,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {isLoading ? 'Cargando…' : `${filteredCount} de ${totalCount} ${entityLabelPlural}`}
          </span>
        </div>
        <DataTable
          tableKey={tableKey}
          columns={columns}
          data={data}
          rowKey={rowKey}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          minWidth={minWidth}
        />
      </SectionCard>

      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        confirmLabel="Eliminar"
        onConfirm={deleteConfirm.onConfirm}
        onCancel={deleteConfirm.onCancel}
      />
    </>
  )
}
