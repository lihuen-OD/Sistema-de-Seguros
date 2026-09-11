import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { LoadingState } from '../../shared/components/empty-states/LoadingState'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import {
  FormSection,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../../shared/components/forms/FormSection'
import { ProducerRemoteSelect } from '../../shared/components/forms/ProducerRemoteSelect'
import { PolicyRemoteSelect } from '../../shared/components/forms/PolicyRemoteSelect'
import { AssetRemoteSelect } from '../../shared/components/forms/AssetRemoteSelect'
import { tasksApi, taskQueries, taskKeys, type TaskListItem, type BackendTaskStatus } from '../../shared/api/tasks.api'
import { producerKeys } from '../../shared/api/producers.api'
import { notifyValidationErrors } from '../../shared/utils/formValidation'
import { TASK_PRIORITY_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { TaskPriority } from '../../shared/types'

// Vocabulario real de backend para editar — a diferencia de TASK_STATUS_LABELS
// (usado para mostrar, incluye "Vencida", un estado derivado que no se puede
// asignar a mano), acá se edita el status real que vive en la base.
const BACKEND_STATUS_LABELS: Record<BackendTaskStatus, string> = {
  pendiente: 'Pendiente',
  en_progreso: 'En Progreso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

interface FormErrors {
  title?: string
  dueDate?: string
  producerId?: string
}

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>()

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

  return (
    <PageContent>
      <PageHeader
        title="Editar Tarea"
        subtitle={task.title}
        category="Tareas"
        backTo={ROUTES.TASKS}
        backLabel="Volver a Tareas"
        badge={<StatusPill status={task.status} />}
      />

      <TaskForm key={id} original={task} />
    </PageContent>
  )
}

interface TaskFormProps {
  original: TaskListItem
}

// Recibe key={id} del padre — se remonta entero al cambiar de tarea, así que
// los campos pueden inicializarse directo desde `original` sin useEffect.
function TaskForm({ original }: TaskFormProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [title, setTitle] = useState(original.title)
  const [description, setDescription] = useState(original.description)
  const [producerId, setProducerId] = useState(original.producerId)
  const [policyId, setPolicyId] = useState(original.policyId ?? '')
  const [assetId, setAssetId] = useState(original.assetId ?? '')
  const [assignedTo, setAssignedTo] = useState(original.assignedTo ?? '')
  const [dueDate, setDueDate] = useState(original.dueDate)
  const [priority, setPriority] = useState<TaskPriority>(original.priority)
  const [status, setStatus] = useState<BackendTaskStatus>(original.rawStatus)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  function validate(): boolean {
    const e: FormErrors = {}
    if (!title.trim()) e.title = 'El título es obligatorio'
    if (!dueDate) e.dueDate = 'La fecha de vencimiento es obligatoria'
    if (!producerId) e.producerId = 'Debe seleccionar un productor'
    setErrors(e)
    notifyValidationErrors(e as Record<string, string | undefined>)
    return Object.keys(e).length === 0
  }

  // Al reasignar productor, la póliza/activo elegidos podían pertenecer al
  // productor anterior — se limpian para no dejar una tarea con productor B
  // pero vínculos de otro productor (decisión confirmada en la auditoría
  // Fase 2C). Si se vuelve a elegir el mismo productor, no se tocan.
  function handleProducerChange(nextProducerId: string) {
    if (nextProducerId !== producerId) {
      setPolicyId('')
      setAssetId('')
    }
    setProducerId(nextProducerId)
    if (errors.producerId) setErrors((prev) => ({ ...prev, producerId: undefined }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    try {
      await tasksApi.update(original.id, {
        producerId,
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
        status,
        priority,
        assignedTo: assignedTo.trim() || undefined,
        policyId: policyId || null,
        assetId: assetId || null,
      })
      queryClient.invalidateQueries({ queryKey: taskKeys.all })
      queryClient.invalidateQueries({ queryKey: producerKeys.all })
      navigate(ROUTES.TASKS)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <SectionCard title="Datos de la Tarea" className="mb-5">
        <FormSection title="Descripción">
          <FormField label="Título" required error={errors.title} fullWidth>
            <FormInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Renovar póliza Hilux VEH-001"
              autoFocus
            />
          </FormField>
          <FormField label="Descripción" fullWidth>
            <FormTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalle adicional sobre la tarea…"
              rows={3}
            />
          </FormField>
        </FormSection>

        <div className="mt-5">
          <FormSection title="Asignación">
            <FormField label="Productor asignado" required error={errors.producerId}>
              <ProducerRemoteSelect
                value={producerId}
                onChange={handleProducerChange}
                placeholder="Seleccionar productor…"
                emptyOptionLabel="Seleccionar productor…"
              />
            </FormField>
            <FormField label="Responsable interno">
              <FormInput
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="Ej: Responsable de Seguros"
              />
            </FormField>
          </FormSection>
        </div>

        <div className="mt-5">
          <FormSection title="Vínculos opcionales">
            <FormField label="Póliza asociada">
              <PolicyRemoteSelect
                value={policyId}
                onChange={setPolicyId}
                placeholder="— Sin póliza"
                emptyOptionLabel="— Sin póliza"
                noResultsMessage="No se encontraron pólizas"
              />
            </FormField>
            <FormField label="Activo asociado">
              <AssetRemoteSelect
                value={assetId}
                onChange={setAssetId}
                placeholder="— Sin activo"
                emptyOptionLabel="— Sin activo"
                noResultsMessage="No se encontraron activos"
              />
            </FormField>
          </FormSection>
        </div>

        <div className="mt-5">
          <FormSection title="Plazo, prioridad y estado">
            <FormField label="Fecha de vencimiento" required error={errors.dueDate}>
              <FormInput
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </FormField>
            <FormField label="Prioridad">
              <FormSelect
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Estado">
              <FormSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as BackendTaskStatus)}
              >
                {Object.entries(BACKEND_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </FormSelect>
            </FormField>
          </FormSection>
        </div>
      </SectionCard>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate(ROUTES.TASKS)}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
        >
          <Save size={15} />
          Guardar Cambios
        </button>
      </div>
    </form>
  )
}
