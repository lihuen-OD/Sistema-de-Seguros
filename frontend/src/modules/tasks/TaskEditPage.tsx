import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save } from 'lucide-react'
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
import { producerRepository } from '../../services/repositories/producer.repository'
import { policyRepository } from '../../services/repositories/policy.repository'
import { mockAssets } from '../../data/mock-assets'
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

  const original = producerRepository.findTaskById(id!)
  const allProducers = producerRepository.findAll()
  const allPolicies = policyRepository.findAll()

  const [title, setTitle] = useState(original?.title ?? '')
  const [description, setDescription] = useState(original?.description ?? '')
  const [producerId, setProducerId] = useState(original?.producerId ?? '')
  const [policyId, setPolicyId] = useState(original?.policyId ?? '')
  const [assetId, setAssetId] = useState(original?.assetId ?? '')
  const [assignedTo, setAssignedTo] = useState(original?.assignedTo ?? '')
  const [dueDate, setDueDate] = useState(original?.dueDate ?? '')
  const [priority, setPriority] = useState<TaskPriority>(original?.priority ?? 'media')
  const [status, setStatus] = useState<TaskStatus>(original?.status ?? 'pendiente')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  if (!original) {
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    producerRepository.updateTask(original!.id, {
      title: title.trim(),
      description: description.trim(),
      producerId: producerId || null,
      policyId: policyId || null,
      assetId: assetId || null,
      assignedTo: assignedTo.trim() || null,
      dueDate,
      priority,
      status,
    })
    navigate(ROUTES.TASKS)
  }

  return (
    <PageContent>
      <PageHeader
        title="Editar Tarea"
        subtitle={original.title}
        category="Tareas"
        backTo={ROUTES.TASKS}
        backLabel="Volver a Tareas"
        badge={<StatusPill status={original.status} />}
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
                  {mockAssets.map((a) => (
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
