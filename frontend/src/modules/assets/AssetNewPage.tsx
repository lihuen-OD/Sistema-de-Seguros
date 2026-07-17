import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Save, X, Plus, MapPin, Hash, Info,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection, FormField, FormInput, FormSelect, FormTextarea,
} from '../../shared/components/forms/FormSection'
import { AttachmentListEditor } from '../../shared/components/file-upload/AttachmentListEditor'
import { assetsApi, assetKeys } from '../../shared/api/assets.api'
import { catalogQueries } from '../../shared/api/catalogs.api'
import type { CatalogItem } from '../../shared/api/catalogs.api'
import {
  PROVINCES,
} from '../../shared/constants'
import {
  CATEGORY_LABEL,
} from '../../shared/constants/asset-categories'
import { parseGoogleMapsUrl } from '../../shared/utils/maps'
import { CategoryPicker } from './components/CategoryPicker'
import { BienDeUsoField } from './components/BienDeUsoField'
import { AllocationEditor } from './components/AllocationEditor'
import { SilosSection } from './components/SilosSection'
import { EstBuildingsSection } from './components/EstBuildingsSection'
import type { EstBuilding } from './components/EstBuildingsSection'
import type { AssetCategory, AssetAttachment, AssetAllocation, Silo } from '../../shared/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const IS_WHEELED = (c: AssetCategory | '') =>
  ['vehiculo', 'camioneta', 'camion', 'moto'].includes(c)
const IS_AGRO = (c: AssetCategory | '') =>
  ['tractor', 'cosechadora', 'pulverizadora', 'implemento'].includes(c)
const HAS_BRAND = (c: AssetCategory | '') => IS_WHEELED(c) || IS_AGRO(c)
const IS_CARGA = (c: AssetCategory | '') => c === 'carga'
const IS_IMMOVABLE = (c: AssetCategory | '') =>
  ['establecimiento', 'edificio', 'infraestructura'].includes(c as string)

// ── Local form state ───────────────────────────────────────────────────────────

type FormErrors = Partial<Record<keyof FormState, string>>

type FormState = {
  bienDeUsoId: string
  name: string
  status: string
  patrimonialValueUsd: string
  valuationDate: string
  brand: string
  model: string
  year: string
  serialNumber: string
  chassisNumber: string
  plate: string
  engineNumber: string
  color: string
  fuelType: string
  powerHp: string
  cutWidth: string
  tankCapacity: string
  workWidth: string
  implementType: string
  surfaceM2: string
  address: string
  constructionType: string
  floors: string
  constructionYear: string
  buildingPurpose: string
  mapsUrl: string
  surfaceHa: string
  locality: string
  province: string
  infraType: string
  infraCapacityTons: string
  infraContent: string
  technicalSpec: string
  productiveUnit: string
  area: string
  observations: string
  patrimonialValueNew: string
}

const EMPTY: FormState = {
  bienDeUsoId: '', name: '', status: 'activo', patrimonialValueUsd: '', valuationDate: '',
  brand: '', model: '', year: '', serialNumber: '', chassisNumber: '',
  plate: '', engineNumber: '', color: '', fuelType: '',
  powerHp: '', cutWidth: '', tankCapacity: '', workWidth: '', implementType: '',
  surfaceM2: '', address: '', constructionType: '', floors: '', constructionYear: '',
  buildingPurpose: '', mapsUrl: '',
  surfaceHa: '', locality: '', province: '',
  infraType: '', infraCapacityTons: '', infraContent: '',
  technicalSpec: '',
  productiveUnit: '', area: '', observations: '',
  patrimonialValueNew: '',
}

// ── Internal code display ──────────────────────────────────────────────────────

function AutoCodeDisplay({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
      <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
        <Hash size={14} className="text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold font-mono text-slate-800 tracking-wider">{code}</p>
        <p className="text-xs text-slate-400 mt-0.5">Asignado automáticamente por el sistema</p>
      </div>
      <span className="ml-auto flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
        Auto
      </span>
    </div>
  )
}

// ── Map section (kept in-page: uses FormField wrapper unique to create form) ───

function MapSection({
  mapsUrl, onChange,
}: { mapsUrl: string; onChange: (v: string) => void }) {
  const coords = mapsUrl ? parseGoogleMapsUrl(mapsUrl) : null

  return (
    <div>
      <FormField label="Ubicación en mapa" fullWidth>
        <div className="relative">
          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <FormInput
            className="pl-8"
            placeholder="Pegá el link de Google Maps (ej: https://maps.google.com/…)"
            value={mapsUrl}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {mapsUrl && !coords && (
          <p className="text-xs text-amber-600 mt-1">
            No se pudieron extraer coordenadas de ese link. Verificá el formato.
          </p>
        )}
        {coords && (
          <p className="text-xs text-emerald-600 mt-1">
            Coordenadas: {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </p>
        )}
      </FormField>
      {coords && (
        <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 220 }}>
          <iframe
            title="Mapa de ubicación"
            width="100%"
            height="220"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.01},${coords.lat - 0.01},${coords.lng + 0.01},${coords.lat + 0.01}&layer=mapnik&marker=${coords.lat},${coords.lng}`}
            className="border-0 w-full h-full"
          />
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AssetNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<AssetCategory | ''>('')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [allocations, setAllocations] = useState<AssetAllocation[]>([
    { id: 'alloc-init', companyId: '', costCenterId: '', percentage: 100 },
  ])
  const [buildings, setBuildings] = useState<EstBuilding[]>([])
  const [silos, setSilos] = useState<Silo[]>([])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])

  const { data: fuelTypes = [] } = useQuery(catalogQueries.byCategory('asset_fuel_type'))
  const { data: buildingPurposes = [] } = useQuery(catalogQueries.byCategory('asset_building_purpose'))
  const { data: infrastructureTypes = [] } = useQuery(catalogQueries.byCategory('asset_infrastructure_type'))
  const { data: siloContents = [] } = useQuery(catalogQueries.byCategory('asset_silo_content'))
  const { data: cargoSpecies = [] } = useQuery(catalogQueries.byCategory('asset_cargo_species'))
  const { data: implementTypes = [] } = useQuery(catalogQueries.byCategory('asset_implement_type'))
  const { data: productiveUnits = [] } = useQuery(catalogQueries.byCategory('asset_productive_unit'))
  const { data: areas = [] } = useQuery(catalogQueries.byCategory('asset_area'))

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validate(): boolean {
    const e: FormErrors = {}
    if (!form.name.trim()) e.name = 'El nombre del activo es obligatorio.'
    if (!form.patrimonialValueUsd || parseFloat(form.patrimonialValueUsd) < 0)
      e.patrimonialValueUsd = 'Ingresá un valor patrimonial válido.'
    if (form.patrimonialValueUsd && !form.valuationDate)
      e.valuationDate = 'Indicá la fecha de valuación.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleCategoryChange(cat: AssetCategory) {
    setCategory(cat)
    setForm(EMPTY)
    setBuildings([])
    setSilos([])
  }

  function addBuilding() {
    setBuildings((prev) => [...prev, { id: `b-${Date.now()}`, name: '', surfaceM2: '', purpose: '', constructionType: '', constructionYear: '' }])
  }
  function removeBuilding(id: string) { setBuildings((prev) => prev.filter((b) => b.id !== id)) }
  function updateBuilding(id: string, field: keyof Omit<EstBuilding, 'id'>, value: string) {
    setBuildings((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b))
  }

  function addSilo() {
    setSilos((prev) => [...prev, { id: `silo-${Date.now()}`, capacityTons: 0, content: '' }])
  }
  function removeSilo(id: string) { setSilos((prev) => prev.filter((s) => s.id !== id)) }
  function updateSilo(id: string, field: keyof Omit<Silo, 'id'>, value: string | number) {
    setSilos((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s))
  }

  function buildMetadata(): Record<string, unknown> {
    const opt = (v: string) => v.trim() || undefined
    const num = (v: string) => v ? parseFloat(v) : undefined
    const int = (v: string) => v ? parseInt(v, 10) : undefined

    if (['vehiculo', 'camioneta', 'camion', 'moto'].includes(category)) {
      return {
        ...(opt(form.chassisNumber) && { chassisNumber: form.chassisNumber.trim() }),
        ...(opt(form.plate) && { plate: form.plate.trim() }),
        ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
        ...(opt(form.color) && { color: form.color.trim() }),
        ...(opt(form.fuelType) && { fuelType: form.fuelType }),
      }
    }
    if (['tractor', 'cosechadora', 'pulverizadora'].includes(category)) {
      return {
        ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
        ...(num(form.powerHp) !== undefined && { powerHp: num(form.powerHp) }),
        ...(num(form.cutWidth) !== undefined && { cutWidth: num(form.cutWidth) }),
        ...(num(form.tankCapacity) !== undefined && { tankCapacity: num(form.tankCapacity) }),
        ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
      }
    }
    if (category === 'implemento') {
      return {
        ...(opt(form.implementType) && { implementType: form.implementType }),
        ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
      }
    }
    if (category === 'edificio') {
      return {
        ...(num(form.surfaceM2) !== undefined && { surfaceM2: num(form.surfaceM2) }),
        ...(opt(form.buildingPurpose) && { buildingPurpose: form.buildingPurpose }),
        ...(opt(form.constructionType) && { constructionType: form.constructionType.trim() }),
        ...(int(form.floors) !== undefined && { floors: int(form.floors) }),
        ...(int(form.constructionYear) !== undefined && { constructionYear: int(form.constructionYear) }),
        ...(opt(form.address) && { address: form.address.trim() }),
      }
    }
    if (category === 'establecimiento') {
      return {
        ...(num(form.surfaceHa) !== undefined && { surfaceHa: num(form.surfaceHa) }),
        ...(opt(form.province) && { province: form.province }),
        ...(opt(form.locality) && { locality: form.locality.trim() }),
        ...(opt(form.address) && { address: form.address.trim() }),
        ...(buildings.length > 0 && {
          buildings: buildings.map((b) => ({
            name: b.name,
            ...(b.surfaceM2 && { surfaceM2: parseFloat(b.surfaceM2) }),
            ...(b.purpose && { purpose: b.purpose }),
            ...(b.constructionType && { constructionType: b.constructionType }),
            ...(b.constructionYear && { constructionYear: parseInt(b.constructionYear, 10) }),
          })),
        }),
        ...(silos.length > 0 && {
          silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
        }),
      }
    }
    if (category === 'infraestructura') {
      return {
        ...(opt(form.infraType) && { infraType: form.infraType }),
        ...(num(form.infraCapacityTons) !== undefined && { infraCapacityTons: num(form.infraCapacityTons) }),
        ...(opt(form.infraContent) && { infraContent: form.infraContent }),
        ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
        ...(silos.length > 0 && {
          silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
        }),
      }
    }
    if (['equipo', 'maquinaria'].includes(category)) {
      return {
        ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
      }
    }
    return {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!category) return
    if (!validate()) return

    setSubmitting(true)
    try {
      const metadata = buildMetadata()

      const newAsset = await assetsApi.create({
        name: form.name.trim(),
        assetType: CATEGORY_LABEL[category],
        status: form.status,
        fixedAssetId: form.bienDeUsoId || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        year: form.year ? parseInt(form.year, 10) : undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        purchaseDate: form.valuationDate || undefined,
        currentValue: form.patrimonialValueUsd ? parseFloat(form.patrimonialValueUsd) : undefined,
        patrimonialValueNew: form.patrimonialValueNew ? parseFloat(form.patrimonialValueNew) : undefined,
        mapsUrl: form.mapsUrl.trim() || undefined,
        productiveUnit: form.productiveUnit || undefined,
        area: form.area || undefined,
        description: form.observations.trim() || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        allocations: allocations
          .filter((a) => a.companyId && a.costCenterId)
          .map((a) => ({ companyId: a.companyId, costCenterId: a.costCenterId, percentage: a.percentage })),
      })

      // Subir adjuntos pendientes (archivo real en memoria)
      const pendingUploads = attachments.filter((a) => a.pendingFile)
      for (const att of pendingUploads) {
        await assetsApi.addAttachment(newAsset.id, {
          file: att.pendingFile!,
          description: att.description || undefined,
          expirationDate: att.expirationDate ?? undefined,
        })
      }

      await queryClient.invalidateQueries({ queryKey: assetKeys.all })
      toast.success('Activo registrado correctamente')
      navigate(`/assets/${newAsset.id}`)
    } finally {
      setSubmitting(false)
    }
  }

  const hasCategory = category !== ''
  const namePlaceholder =
    IS_WHEELED(category) ? 'Ej: Toyota Hilux 4x4 Doble Cabina' :
    IS_AGRO(category) ? 'Ej: John Deere 8R 340' :
    category === 'establecimiento' ? 'Ej: Establecimiento La Esperanza' :
    category === 'edificio' ? 'Ej: Galpón de almacenamiento Norte' :
    IS_CARGA(category) ? 'Ej: Carga porcina — Lote Norte 2024' :
    'Ej: Nombre del activo'

  const isSiloInfra = category === 'infraestructura' && form.infraType === 'Silo'

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Activo"
        subtitle="Registrá un nuevo bien en el inventario patrimonial."
        backTo="/assets"
        backLabel="Volver al inventario"
      />

      <form onSubmit={handleSubmit} noValidate className="max-w-5xl space-y-5">

        {/* 1. Tipo de activo */}
        <SectionCard
          title="Tipo de activo"
          subtitle={hasCategory ? `Categoría seleccionada: ${CATEGORY_LABEL[category as AssetCategory]}` : 'Seleccioná la categoría del activo.'}
        >
          <CategoryPicker value={category} onChange={handleCategoryChange} />
        </SectionCard>

        {hasCategory && (
          <>
            {/* 2. Identificación */}
            <SectionCard
              title="Identificación"
              subtitle="Código de Bien de Uso, nombre y estado."
            >
              <FormSection title="">
                <FormField label="Código de activo (sistema)">
                  <AutoCodeDisplay code="Asignado al guardar" />
                </FormField>
                {IS_CARGA(category) ? (
                  <FormField label="Bien de Uso" fullWidth>
                    <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border border-amber-200 bg-amber-50">
                      <Info size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800">
                        Este tipo de activo <strong>no requiere Bien de Uso asignado</strong>. La carga animal se contabiliza como inventario, no como bien de uso fijo.
                      </p>
                    </div>
                  </FormField>
                ) : (
                  <FormField label="Bien de Uso" fullWidth>
                    <BienDeUsoField
                      value={form.bienDeUsoId}
                      onChange={(id) => setForm((prev) => ({ ...prev, bienDeUsoId: id }))}
                    />
                  </FormField>
                )}
                <FormField label="Nombre / Descripción" required error={errors.name}>
                  <FormInput placeholder={namePlaceholder} value={form.name} onChange={set('name')} />
                </FormField>
                <FormField label="Estado" required>
                  <FormSelect value={form.status} onChange={set('status')}>
                    <option value="activo">Activo</option>
                    <option value="baja">Baja</option>
                    <option value="vendido">Vendido</option>
                  </FormSelect>
                </FormField>
                {HAS_BRAND(category) && (
                  <>
                    <FormField label="Marca">
                      <FormInput placeholder={IS_WHEELED(category) ? 'Ej: Toyota' : 'Ej: John Deere'} value={form.brand} onChange={set('brand')} />
                    </FormField>
                    {category !== 'implemento' && (
                      <FormField label="Modelo">
                        <FormInput placeholder={IS_WHEELED(category) ? 'Ej: Hilux SRX' : 'Ej: 8R 340'} value={form.model} onChange={set('model')} />
                      </FormField>
                    )}
                    <FormField label="Año">
                      <FormInput type="number" placeholder="Ej: 2022" min={1950} max={2030} value={form.year} onChange={set('year')} />
                    </FormField>
                  </>
                )}
                {IS_WHEELED(category) && (
                  <FormField label="N° de Chasis">
                    <FormInput placeholder="Ej: JTFHM923X00123456" value={form.chassisNumber} onChange={set('chassisNumber')} />
                  </FormField>
                )}
                {IS_AGRO(category) && (
                  <FormField label="N° de Serie">
                    <FormInput placeholder="Ej: RW8320P024316" value={form.serialNumber} onChange={set('serialNumber')} />
                  </FormField>
                )}
                <FormField label="Valor Patrimonial Real (USD)" required error={errors.patrimonialValueUsd}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput type="number" placeholder="0.00" min={0} step="0.01" className="pl-7" value={form.patrimonialValueUsd} onChange={set('patrimonialValueUsd')} />
                  </div>
                </FormField>
                <FormField label="Valor Patrimonial a Nuevo (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput type="number" placeholder="0.00" min={0} step="0.01" className="pl-7" value={form.patrimonialValueNew} onChange={set('patrimonialValueNew')} />
                  </div>
                </FormField>
                <FormField label="Fecha de Valuación" required error={errors.valuationDate}>
                  <FormInput type="date" value={form.valuationDate} onChange={set('valuationDate')} />
                </FormField>
              </FormSection>
            </SectionCard>

            {/* 3. Datos específicos por categoría */}

            {IS_WHEELED(category) && (
              <SectionCard title="Datos del vehículo" subtitle="Información técnica del rodado.">
                <FormSection title="">
                  <FormField label="Patente">
                    <FormInput placeholder="Ej: AB 123 CD" value={form.plate} onChange={set('plate')} />
                  </FormField>
                  <FormField label="N° de Motor">
                    <FormInput placeholder="Ej: 2GR-FE-0012345" value={form.engineNumber} onChange={set('engineNumber')} />
                  </FormField>
                  <FormField label="Color">
                    <FormInput placeholder="Ej: Blanco perla" value={form.color} onChange={set('color')} />
                  </FormField>
                  <FormField label="Combustible">
                    <FormSelect value={form.fuelType} onChange={set('fuelType')}>
                      <option value="">Seleccionar…</option>
                      {fuelTypes.map((f) => <option key={f.id} value={f.label}>{f.label}</option>)}
                    </FormSelect>
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {(['tractor', 'cosechadora', 'pulverizadora'] as AssetCategory[]).includes(category as AssetCategory) && (
              <SectionCard title="Datos de la maquinaria" subtitle="Especificaciones técnicas del equipo.">
                <FormSection title="">
                  <FormField label="N° de Motor">
                    <FormInput placeholder="Ej: CD6090-123456" value={form.engineNumber} onChange={set('engineNumber')} />
                  </FormField>
                  <FormField label="Potencia (HP)">
                    <FormInput type="number" min={0} placeholder="Ej: 340" value={form.powerHp} onChange={set('powerHp')} />
                  </FormField>
                  {category === 'cosechadora' && (
                    <FormField label="Ancho de corte (m)">
                      <FormInput type="number" min={0} step="0.1" placeholder="Ej: 9.2" value={form.cutWidth} onChange={set('cutWidth')} />
                    </FormField>
                  )}
                  {category === 'pulverizadora' && (
                    <>
                      <FormField label="Capacidad del tanque (lts)">
                        <FormInput type="number" min={0} placeholder="Ej: 4500" value={form.tankCapacity} onChange={set('tankCapacity')} />
                      </FormField>
                      <FormField label="Ancho de trabajo (m)">
                        <FormInput type="number" min={0} step="0.1" placeholder="Ej: 32" value={form.workWidth} onChange={set('workWidth')} />
                      </FormField>
                    </>
                  )}
                </FormSection>
              </SectionCard>
            )}

            {category === 'implemento' && (
              <SectionCard title="Datos del implemento" subtitle="Tipo y especificaciones técnicas.">
                <FormSection title="">
                  <FormField label="Tipo de implemento">
                    <FormSelect value={form.implementType} onChange={set('implementType')}>
                      <option value="">Seleccionar…</option>
                      {implementTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Ancho de trabajo (m)">
                    <FormInput type="number" min={0} step="0.1" placeholder="Ej: 9.5" value={form.workWidth} onChange={set('workWidth')} />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {category === 'edificio' && (
              <SectionCard title="Datos del edificio" subtitle="Características físicas y constructivas.">
                <div className="space-y-5">
                  <FormSection title="">
                    <FormField label="Superficie (m²)" required>
                      <FormInput type="number" min={0} placeholder="Ej: 1200" value={form.surfaceM2} onChange={set('surfaceM2')} />
                    </FormField>
                    <FormField label="Uso / Destino">
                      <FormSelect value={form.buildingPurpose} onChange={set('buildingPurpose')}>
                        <option value="">Seleccionar…</option>
                        {buildingPurposes.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
                      </FormSelect>
                    </FormField>
                    <FormField label="Tipo de estructura">
                      <FormInput placeholder="Ej: Hormigón, Steel Frame, Mampostería…" value={form.constructionType} onChange={set('constructionType')} />
                    </FormField>
                    <FormField label="N° de pisos">
                      <FormInput type="number" min={1} max={50} placeholder="Ej: 1" value={form.floors} onChange={set('floors')} />
                    </FormField>
                    <FormField label="Año de construcción">
                      <FormInput type="number" min={1900} max={2030} placeholder="Ej: 2010" value={form.constructionYear} onChange={set('constructionYear')} />
                    </FormField>
                    <FormField label="Dirección / Ubicación" fullWidth>
                      <FormInput placeholder="Ej: Ruta 8 Km. 340, Trenque Lauquen" value={form.address} onChange={set('address')} />
                    </FormField>
                  </FormSection>
                  <div className="border-t border-slate-100 pt-4">
                    <MapSection mapsUrl={form.mapsUrl} onChange={(v) => setForm((p) => ({ ...p, mapsUrl: v }))} />
                  </div>
                </div>
              </SectionCard>
            )}

            {category === 'establecimiento' && (
              <SectionCard title="Datos del establecimiento" subtitle="Campo o predio con sus construcciones y silos.">
                <div className="space-y-6">
                  <FormSection title="">
                    <FormField label="Superficie total (ha)" required>
                      <FormInput type="number" min={0} step="0.01" placeholder="Ej: 1250.5" value={form.surfaceHa} onChange={set('surfaceHa')} />
                    </FormField>
                    <FormField label="Provincia">
                      <FormSelect value={form.province} onChange={set('province')}>
                        <option value="">Seleccionar…</option>
                        {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </FormSelect>
                    </FormField>
                    <FormField label="Localidad / Partido">
                      <FormInput placeholder="Ej: General Villegas" value={form.locality} onChange={set('locality')} />
                    </FormField>
                    <FormField label="Dirección / Ubicación" fullWidth>
                      <FormInput placeholder="Ej: Ruta Provincial 70 Km. 12" value={form.address} onChange={set('address')} />
                    </FormField>
                  </FormSection>
                  <div className="border-t border-slate-100 pt-4">
                    <MapSection mapsUrl={form.mapsUrl} onChange={(v) => setForm((p) => ({ ...p, mapsUrl: v }))} />
                  </div>
                  <div className="border-t border-slate-100 pt-5">
                    <EstBuildingsSection buildings={buildings} onAdd={addBuilding} onRemove={removeBuilding} onChange={updateBuilding} buildingPurposes={buildingPurposes} />
                  </div>
                  <div className="border-t border-slate-100 pt-5">
                    <SilosSection silos={silos} siloContents={siloContents} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
                  </div>
                </div>
              </SectionCard>
            )}

            {category === 'infraestructura' && (
              <SectionCard title="Especificaciones de infraestructura" subtitle="Tipo y características técnicas.">
                <FormSection title="">
                  <FormField label="Tipo de infraestructura" required>
                    <FormSelect value={form.infraType} onChange={set('infraType')}>
                      <option value="">Seleccionar…</option>
                      {infrastructureTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                    </FormSelect>
                  </FormField>
                  {isSiloInfra ? (
                    <>
                      <FormField label="Capacidad total (toneladas)">
                        <FormInput type="number" min={0} placeholder="Ej: 2200" value={form.infraCapacityTons} onChange={set('infraCapacityTons')} />
                      </FormField>
                      <FormField label="Contenido">
                        <FormSelect value={form.infraContent} onChange={set('infraContent')}>
                          <option value="">Seleccionar…</option>
                          {siloContents.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                        </FormSelect>
                      </FormField>
                    </>
                  ) : (
                    <FormField label="Especificaciones técnicas" fullWidth>
                      <FormTextarea
                        rows={3}
                        placeholder="Describí las características del activo…"
                        value={form.technicalSpec}
                        onChange={set('technicalSpec')}
                      />
                    </FormField>
                  )}
                  {(form.infraType === 'Silo' || form.infraType === 'Tanque de agua' || form.infraType === 'Tanque de combustible') && (
                    <FormField label="Ubicación en mapa" fullWidth>
                      <MapSection mapsUrl={form.mapsUrl} onChange={(v) => setForm((p) => ({ ...p, mapsUrl: v }))} />
                    </FormField>
                  )}
                </FormSection>
                {isSiloInfra && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <SilosSection silos={silos} siloContents={siloContents} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
                  </div>
                )}
              </SectionCard>
            )}

            {(['equipo', 'maquinaria'] as AssetCategory[]).includes(category as AssetCategory) && (
              <SectionCard title="Especificaciones técnicas" subtitle="Características y uso del activo.">
                <FormSection title="">
                  <FormField label="Especificaciones" fullWidth>
                    <FormTextarea rows={3} placeholder="Ej: Equipo de bombeo 50HP, marca X, modelo Y…" value={form.technicalSpec} onChange={set('technicalSpec')} />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {IS_CARGA(category) && (
              <SectionCard title="Datos de la Carga" subtitle="Especie, categoría y características de la hacienda o carga animal.">
                <FormSection title="">
                  <FormField label="Especie">
                    <FormSelect value={form.brand} onChange={set('brand')}>
                      <option value="">Seleccionar especie…</option>
                      {cargoSpecies.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Categoría / Raza">
                    <FormInput placeholder="Ej: Capón — Yorkshire, Novillo, Pollo parrillero…" value={form.model} onChange={set('model')} />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {/* Imputación Contable */}
            <SectionCard
              title="Imputación Contable"
              subtitle="Empresa, centro de costo y porcentaje de imputación."
            >
              <div className="space-y-5">
                <AllocationEditor allocations={allocations} onChange={setAllocations} />
                <div className="border-t border-slate-100 pt-4">
                  <FormSection title="">
                    <FormField label="Unidad Productiva">
                      <FormSelect value={form.productiveUnit} onChange={set('productiveUnit')}>
                        <option value="">Seleccionar unidad…</option>
                        {productiveUnits.map((u) => <option key={u.id} value={u.label}>{u.label}</option>)}
                      </FormSelect>
                    </FormField>
                    <FormField label="Área">
                      <FormSelect value={form.area} onChange={set('area')}>
                        <option value="">Seleccionar área…</option>
                        {areas.map((a) => <option key={a.id} value={a.label}>{a.label}</option>)}
                      </FormSelect>
                    </FormField>
                  </FormSection>
                </div>
              </div>
            </SectionCard>

            {/* Observaciones y adjuntos */}
            <SectionCard title="Observaciones y documentación" subtitle="Notas y archivos adjuntos del activo.">
              <div className="space-y-4">
                <FormField label="Observaciones" fullWidth>
                  <FormTextarea rows={3} placeholder="Estado, historial o condiciones del activo…" value={form.observations} onChange={set('observations')} />
                </FormField>
                <AttachmentListEditor attachments={attachments} onChange={setAttachments} />
              </div>
            </SectionCard>

            {/* Footer */}
            <div className="flex items-center gap-3 pt-2 pb-4">
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Save size={16} />
                {submitting ? 'Guardando…' : 'Guardar Activo'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/assets')}
                className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
              >
                <X size={16} />
                Cancelar
              </button>
            </div>
          </>
        )}

      </form>
    </PageContent>
  )
}
