import { useState, useEffect } from 'react'
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
import { fireExtinguisherRepository } from '../../services/repositories/fire-extinguisher.repository'
import { assetRepository } from '../../services/repositories/asset.repository'
import {
  FIRE_EXT_TYPES,
  FIRE_EXT_CAPACITIES,
  LOCATION_TYPES,
} from '../../shared/constants'
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

  const original = fireExtinguisherRepository.findById(id!)

  const [type, setType] = useState(original?.type ?? '')
  const [capacity, setCapacity] = useState(original?.capacity ?? '')
  const [chargeDate, setChargeDate] = useState(original?.chargeDate ?? '')
  const [expirationDate, setExpirationDate] = useState(original?.expirationDate ?? '')
  const [associatedAssetId, setAssociatedAssetId] = useState(original?.associatedAssetId ?? '')
  const [associatedLocationType, setAssociatedLocationType] = useState<AssociatedLocationType>(
    original?.associatedLocationType ?? 'vehiculo',
  )
  const [observations, setObservations] = useState(original?.observations ?? '')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  // Keep expiration in sync only if user hasn't manually changed it
  const [manualExpDate, setManualExpDate] = useState(true)

  useEffect(() => {
    if (!manualExpDate && chargeDate) {
      const [y, m, d] = chargeDate.split('-').map(Number)
      setExpirationDate(
        `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      )
    }
  }, [chargeDate, manualExpDate])

  if (!original) {
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    fireExtinguisherRepository.update(original!.id, {
      type,
      capacity,
      chargeDate,
      expirationDate,
      associatedAssetId: associatedAssetId || null,
      associatedLocationType,
      observations: observations.trim(),
    })

    navigate(ROUTES.FIRE_EXTINGUISHERS_DETAIL(original!.id))
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
                {FIRE_EXT_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Capacidad" required error={errors.capacity}>
              <FormSelect
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              >
                <option value="">Seleccionar capacidad…</option>
                {FIRE_EXT_CAPACITIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
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
                {assetRepository.findAll()
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
