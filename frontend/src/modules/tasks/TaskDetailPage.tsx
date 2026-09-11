import { useParams, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  Calendar,
  User,
  FileText,
  Package,
  Pencil,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { LoadingState } from '../../shared/components/empty-states/LoadingState'
import { useCurrentUser } from '../../app/auth/AuthContext'
import { hasModule } from '../../app/auth/roleScope'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { taskQueries } from '../../shared/api/tasks.api'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon size={14} className="text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-400 mb-0.5">{label}</p>
        <div className="text-sm text-slate-800">{children}</div>
      </div>
    </div>
  )
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()

  // La póliza/activo vinculado a la tarea es de OTRO módulo — sin el
  // correspondiente, ni se pide ni se muestra ese vínculo (mismo criterio que
  // antes de esta migración, aunque el dato ya venga en el detalle liviano).
  const canPolicies = hasModule(user, 'policies')
  const canAssets = hasModule(user, 'assets')

  const { data: task, isLoading, isError } = useQuery(taskQueries.detail(id!))

  if (isLoading) {
    return (
      <PageContent>
        <LoadingState />
      </PageContent>
    )
  }

  if (isError) {
    return (
      <PageContent>
        <ErrorState />
      </PageContent>
    )
  }

  if (!task) {
    return (
      <PageContent>
        <EmptyState
          title="Tarea no encontrada"
          description="La tarea solicitada no existe o fue eliminada."
        />
      </PageContent>
    )
  }

  const days = daysUntil(task.dueDate)
  const isOverdue = days < 0 && task.status !== 'finalizada'
  const isDueSoon = days >= 0 && days <= 7 && task.status !== 'finalizada'

  const priorityVariant = {
    baja: 'bg-slate-100 text-slate-600',
    media: 'bg-amber-50 text-amber-700 border border-amber-100',
    alta: 'bg-red-50 text-red-700 border border-red-100',
  }[task.priority] ?? 'bg-slate-100 text-slate-600'

  return (
    <PageContent>
      <PageHeader
        title={task.title}
        subtitle={TASK_STATUS_LABELS[task.status] ?? task.status}
        category="Tareas"
        backTo={ROUTES.TASKS}
        backLabel="Volver a Tareas"
        badge={<StatusPill status={task.status} />}
        actions={
          <button
            onClick={() => navigate(ROUTES.TASKS_EDIT(task.id))}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            <Pencil size={14} />
            Editar
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <SectionCard title="Descripción">
            {task.description ? (
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {task.description}
              </p>
            ) : (
              <p className="text-sm text-slate-400 italic">Sin descripción adicional.</p>
            )}
          </SectionCard>

          {/* Associations — el productor siempre existe (una tarea siempre
              pertenece a un productor), póliza/activo son opcionales y
              respetan el módulo del usuario. */}
          <SectionCard title="Vínculos">
            <DetailRow icon={User} label="Productor asignado">
              <button
                onClick={() => navigate(ROUTES.PRODUCERS_DETAIL(task.producerId))}
                className="text-brand-600 hover:underline font-medium"
              >
                {task.producerName}
              </button>
            </DetailRow>
            {task.policyId && canPolicies && (
              <DetailRow icon={FileText} label="Póliza asociada">
                <button
                  onClick={() => navigate(ROUTES.POLICIES_DETAIL(task.policyId!))}
                  className="text-brand-600 hover:underline font-medium"
                >
                  {task.policyNumber ?? task.policyId}
                </button>
              </DetailRow>
            )}
            {task.assetId && canAssets && (
              <DetailRow icon={Package} label="Activo asociado">
                <button
                  onClick={() => navigate(ROUTES.ASSETS_DETAIL(task.assetId!))}
                  className="text-brand-600 hover:underline font-medium"
                >
                  {task.assetName ?? task.assetId}
                </button>
              </DetailRow>
            )}
          </SectionCard>

          {/* Assigned to */}
          {task.assignedTo && (
            <SectionCard title="Responsable interno">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-brand-600" />
                </div>
                <p className="text-sm font-medium text-slate-800">{task.assignedTo}</p>
              </div>
            </SectionCard>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          {/* Status card */}
          <SectionCard title="Estado y prioridad">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Estado</span>
                <StatusPill status={task.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Prioridad</span>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${priorityVariant}`}>
                  {TASK_PRIORITY_LABELS[task.priority]}
                </span>
              </div>
            </div>
          </SectionCard>

          {/* Due date card */}
          <SectionCard title="Vencimiento">
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isOverdue
                    ? 'bg-red-100'
                    : isDueSoon
                      ? 'bg-amber-100'
                      : 'bg-slate-100'
                }`}
              >
                {isOverdue ? (
                  <AlertTriangle size={16} className="text-red-600" />
                ) : task.status === 'finalizada' ? (
                  <CheckCircle2 size={16} className="text-emerald-600" />
                ) : (
                  <Calendar size={16} className="text-slate-500" />
                )}
              </div>
              <div>
                <p className={`text-sm font-semibold ${isOverdue ? 'text-red-700' : isDueSoon ? 'text-amber-700' : 'text-slate-800'}`}>
                  {formatDate(task.dueDate)}
                </p>
                <p className={`text-xs mt-0.5 ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-amber-500' : 'text-slate-400'}`}>
                  {isOverdue
                    ? `Venció hace ${Math.abs(days)} días`
                    : days === 0
                      ? 'Vence hoy'
                      : task.status === 'finalizada'
                        ? 'Completada'
                        : `Faltan ${days} días`}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Metadata */}
          <SectionCard title="Información">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Clock size={12} />
                  Creada
                </span>
                <span className="text-xs text-slate-600">{formatDate(task.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <ClipboardList size={12} />
                  ID
                </span>
                <span className="text-xs font-mono text-slate-400">{task.id}</span>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </PageContent>
  )
}
