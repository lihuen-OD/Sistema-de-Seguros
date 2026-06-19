import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import {
  fireExtinguishersApi,
  type FireExtinguisherCreateInput,
} from '../../shared/api/fire-extinguishers.api'
import { assetsApi } from '../../shared/api/assets.api'
import { catalogsApi } from '../../shared/api/catalogs.api'
import { LOCATION_TYPES } from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { AssociatedLocationType } from '../../shared/types'

interface FormErrors {
  type?: string
  capacity?: string
  chargeDate?: string
  expirationDate?: string
}

export default function FireExtinguisherEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: original, isLoading, isError } = useQuery({
    queryKey: ['fire-extinguishers', id],
    queryFn: () => fireExtinguishersApi.findById(id!),
    enabled: !!id,
  })

  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: assetsApi.findAll,
  })

  const { data: extTypes = [] } = useQuery({
    queryKey: ['catalogs', 'fire_ext_type'],
    queryFn: () => catalogsApi.findByCategory('fire_ext_type'),
  })
  const { data: extCapacities = [] } = useQuery({
    queryKey: ['catalogs', 'fire_ext_capacity'],
    queryFn: () => catalogsApi.findByCategory('fire_ext_capacity'),
  })

  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [chargeDate, setChargeDate] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [associatedAssetId, setAssociatedAssetId] = useState('')
  const [associatedLocationType, setAssociatedLocationType] = useState<AssociatedLocationType>('vehiculo')
  const [observations, setObservations] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [seeded, setSeeded] = useState(false)

  // Keep expiration in sync only if user hasn't manually changed it
  const [manualExpDate, setManualExpDate] = useState(true)

  // Seed form fields once original data arrives
  useEffect(() => {
    if (original && !seeded) {
      setType(original.type)
      setCapacity(original.capacity)
      setChargeDate(original.chargeDate ?? '')
      setExpirationDate(original.expirationDate)
      setAssociatedAssetId(original.associatedAssetId ?? '')
      setAssociatedLocationType(original.associatedLocationType)
      setObservations(original.observations ?? '')
      setSeeded(true)
    }
  }, [original, seeded])

  useEffect(() => {
    if (!manualExpDate && chargeDate) {
      const [y, m, d] = chargeDate.split('-').map(Number)
      setExpirationDate(
        `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      )
    }
  }, [chargeDate, manualExpDate])

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
          Cargando…
        </div>
      </PageContent>
    )
  }

  if (isError || !original) {
    return (
      <PageContent>
        <EmptyState
          title="Matafuego no encontrado"
          description="El matafuego solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  function validate(): boolean {
    const e: FormErrors = {}
    if (!type) e.type = 'Seleccioná un tipo'
    if (!capacity) e.capacity = 'Seleccioná una capacidad'
    if (!chargeDate) e.chargeDate = 'La fecha de carga es obligatoria'
    if (!expirationDate) e.expirationDate = 'La fecha de vencimiento es obligatoria'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    try {
      const input: FireExtinguisherCreateInput = {
        type,
        capacity,
        chargeDate,
        expirationDate,
        associatedAssetId: associatedAssetId || undefined,
        associatedLocationType,
        observations: observations.trim(),
      }

      await fireExtinguishersApi.update(id!, input)
      await queryClient.invalidateQueries({ queryKey: ['fire-extinguishers'] })
      navigate(ROUTES.FIRE_EXTINGUISHERS_DETAIL(id!))
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <PageContent>
      <PageHeader
        title="Editar Matafuego"
        subtitle={original.code}
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS_DETAIL(original.id)}
        backLabel="Volver al detalle"
        badge={<StatusPill status={original.status} />}
      />

      <form onSubmit={handleSubmit} noValidate>
        <SectionCard title="Datos del Matafuego" className="mb-5">
          {/* Code — read-only */}
          <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-xs font-medium text-slate-500">Código:</span>
            <span className="text-sm font-mono font-semibold text-slate-800">{original.code}</span>
            <span className="text-xs text-slate-400 ml-2">(generado automáticamente, no editable)</span>
          </div>

          <FormSection title="Tipo y capacidad">
            <FormField label="Tipo de agente extintor" required error={errors.type}>
              <FormSelect
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">Seleccionar tipo…</option>
                {extTypes.map((t) => (
                  <option key={t.id} value={t.label}>{t.label}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Capacidad" required error={errors.capacity}>
              <FormSelect
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              >
                <option value="">Seleccionar capacidad…</option>
                {extCapacities.map((c) => (
                  <option key={c.id} value={c.label}>{c.label}</option>
                ))}
              </FormSelect>
            </FormField>
          </FormSection>

          <div className="mt-5">
            <FormSection title="Fechas">
              <FormField label="Fecha de última carga" required error={errors.chargeDate}>
                <FormInput
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                />
              </FormField>
              <FormField label="Fecha de vencimiento" required error={errors.expirationDate}>
                <FormInput
                  type="date"
                  value={expirationDate}
                  onChange={(e) => {
                    setManualExpDate(true)
                    setExpirationDate(e.target.value)
                  }}
                />
              </FormField>
            </FormSection>
          </div>
        </SectionCard>

        <SectionCard title="Ubicación" className="mb-5">
          <FormSection title="Asignación física">
            <FormField label="Tipo de ubicación" required>
              <FormSelect
                value={associatedLocationType}
                onChange={(e) => setAssociatedLocationType(e.target.value as AssociatedLocationType)}
              >
                {Object.entries(LOCATION_TYPES).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Activo asociado (opcional)">
              <FormSelect
                value={associatedAssetId}
                onChange={(e) => setAssociatedAssetId(e.target.value)}
              >
                <option value="">— Sin activo específico</option>
                {assets
                  .filter((a) => a.status === 'activo')
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.internalCode} — {a.name}
                    </option>
                  ))}
              </FormSelect>
            </FormField>
          </FormSection>
        </SectionCard>

        <SectionCard title="Observaciones" className="mb-5">
          <FormField label="Observaciones" fullWidth>
            <FormTextarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Estado del precinto, empresa de servicio, notas…"
              rows={3}
            />
          </FormField>
        </SectionCard>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_DETAIL(original.id))}
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
