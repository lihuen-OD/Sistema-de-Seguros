import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
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
} from '../../shared/components/forms/FormSection'
import { producersApi, producerQueries, producerKeys } from '../../shared/api/producers.api'
import { notifyValidationErrors } from '../../shared/utils/formValidation'
import { ROUTES } from '../../app/routes'
import type { Producer } from '../../shared/types'

interface FormErrors {
  name?: string
  registrationNumber?: string
  email?: string
}

export default function ProducerEditPage() {
  const { id } = useParams<{ id: string }>()

  const { data: original, isLoading } = useQuery(producerQueries.detail(id!))

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Cargando...</div>
      </PageContent>
    )
  }

  if (!original) {
    return (
      <PageContent>
        <EmptyState
          title="Productor no encontrado"
          description="El productor solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  return (
    <PageContent>
      <PageHeader
        title={`Editar: ${original.name}`}
        subtitle={original.registrationNumber ? `Matrícula ${original.registrationNumber}` : 'Sin matrícula registrada'}
        category="Productores"
        backTo={ROUTES.PRODUCERS_DETAIL(original.id)}
        backLabel="Volver al Productor"
        badge={<StatusPill status={original.status} />}
      />

      <ProducerForm key={id} original={original} />
    </PageContent>
  )
}

// Recibe key={id} del padre — se remonta entero al cambiar de productor, así
// que los campos pueden inicializarse directo desde `original` sin useEffect.
function ProducerForm({ original }: { original: Producer }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState(original.name)
  const [registrationNumber, setRegistrationNumber] = useState(original.registrationNumber)
  const [phone, setPhone] = useState(original.phone ?? '')
  const [email, setEmail] = useState(original.email ?? '')
  const [address, setAddress] = useState(original.address ?? '')
  const [status, setStatus] = useState<'activo' | 'inactivo'>(original.status ?? 'activo')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  function validate(): boolean {
    const e: FormErrors = {}
    if (!name.trim()) e.name = 'El nombre es obligatorio'
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      e.email = 'El email no tiene un formato válido'
    }
    setErrors(e)
    notifyValidationErrors(e as Record<string, string | undefined>)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      await producersApi.update(original.id, {
        name: name.trim(),
        matricula: registrationNumber.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        isActive: status === 'activo',
      })
      toast.success('Productor actualizado correctamente')
      await queryClient.invalidateQueries({ queryKey: producerKeys.all })
      navigate(ROUTES.PRODUCERS_DETAIL(original.id))
    } catch {
      setSubmitting(false)
    }
  }

  return (
      <form onSubmit={handleSubmit} noValidate>
        <SectionCard
          title="Datos del Productor"
          subtitle="Información de contacto y estado"
          className="mb-5"
        >
          <FormSection title="Identificación">
            <FormField label="Nombre / Razón social" required error={errors.name}>
              <FormInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Martínez & Asociados Seguros"
                autoFocus
              />
            </FormField>
            <FormField label="Matrícula (opcional)" error={errors.registrationNumber}>
              <FormInput
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="Ej: MAT-12345"
              />
            </FormField>
          </FormSection>

          <div className="mt-5">
            <FormSection title="Contacto">
              <FormField label="Teléfono">
                <FormInput
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: +54 9 11 4567-8901"
                  type="tel"
                />
              </FormField>
              <FormField label="Email" error={errors.email}>
                <FormInput
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ej: info@productor.com.ar"
                  type="email"
                />
              </FormField>
              <FormField label="Dirección" fullWidth>
                <FormInput
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ej: Av. Corrientes 1234, CABA"
                />
              </FormField>
            </FormSection>
          </div>

          <div className="mt-5">
            <FormSection title="Estado">
              <FormField label="Estado del productor">
                <FormSelect
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'activo' | 'inactivo')}
                >
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </FormSelect>
              </FormField>
            </FormSection>
          </div>
        </SectionCard>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.PRODUCERS_DETAIL(original.id))}
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
