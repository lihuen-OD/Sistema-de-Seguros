import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { CatalogSelectOrOther } from '../../shared/components/forms/CatalogSelectOrOther'
import { SearchableSelect } from '../../shared/components/forms/SearchableSelect'
import {
  fireExtinguishersApi,
  fireExtinguisherKeys,
  type FireExtinguisherCreateInput,
} from '../../shared/api/fire-extinguishers.api'
import { assetQueries } from '../../shared/api/assets.api'
import { catalogQueries } from '../../shared/api/catalogs.api'
import { ROUTES } from '../../app/routes'
import { notifyValidationErrors } from '../../shared/utils/formValidation'

function addOneYear(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

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
  [key: string]: string | undefined
}

export default function FireExtinguisherNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

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
  const [manualExpDate, setManualExpDate] = useState(false)
  const [associatedAssetId, setAssociatedAssetId] = useState(searchParams.get('assetId') ?? '')
  const [associatedLocationType, setAssociatedLocationType] = useState('')
  const [observations, setObservations] = useState('')
  const [cylinderNumber, setCylinderNumber] = useState('')
  const [brand, setBrand] = useState('')
  const [manufacturingYear, setManufacturingYear] = useState('')
  const [establishment, setEstablishment] = useState('')
  const [location, setLocation] = useState('')
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
    notifyValidationErrors(e)
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
        chargeDate: chargeDate || null,
        expirationDate: expirationDate || null,
        hydraulicTestExpirationDate: hydraulicTestExpirationDate || null,
        associatedAssetId: associatedAssetId || undefined,
        associatedLocationType,
        location: location.trim() || undefined,
        establishment,
        brand: brand.trim() || undefined,
        cylinderNumber: cylinderNumber.trim(),
        manufacturingYear: parseInt(manufacturingYear, 10),
        observations: observations.trim(),
      }

      await fireExtinguishersApi.create(input)
      await queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
      navigate(ROUTES.FIRE_EXTINGUISHERS)
    } catch {
      setSubmitting(false)
    }
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
              <FormField label="Fecha de última carga" error={errors.chargeDate}>
                <FormInput
                  type="date"
                  value={chargeDate}
                  onChange={(e) => setChargeDate(e.target.value)}
                />
              </FormField>
              <FormField
                label={`Fecha de vencimiento${!manualExpDate ? ' (auto +1 año)' : ''}`}
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
                      className="text-brand-500 hover:underline"
                      onClick={() => setManualExpDate(true)}
                    >
                      Cambiar manualmente
                    </button>
                  </p>
                </div>
              )}
              <FormField label="Vencimiento de prueba hidráulica" error={errors.hydraulicTestExpirationDate}>
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
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <Flame size={15} />
            Registrar Matafuego
          </button>
        </div>
      </form>
    </PageContent>
  )
}
