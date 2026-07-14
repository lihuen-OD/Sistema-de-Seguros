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
import { CatalogSelectOrOther } from '../../shared/components/forms/CatalogSelectOrOther'
import { SearchableSelect } from '../../shared/components/forms/SearchableSelect'
import {
  fireExtinguishersApi,
  fireExtinguisherKeys,
  fireExtinguisherQueries,
  type FireExtinguisherCreateInput,
} from '../../shared/api/fire-extinguishers.api'
import { assetQueries } from '../../shared/api/assets.api'
import { catalogQueries } from '../../shared/api/catalogs.api'
import { ROUTES } from '../../app/routes'

const CURRENT_YEAR = new Date().getFullYear()

interface FormErrors {
  type?: string
  capacity?: string
  chargeDate?: string
  expirationDate?: string
  associatedLocationType?: string
  cylinderNumber?: string
  manufacturingYear?: string
  establishment?: string
  hydraulicTestExpirationDate?: string
}

export default function FireExtinguisherEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: original, isLoading, isError } = useQuery(fireExtinguisherQueries.detail(id!))

  const { data: assets = [] } = useQuery(assetQueries.list())

  const { data: extTypes = [] } = useQuery(catalogQueries.byCategory('fire_ext_type'))
  const { data: extCapacities = [] } = useQuery(catalogQueries.byCategory('fire_ext_capacity'))
  const { data: locationTypes = [] } = useQuery(catalogQueries.byCategory('fire_ext_location_type'))
  const { data: establishments = [] } = useQuery(catalogQueries.byCategory('fire_ext_establishment'))
  const { data: extBrands = [] } = useQuery(catalogQueries.byCategory('fire_ext_brand'))

  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [chargeDate, setChargeDate] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [hydraulicTestExpirationDate, setHydraulicTestExpirationDate] = useState('')
  const [associatedAssetId, setAssociatedAssetId] = useState('')
  const [associatedLocationType, setAssociatedLocationType] = useState('')
  const [observations, setObservations] = useState('')
  const [cylinderNumber, setCylinderNumber] = useState('')
  const [brand, setBrand] = useState('')
  const [manufacturingYear, setManufacturingYear] = useState('')
  const [establishment, setEstablishment] = useState('')
  const [location, setLocation] = useState('')
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
      setHydraulicTestExpirationDate(original.hydraulicTestExpirationDate ?? '')
      setAssociatedAssetId(original.associatedAssetId ?? '')
      setAssociatedLocationType(original.associatedLocationType as string)
      setObservations(original.observations ?? '')
      setCylinderNumber(original.cylinderNumber ?? '')
      setBrand(original.brand ?? '')
      setManufacturingYear(original.manufacturingYear != null ? String(original.manufacturingYear) : '')
      setEstablishment(original.establishment ?? '')
      setLocation(original.location ?? '')
      setSeeded(true)
    }
  }, [original, seeded])

  const isMissingLegacyData =
    seeded &&
    (!original?.cylinderNumber ||
      !original?.manufacturingYear ||
      !original?.establishment ||
      !original?.hydraulicTestExpirationDate)

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
    if (!hydraulicTestExpirationDate) e.hydraulicTestExpirationDate = 'La fecha de vencimiento de prueba hidráulica es obligatoria'
    if (!associatedLocationType) e.associatedLocationType = 'Seleccioná un tipo de ubicación'
    if (!cylinderNumber.trim()) e.cylinderNumber = 'El número de cilindro es obligatorio'
    if (!establishment) e.establishment = 'Seleccioná un establecimiento'
    if (!manufacturingYear) {
      e.manufacturingYear = 'El año de fabricación es obligatorio'
    } else {
      const y = parseInt(manufacturingYear, 10)
      if (Number.isNaN(y) || y < 1950 || y > CURRENT_YEAR) {
        e.manufacturingYear = `Ingresá un año entre 1950 y ${CURRENT_YEAR}`
      }
    }
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
        hydraulicTestExpirationDate,
        associatedAssetId: associatedAssetId || undefined,
        associatedLocationType,
        location: location.trim() || undefined,
        establishment,
        brand: brand.trim() || undefined,
        cylinderNumber: cylinderNumber.trim(),
        manufacturingYear: parseInt(manufacturingYear, 10),
        observations: observations.trim(),
      }

      await fireExtinguishersApi.update(id!, input)
      await queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
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
        {isMissingLegacyData && (
          <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            <span>
              Este registro no tiene todos los datos cargados (número de cilindro, año de
              fabricación, establecimiento y/o vencimiento de prueba hidráulica) — completalos
              antes de guardar.
            </span>
          </div>
        )}

        <SectionCard title="Datos del Matafuego" className="mb-5">
          {/* Code — read-only */}
          <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-xs font-medium text-slate-500">Código:</span>
            <span className="text-sm font-mono font-semibold text-slate-800">{original.code}</span>
            <span className="text-xs text-slate-400 ml-2">(generado automáticamente, no editable)</span>
          </div>

          <FormSection title="Identificación del equipo">
            <FormField label="Número de cilindro" required error={errors.cylinderNumber}>
              <FormInput
                type="text"
                value={cylinderNumber}
                onChange={(e) => setCylinderNumber(e.target.value)}
                placeholder="Ej: CIL-10023"
              />
            </FormField>
            <CatalogSelectOrOther
              label="Marca"
              options={extBrands.map((b) => b.label)}
              value={brand}
              onChange={setBrand}
              selectPlaceholder="Seleccionar marca…"
              otherPlaceholder="Escribir marca…"
            />
            <FormField label="Año de fabricación" required error={errors.manufacturingYear}>
              <FormInput
                type="number"
                min={1950}
                max={CURRENT_YEAR}
                value={manufacturingYear}
                onChange={(e) => setManufacturingYear(e.target.value)}
              />
            </FormField>
            {manufacturingYear && !Number.isNaN(parseInt(manufacturingYear, 10)) && (
              <div className="col-span-2">
                <p className="text-xs text-slate-400 -mt-1">
                  Vencimiento por vida útil: {parseInt(manufacturingYear, 10) + 20}
                </p>
              </div>
            )}
          </FormSection>

          <div className="mt-5">
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
          </div>

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
              <FormField label="Vencimiento de prueba hidráulica" required error={errors.hydraulicTestExpirationDate}>
                <FormInput
                  type="date"
                  value={hydraulicTestExpirationDate}
                  onChange={(e) => setHydraulicTestExpirationDate(e.target.value)}
                />
              </FormField>
            </FormSection>
          </div>
        </SectionCard>

        <SectionCard title="Ubicación" className="mb-5">
          <FormSection title="Asignación física">
            <FormField label="Establecimiento" required error={errors.establishment}>
              <FormSelect
                value={establishment}
                onChange={(e) => setEstablishment(e.target.value)}
              >
                <option value="">Seleccionar establecimiento…</option>
                {establishments.map((est) => (
                  <option key={est.id} value={est.label}>{est.label}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Asignación física" required error={errors.associatedLocationType}>
              <FormSelect
                value={associatedLocationType}
                onChange={(e) => setAssociatedLocationType(e.target.value)}
              >
                <option value="">Seleccionar tipo…</option>
                {locationTypes.map((lt) => (
                  <option key={lt.id} value={lt.label}>{lt.label}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Detalle de ubicación (opcional)">
              <FormInput
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Pasillo 3, cerca del tablero eléctrico"
              />
            </FormField>
            <FormField label="Activo asociado (opcional)">
              <SearchableSelect
                value={associatedAssetId}
                onChange={setAssociatedAssetId}
                placeholder="— Sin activo específico"
                searchPlaceholder="Buscar por código, nombre o tipo…"
                emptyOptionLabel="— Sin activo específico"
                options={assets
                  .filter((a) => a.status === 'activo')
                  .map((a) => ({ value: a.id, label: `${a.internalCode} — ${a.name}`, sublabel: a.assetType }))}
              />
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
