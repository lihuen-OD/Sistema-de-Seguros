import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import {
  FormSection,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../../shared/components/forms/FormSection'
import { producersApi } from '../../shared/api/producers.api'
import { policiesApi } from '../../shared/api/policies.api'
import { assetsApi } from '../../shared/api/assets.api'
import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { TaskPriority, TaskStatus } from '../../shared/types'

interface FormErrors {
  title?: string
  dueDate?: string
}

export default function TaskEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: allProducers = [] } = useQuery({ queryKey: ['producers'], queryFn: producersApi.findAll })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: policiesApi.findAll })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })

  const taskQueries = useQueries({
    queries: allProducers.map((p) => ({
      queryKey: ['producers', p.id, 'tasks'],
      queryFn: () => producersApi.findTasks(p.id),
      enabled: allProducers.length > 0,
    })),
  })

  const allTasks = taskQueries.flatMap((q, i) =>
    (q.data ?? []).map((t) => ({ ...t, producerId: allProducers[i]?.id ?? null }))
  )

  const original = allTasks.find((t) => t.id === id)
  const tasksLoading = allProducers.length > 0 && taskQueries.some((q) => q.isLoading)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [producerId, setProducerId] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('media')
  const [status, setStatus] = useState<TaskStatus>('pendiente')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [formInitialized, setFormInitialized] = useState(false)

  useEffect(() => {
    if (original && !formInitialized) {
      setTitle(original.title)
      setDescription(original.description ?? '')
      setProducerId(original.producerId ?? '')
      setPolicyId(original.policyId ?? '')
      setAssetId(original.assetId ?? '')
      setAssignedTo(original.assignedTo ?? '')
      setDueDate(original.dueDate ?? '')
      setPriority(original.priority ?? 'media')
      setStatus(original.status ?? 'pendiente')
      setFormInitialized(true)
    }
  }, [original, formInitialized])

  if (tasksLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20 text-sm text-slate-400">
          Cargando tarea…
        </div>
      </PageContent>
    )
  }

  if (!tasksLoading && !original && allProducers.length > 0 && taskQueries.every((q) => !q.isLoading)) {
    return (
      <PageContent>
        <EmptyState
          title="Tarea no encontrada"
          description="La tarea solicitada no existe o fue eliminada."
        />
      </PageContent>
    )
  }

  const filteredPolicies = producerId
    ? allPolicies.filter((p) => p.producerId === producerId)
    : allPolicies

  function validate(): boolean {
    const e: FormErrors = {}
    if (!title.trim()) e.title = 'El título es obligatorio'
    if (!dueDate) e.dueDate = 'La fecha de vencimiento es obligatoria'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    try {
      await producersApi.updateTask(original!.producerId!, original!.id, {
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
        status,
        priority,
        assignedTo: assignedTo.trim() || undefined,
        policyId: policyId || undefined,
        assetId: assetId || undefined,
      })
      queryClient.invalidateQueries({ queryKey: ['producers'] })
      navigate(ROUTES.TASKS)
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <PageContent>
      <PageHeader
        title="Editar Tarea"
        subtitle={original?.title ?? ''}
        category="Tareas"
        backTo={ROUTES.TASKS}
        backLabel="Volver a Tareas"
        badge={original ? <StatusPill status={original.status} /> : undefined}
      />

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
              <FormField label="Productor asignado">
                <FormSelect
                  value={producerId}
                  onChange={(e) => {
                    setProducerId(e.target.value)
                    setPolicyId('')
                  }}
                >
                  <option value="">— Sin productor (tarea propia)</option>
                  {allProducers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </FormSelect>
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
                <FormSelect value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
                  <option value="">— Sin póliza</option>
                  {filteredPolicies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.policyNumber} — {p.insuranceType}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label="Activo asociado">
                <FormSelect value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  <option value="">— Sin activo</option>
                  {allAssets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.internalCode} — {a.name}
                    </option>
                  ))}
                </FormSelect>
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
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                >
                  {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <Save size={15} />
            Guardar Cambios
          </button>
        </div>
      </form>
    </PageContent>
  )
}
