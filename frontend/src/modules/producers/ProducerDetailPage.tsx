import { useParams, useNavigate } from 'react-router-dom'
import {
  Phone, Mail, MapPin, Hash, ShieldCheck, ClipboardList, AlertTriangle,
  Calendar, Flag, Eye,
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
import { producerRepository } from '../../services/repositories/producer.repository'
import { policyRepository } from '../../services/repositories/policy.repository'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '../../shared/constants'
import type { Policy, ProducerTask, TableColumn } from '../../shared/types'

export default function ProducerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const producer = producerRepository.findById(id!)

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

  const policies = policyRepository.findByProducer(producer.id)
  const tasks = producerRepository.findTasksByProducer(producer.id)
  const taskSummary = producerRepository.getTaskSummaryByProducer(producer.id)

  const pendingCount = taskSummary.pendiente + taskSummary.en_curso
  const overdueCount = taskSummary.vencida

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
          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
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
      render: (v) => <span className="font-medium text-slate-800">{String(v)}</span>,
      className: 'max-w-[200px]',
    },
    {
      key: 'description',
      label: 'Descripción',
      render: (v) => (
        <span className="text-xs text-slate-500 line-clamp-1">{String(v)}</span>
      ),
      className: 'max-w-[260px]',
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
        subtitle={`Matrícula ${producer.registrationNumber}`}
        category="Productor"
        backTo="/producers"
        backLabel="Volver a Productores"
        badge={<StatusPill status={producer.status} />}
        actions={
          <button className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
            Editar
          </button>
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
          description={`${taskSummary.en_curso} en curso, ${taskSummary.pendiente} sin iniciar`}
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
