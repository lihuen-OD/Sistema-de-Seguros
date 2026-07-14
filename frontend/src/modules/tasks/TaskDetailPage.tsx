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
import { useQuery, useQueries } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { producerQueries } from '../../shared/api/producers.api'
import { policyQueries } from '../../shared/api/policies.api'
import { assetQueries } from '../../shared/api/assets.api'
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

  // All hooks must be called unconditionally at the top
  const { data: allProducers = [] } = useQuery(producerQueries.list())
  const { data: allPolicies = [] } = useQuery(policyQueries.list())
  const { data: allAssets = [] } = useQuery(assetQueries.list())

  const taskQueries = useQueries({
    queries: allProducers.map((p) => ({ ...producerQueries.tasks(p.id), enabled: allProducers.length > 0 })),
  })

  const allTasks = taskQueries.flatMap((q, i) =>
    (q.data ?? []).map((t) => ({ ...t, producerId: allProducers[i]?.id ?? null }))
  )

  const tasksLoading = allProducers.length > 0 && taskQueries.some((q) => q.isLoading)
  const task = allTasks.find((t) => t.id === id)

  if (tasksLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          Cargando tarea…
        </div>
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

  const producer = allProducers.find((p) => p.id === task.producerId)
  const policy = task.policyId ? allPolicies.find((p) => p.id === task.policyId) : undefined
  const asset = task.assetId ? allAssets.find((a) => a.id === task.assetId) : undefined

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

          {/* Associations */}
          {(producer || policy || asset) && (
            <SectionCard title="Vínculos">
              {producer && (
                <DetailRow icon={User} label="Productor asignado">
                  <button
                    onClick={() => navigate(ROUTES.PRODUCERS_DETAIL(producer.id))}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {producer.name}
                  </button>
                  <span className="text-xs text-slate-400 ml-2">Reg. {producer.registrationNumber}</span>
                </DetailRow>
              )}
              {policy && (
                <DetailRow icon={FileText} label="Póliza asociada">
                  <button
                    onClick={() => navigate(ROUTES.POLICIES_DETAIL(policy.id))}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {policy.policyNumber}
                  </button>
                  <span className="text-xs text-slate-400 ml-2">· {policy.insuranceType}</span>
                </DetailRow>
              )}
              {asset && (
                <DetailRow icon={Package} label="Activo asociado">
                  <button
                    onClick={() => navigate(ROUTES.ASSETS_DETAIL(asset.id))}
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {asset.internalCode}
                  </button>
                  <span className="text-xs text-slate-400 ml-2">— {asset.name}</span>
                </DetailRow>
              )}
            </SectionCard>
          )}

          {/* Assigned to */}
          {task.assignedTo && (
            <SectionCard title="Responsable interno">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User size={14} className="text-blue-600" />
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
              {task.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 size={12} className="text-emerald-500" />
                    Completada
                  </span>
                  <span className="text-xs text-slate-600">{formatDate(task.completedAt)}</span>
                </div>
              )}
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
