import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame } from 'lucide-react'
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
import {
  fireExtinguisherRepository,
  type FireExtinguisherInput,
} from '../../services/repositories/fire-extinguisher.repository'
import { assetRepository } from '../../services/repositories/asset.repository'
import {
  FIRE_EXT_TYPES,
  FIRE_EXT_CAPACITIES,
  LOCATION_TYPES,
} from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { AssociatedLocationType } from '../../shared/types'

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function addOneYear(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

interface FormErrors {
  type?: string
  capacity?: string
  chargeDate?: string
  expirationDate?: string
  associatedLocationType?: string
}

export default function FireExtinguisherNewPage() {
  const navigate = useNavigate()

  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [chargeDate, setChargeDate] = useState(todayISO())
  const [expirationDate, setExpirationDate] = useState(addOneYear(todayISO()))
  const [manualExpDate, setManualExpDate] = useState(false)
  const [associatedAssetId, setAssociatedAssetId] = useState('')
  const [associatedLocationType, setAssociatedLocationType] = useState<AssociatedLocationType>('vehiculo')
  const [observations, setObservations] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!manualExpDate && chargeDate) {
      setExpirationDate(addOneYear(chargeDate))
    }
  }, [chargeDate, manualExpDate])

  function validate(): boolean {
    const e: FormErrors = {}
    if (!type) e.type = 'Seleccioná un tipo'
    if (!capacity) e.capacity = 'Seleccioná una capacidad'
    if (!chargeDate) e.chargeDate = 'La fecha de carga es obligatoria'
    if (!expirationDate) e.expirationDate = 'La fecha de vencimiento es obligatoria'
    if (!associatedLocationType) e.associatedLocationType = 'Seleccioná un tipo de ubicación'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)

    const input: FireExtinguisherInput = {
      type,
      capacity,
      chargeDate,
      expirationDate,
      associatedAssetId: associatedAssetId || null,
      associatedLocationType,
      observations: observations.trim(),
    }

    fireExtinguisherRepository.create(input)
    navigate(ROUTES.FIRE_EXTINGUISHERS)
  }

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Matafuego"
        subtitle="Registrar un nuevo matafuego en el sistema"
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS}
        backLabel="Volver a Matafuegos"
      />

      <form onSubmit={handleSubmit} noValidate>
        <SectionCard title="Datos del Matafuego" className="mb-5">
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
              <FormField
                label={`Fecha de vencimiento${!manualExpDate ? ' (auto +1 año)' : ''}`}
                required
                error={errors.expirationDate}
              >
                <FormInput
                  type="date"
                  value={expirationDate}
                  onChange={(e) => {
                    setManualExpDate(true)
                    setExpirationDate(e.target.value)
                  }}
                />
              </FormField>
              {!manualExpDate && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-400 -mt-1">
                    Se calcula como +1 año desde la fecha de carga.{' '}
                    <button
                      type="button"
                      className="text-blue-500 hover:underline"
                      onClick={() => setManualExpDate(true)}
                    >
                      Cambiar manualmente
                    </button>
                  </p>
                </div>
              )}
            </FormSection>
          </div>
        </SectionCard>

        <SectionCard title="Ubicación" className="mb-5">
          <FormSection title="Asignación física">
            <FormField label="Tipo de ubicación" required error={errors.associatedLocationType}>
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
              placeholder="Estado del precinto, empresa de servicio, notas de instalación…"
              rows={3}
            />
          </FormField>
        </SectionCard>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <Flame size={15} />
            Registrar Matafuego
          </button>
        </div>
      </form>
    </PageContent>
  )
}
