import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Phone, Mail, MapPin, Hash, ShieldCheck, ClipboardList, AlertTriangle,
  Calendar, Flag, Eye, Edit2, Plus,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatCurrencyCompact, formatDate, daysUntil } from '../../shared/utils/format'
import { producerQueries } from '../../shared/api/producers.api'
import { policyQueries } from '../../shared/api/policies.api'
import { OverflowCell } from '../../shared/components/data-table/OverflowCell'
import { TASK_STATUS_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { Policy, ProducerTask, TableColumn } from '../../shared/types'

export default function ProducerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: producer, isLoading: producerLoading } = useQuery(producerQueries.detail(id!))

  const { data: allPolicies = [] } = useQuery({ ...policyQueries.list(), enabled: !!producer })

  const { data: tasks = [] } = useQuery(producerQueries.tasks(id!))

  if (producerLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
      </PageContent>
    )
  }

  if (!producer) {
    return (
      <PageContent>
        <EmptyState
          title="Productor no encontrado"
          description="El productor solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  const policies = allPolicies.filter((p) => p.producerId === producer.id)

  const pendingCount = tasks.filter((t) => t.status === 'pendiente' || t.status === 'en_curso').length
  const overdueCount = tasks.filter((t) => t.status === 'vencida').length

  // Policy columns
  const policyColumns: TableColumn<Policy>[] = [
    {
      key: 'policyNumber',
      label: 'N° Póliza',
      className: 'font-mono text-slate-600 text-xs',
    },
    {
      key: 'insuranceType',
      label: 'Tipo',
      render: (v) => <span className="text-slate-700">{String(v)}</span>,
    },
    {
      key: 'insuranceCompany',
      label: 'Aseguradora',
      render: (v) => <span className="text-slate-600 text-xs">{String(v)}</span>,
    },
    {
      key: 'insuredAmountArs',
      label: 'Suma Aseg.',
      render: (v) => (
        <span className="font-semibold tabular-nums">
          {formatCurrencyCompact(v as number, 'ARS')}
        </span>
      ),
      headerClassName: 'text-right',
      className: 'text-right',
    },
    {
      key: 'endDate',
      label: 'Vence',
      render: (v) => {
        const days = daysUntil(v as string)
        return (
          <span className={`text-xs ${days < 0 ? 'text-red-600 font-medium' : days <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>
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
      key: 'id',
      label: '',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/insurance/policies/${row.id}`) }}
          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
        >
          <Eye size={14} />
        </button>
      ),
      className: 'w-10',
    },
  ]

  // Full tasks table columns
  const taskColumns: TableColumn<ProducerTask>[] = [
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
      key: 'dueDate',
      label: 'Vencimiento',
      render: (v) => {
        const days = daysUntil(v as string)
        return (
          <span className={`text-xs ${days < 0 ? 'text-red-600 font-semibold' : days <= 7 ? 'text-amber-600 font-medium' : 'text-slate-500'}`}>
            {formatDate(v as string)}
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
      key: 'assignedTo',
      label: 'Asignado a',
      render: (v) => <span className="text-xs text-slate-500">{v ? String(v) : '—'}</span>,
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

  // Tasks for sidebar list (pending + overdue, max 5)
  const upcomingTasks = tasks
    .filter((t) => t.status === 'pendiente' || t.status === 'en_curso' || t.status === 'vencida')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 5)

  return (
    <PageContent>
      <PageHeader
        title={producer.name}
        subtitle={producer.registrationNumber ? `Matrícula ${producer.registrationNumber}` : 'Sin matrícula registrada'}
        category="Productor"
        backTo="/producers"
        backLabel="Volver a Productores"
        badge={<StatusPill status={producer.status} />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`${ROUTES.TASKS_NEW}?producerId=${producer.id}`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Plus size={14} />
              Nueva Tarea
            </button>
            <button
              onClick={() => navigate(ROUTES.PRODUCERS_EDIT(producer.id))}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Edit2 size={14} />
              Editar
            </button>
          </div>
        }
      />

      {/* Contact strip */}
      <div className="card px-5 py-3 mb-5 flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Phone size={14} className="text-slate-400" />
          {producer.phone}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Mail size={14} className="text-slate-400" />
          {producer.email}
        </div>
        {producer.address && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <MapPin size={14} className="text-slate-400" />
            {producer.address}
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Hash size={14} className="text-slate-400" />
          Alta: {formatDate(producer.createdAt)}
        </div>
      </div>

      {/* KPIs */}
      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label="Pólizas Gestionadas"
          value={policies.length}
          description={`${policies.filter((p) => p.status === 'vigente').length} vigentes`}
          icon={ShieldCheck}
          variant="info"
        />
        <KpiCard
          label="Tareas Pendientes"
          value={pendingCount}
          description={`${tasks.filter((t) => t.status === 'en_curso').length} en curso, ${tasks.filter((t) => t.status === 'pendiente').length} sin iniciar`}
          icon={ClipboardList}
          variant={pendingCount > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Tareas Vencidas"
          value={overdueCount}
          description="requieren atención inmediata"
          icon={AlertTriangle}
          variant={overdueCount > 0 ? 'danger' : 'success'}
        />
      </MetricGrid>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
        {/* Left: policies table */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Pólizas Gestionadas"
            subtitle={`${policies.length} pólizas en cartera`}
            noPadding
          >
            <DataTable
              columns={policyColumns}
              data={policies}
              rowKey="id"
              onRowClick={(row) => navigate(`/insurance/policies/${row.id}`)}
              emptyTitle="Sin pólizas"
              emptyDescription="Este productor no tiene pólizas asociadas."
            />
          </SectionCard>
        </div>

        {/* Right: upcoming tasks list */}
        <div className="lg:col-span-2">
          <SectionCard title="Tareas Asignadas" subtitle="Pendientes y en curso">
            {upcomingTasks.length === 0 ? (
              <EmptyState title="Sin tareas activas" description="No hay tareas pendientes para este productor." />
            ) : (
              <div className="space-y-3">
                {upcomingTasks.map((task) => (
                  <TaskListItem key={task.id} task={task} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Full tasks section */}
      <SectionCard
        title="Todas las Tareas"
        subtitle={`Historial completo — ${tasks.length} tareas`}
        noPadding
      >
        <DataTable
          columns={taskColumns}
          data={tasks}
          rowKey="id"
          emptyTitle="Sin tareas"
          emptyDescription="Este productor no tiene tareas registradas."
          minWidth={900}
        />
      </SectionCard>
    </PageContent>
  )
}

// ─── Task list item (sidebar) ─────────────────────────────────────────────────

function TaskListItem({ task }: { task: ProducerTask }) {
  const days = daysUntil(task.dueDate)
  const isOverdue = days < 0

  return (
    <div className={`rounded-lg border p-3 ${isOverdue ? 'border-red-200 bg-red-50/40' : 'border-slate-100 bg-slate-50/40'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-medium text-slate-800 leading-snug flex-1 min-w-0">{task.title}</p>
        <StatusPill status={task.priority} size="sm" />
      </div>
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <Calendar size={10} />
          <span className={isOverdue ? 'text-red-600 font-medium' : days <= 7 ? 'text-amber-600' : ''}>
            {formatDate(task.dueDate)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Flag size={10} />
          {TASK_STATUS_LABELS[task.status] ?? task.status}
        </span>
      </div>
    </div>
  )
}
