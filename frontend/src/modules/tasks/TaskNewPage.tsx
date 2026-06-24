import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardPlus } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
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
import { catalogsApi } from '../../shared/api/catalogs.api'
import { TASK_PRIORITY_LABELS } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { TaskPriority } from '../../shared/types'

interface FormErrors {
  title?: string
  dueDate?: string
}

export default function TaskNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const prefilledProducerId = searchParams.get('producerId') ?? ''

  const { data: allProducers = [] } = useQuery({ queryKey: ['producers'], queryFn: producersApi.findAll })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: taskTypes = [] } = useQuery({
    queryKey: ['catalogs', 'task_type'],
    queryFn: () => catalogsApi.findByCategory('task_type'),
  })

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [producerId, setProducerId] = useState(prefilledProducerId)
  const [policyId, setPolicyId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('media')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

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

    if (!producerId) {
      setErrors({ title: 'Debe seleccionar un productor para crear la tarea' })
      setSubmitting(false)
      return
    }

    try {
      await producersApi.createTask(producerId, {
        title: title.trim(),
        description: description.trim() || undefined,
        dueDate: dueDate || undefined,
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

  const backTo = prefilledProducerId
    ? ROUTES.PRODUCERS_DETAIL(prefilledProducerId)
    : ROUTES.TASKS

  return (
    <PageContent>
      <PageHeader
        title="Nueva Tarea"
        subtitle="Crear una tarea operativa, con o sin productor asignado"
        category="Tareas"
        backTo={backTo}
        backLabel={prefilledProducerId ? 'Volver al Productor' : 'Volver a Tareas'}
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
            <FormField label="Tipo de tarea (referencia)">
              <FormSelect
                value={''}
                onChange={(e) => {
                  if (e.target.value) setTitle(e.target.value)
                }}
              >
                <option value="">Seleccionar tipo…</option>
                {taskTypes.map((t) => (
                  <option key={t.id} value={t.label}>{t.label}</option>
                ))}
              </FormSelect>
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
            <FormSection title="Plazo y prioridad">
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
            </FormSection>
          </div>
        </SectionCard>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <ClipboardPlus size={15} />
            Crear Tarea
          </button>
        </div>
      </form>
    </PageContent>
  )
}
