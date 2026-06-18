import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Plus, ClipboardList, Clock, CheckCircle2, AlertTriangle, Edit2 } from 'lucide-react'
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
import { producerRepository } from '../../services/repositories/producer.repository'
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { ProducerTask, TableColumn } from '../../shared/types'

const STATUS_OPTIONS = Object.entries(TASK_STATUS_LABELS).map(([value, label]) => ({ value, label }))
const PRIORITY_OPTIONS = Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({ value, label }))

export default function ProducerTasksPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterProducer, setFilterProducer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  const allTasks = producerRepository.findAllTasks()
  const allProducers = producerRepository.findAll()

  const producerOptions = [
    { value: '__none__', label: '— Tareas propias' },
    ...allProducers.map((p) => ({ value: p.id, label: p.name })),
  ]

  const filtered = useMemo(() => {
    return allTasks.filter((task) => {
      const producer = allProducers.find((p) => p.id === task.producerId)
      const matchSearch =
        !search ||
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        task.description.toLowerCase().includes(search.toLowerCase()) ||
        (producer?.name ?? '').toLowerCase().includes(search.toLowerCase())
      const matchProducer =
        !filterProducer ||
        (filterProducer === '__none__' ? task.producerId === null : task.producerId === filterProducer)
      const matchStatus = !filterStatus || task.status === filterStatus
      const matchPriority = !filterPriority || task.priority === filterPriority
      return matchSearch && matchProducer && matchStatus && matchPriority
    })
  }, [allTasks, allProducers, search, filterProducer, filterStatus, filterPriority])

  // KPIs
  const pendingCount = allTasks.filter((t) => t.status === 'pendiente').length
  const inProgressCount = allTasks.filter((t) => t.status === 'en_curso').length
  const overdueCount = allTasks.filter((t) => t.status === 'vencida').length
  const completedCount = allTasks.filter((t) => t.status === 'finalizada').length

  // Table columns
  const columns: TableColumn<ProducerTask>[] = [
    {
      key: 'title',
      label: 'Título',
      render: (v) => (
        <div className="min-w-0 max-w-[200px]">
          <OverflowCell value={String(v)} lines={1} className="font-medium text-slate-800 text-sm" />
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Descripción',
      render: (v) => (
        <div className="min-w-0 max-w-[280px]">
          <OverflowCell value={String(v)} lines={2} className="text-xs text-slate-500" />
        </div>
      ),
    },
    {
      key: 'producerId',
      label: 'Productor',
      render: (v) => {
        if (!v) return <span className="text-xs text-slate-400 italic">— Tarea propia</span>
        const producer = allProducers.find((p) => p.id === v)
        return (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/producers/${v}`) }}
            className="text-left min-w-0 max-w-[160px] block group"
          >
            <OverflowCell value={producer?.name ?? String(v)} lines={1} className="text-xs text-blue-600 group-hover:underline" />
          </button>
        )
      },
    },
    {
      key: 'policyId',
      label: 'Póliza',
      render: (v) =>
        v ? (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/insurance/policies/${v}`) }}
            className="text-xs font-mono text-blue-600 hover:underline"
          >
            {String(v).replace('pol-', 'POL-')}
          </button>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: 'dueDate',
      label: 'Vence',
      render: (v) => {
        const days = daysUntil(v as string)
        return (
          <span
            className={`text-xs font-medium ${
              days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-600'
            }`}
          >
            {formatDate(v as string)}
            {days < 0 && <span className="ml-1 text-red-400">({Math.abs(days)}d atrás)</span>}
            {days >= 0 && days <= 7 && <span className="ml-1 text-amber-400">({days}d)</span>}
          </span>
        )
      },
    },
    {
      key: 'priority',
      label: 'Prioridad',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'id',
      label: '',
      className: 'w-10',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(ROUTES.TASKS_EDIT(row.id)) }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
          title="Editar tarea"
        >
          <Edit2 size={14} />
        </button>
      ),
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title="Gestión de Tareas"
        subtitle="Panel de tareas por productor"
        actions={
          <button
            onClick={() => navigate(ROUTES.TASKS_NEW)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nueva Tarea
          </button>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Pendientes"
          value={pendingCount}
          description="sin iniciar"
          icon={ClipboardList}
          variant={pendingCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="En Curso"
          value={inProgressCount}
          description="en ejecución activa"
          icon={Clock}
          variant={inProgressCount > 0 ? 'info' : 'default'}
        />
        <KpiCard
          label="Vencidas"
          value={overdueCount}
          description="superaron fecha límite"
          icon={AlertTriangle}
          variant={overdueCount > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          label="Finalizadas"
          value={completedCount}
          description="completadas exitosamente"
          icon={CheckCircle2}
          variant="success"
        />
      </MetricGrid>

      {/* Filters + Table */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por título, descripción o productor…"
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              {
                key: 'producer',
                label: 'Productor',
                options: producerOptions,
                value: filterProducer,
                onChange: setFilterProducer,
              },
              {
                key: 'status',
                label: 'Estado',
                options: STATUS_OPTIONS,
                value: filterStatus,
                onChange: setFilterStatus,
              },
              {
                key: 'priority',
                label: 'Prioridad',
                options: PRIORITY_OPTIONS,
                value: filterPriority,
                onChange: setFilterPriority,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {allTasks.length} tareas
          </span>
        </div>

        {/* Custom table with overdue row highlight */}
        <TasksTable tasks={filtered} columns={columns} onRowClick={(t) => navigate(ROUTES.TASKS_DETAIL(t.id))} />
      </SectionCard>
    </PageContent>
  )
}

// ─── Custom tasks table with overdue row left-border ─────────────────────────

function TasksTable({
  tasks,
  columns,
  onRowClick,
}: {
  tasks: ProducerTask[]
  columns: TableColumn<ProducerTask>[]
  onRowClick?: (task: ProducerTask) => void
}) {
  if (tasks.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          title="Sin tareas"
          description="No se encontraron tareas con los filtros aplicados."
        />
      </div>
    )
  }

  return (
    <TableShell minWidth={1050}>
      <table className="enterprise-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={String(col.key) + i}
                className={clsx(
                  'px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50',
                  col.headerClassName,
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, rowIdx) => {
            const isOverdue = task.status === 'vencida'
            return (
              <tr
                key={task.id}
                onClick={() => onRowClick?.(task)}
                className={clsx(
                  'border-b border-slate-100 transition-colors',
                  onRowClick && 'cursor-pointer hover:bg-blue-50/50',
                  rowIdx % 2 === 1 && 'bg-slate-50/40',
                  isOverdue && 'border-l-2 border-l-red-400',
                )}
              >
                {columns.map((col, colIdx) => {
                  const rawValue =
                    col.key in task ? (task as unknown as Record<string, unknown>)[col.key as string] : undefined
                  return (
                    <td
                      key={String(col.key) + colIdx}
                      className={clsx(
                        'px-4 py-3 text-sm text-slate-700 whitespace-nowrap',
                        col.className,
                      )}
                    >
                      {col.render
                        ? col.render(rawValue, task)
                        : rawValue !== null && rawValue !== undefined
                        ? String(rawValue)
                        : '—'}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableShell>
  )
}
