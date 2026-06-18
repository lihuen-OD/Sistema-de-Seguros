import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, X, Building2, Plus, Trash2, MapPin, Hash, Package, Info,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection, FormField, FormInput, FormSelect, FormTextarea,
} from '../../shared/components/forms/FormSection'
import { AttachmentListEditor } from '../../shared/components/file-upload/AttachmentListEditor'
import { bienDeUsoRepository } from '../../services/repositories/bien-de-uso.repository'
import { assetRepository } from '../../services/repositories/asset.repository'
import {
  BUILDING_PURPOSES, FUEL_TYPES, INFRASTRUCTURE_TYPES,
  PRODUCTIVE_UNITS, AREAS, PROVINCES, SILO_CONTENTS, CARGO_SPECIES,
} from '../../shared/constants'
import {
  CATEGORY_LABEL, CATEGORY_TO_FINNEGANS, IMPL_TYPES,
} from '../../shared/constants/asset-categories'
import { parseGoogleMapsUrl } from '../../shared/utils/maps'
import { CategoryPicker } from './components/CategoryPicker'
import { BienDeUsoField } from './components/BienDeUsoField'
import { AllocationEditor } from './components/AllocationEditor'
import { SilosSection } from './components/SilosSection'
import type { AssetCategory, AssetAttachment, AssetAllocation, Silo, AssetStatus } from '../../shared/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const IS_WHEELED = (c: AssetCategory | '') =>
  ['vehiculo', 'camioneta', 'camion', 'moto'].includes(c)
const IS_AGRO = (c: AssetCategory | '') =>
  ['tractor', 'cosechadora', 'pulverizadora', 'implemento'].includes(c)
const HAS_BRAND = (c: AssetCategory | '') => IS_WHEELED(c) || IS_AGRO(c)
const IS_CARGA = (c: AssetCategory | '') => c === 'carga'

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
}

// ── Auto-generated internal code ───────────────────────────────────────────────

function generateNextCode(): string {
  const nums = assetRepository.findAll()
    .map((a) => a.internalCode)
    .filter((c) => /^ACT-\d+$/.test(c))
    .map((c) => parseInt(c.replace('ACT-', ''), 10))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `ACT-${String(max + 1).padStart(5, '0')}`
}

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

// ── Buildings sub-form (kept in-page: only used in the create form) ────────────

interface EstBuilding {
  id: string; name: string; surfaceM2: string; purpose: string
  constructionType: string; constructionYear: string
}

function EstBuildingsSection({
  buildings, onAdd, onRemove, onChange,
}: {
  buildings: EstBuilding[]
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, field: keyof Omit<EstBuilding, 'id'>, value: string) => void
}) {
  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Edificios y construcciones</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Registrá las construcciones que forman parte de este establecimiento
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>
      {buildings.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center">
          <Building2 size={22} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Ningún edificio registrado</p>
          <button type="button" onClick={onAdd} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Agregar primer edificio
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {buildings.map((b, idx) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edificio {idx + 1}</span>
                <button type="button" onClick={() => onRemove(b.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                  <FormInput value={b.name} onChange={(e) => onChange(b.id, 'name', e.target.value)} placeholder="Ej: Galpón Norte, Casa de personal" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Superficie (m²)</label>
                  <FormInput type="number" min={0} value={b.surfaceM2} onChange={(e) => onChange(b.id, 'surfaceM2', e.target.value)} placeholder="Ej: 800" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Uso / Destino</label>
                  <FormSelect value={b.purpose} onChange={(e) => onChange(b.id, 'purpose', e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {BUILDING_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </FormSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de estructura</label>
                  <FormInput value={b.constructionType} onChange={(e) => onChange(b.id, 'constructionType', e.target.value)} placeholder="Ej: Hormigón, Steel Frame, Madera…" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Año de construcción</label>
                  <FormInput type="number" min={1900} max={2030} value={b.constructionYear} onChange={(e) => onChange(b.id, 'constructionYear', e.target.value)} placeholder="Ej: 2005" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AssetNewPage() {
  const navigate = useNavigate()
  const [generatedCode] = useState(() => generateNextCode())
  const [category, setCategory] = useState<AssetCategory | ''>('')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<FormErrors>({})
  const [allocations, setAllocations] = useState<AssetAllocation[]>([
    { id: 'alloc-init', companyId: '', costCenterId: '', percentage: 100 },
  ])
  const [buildings, setBuildings] = useState<EstBuilding[]>([])
  const [silos, setSilos] = useState<Silo[]>([])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!category) return
    if (!validate()) return

    const primaryAlloc = allocations[0]
    const selectedBienDeUso = bienDeUsoRepository.findAll().find((b) => b.id === form.bienDeUsoId)

    const newAsset = assetRepository.create({
      internalCode: generatedCode,
      fixedAssetCode: selectedBienDeUso?.code ?? '',
      name: form.name.trim(),
      assetType: CATEGORY_LABEL[category],
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: form.year ? parseInt(form.year, 10) : 0,
      serialNumber: form.serialNumber.trim(),
      chassisNumber: form.chassisNumber.trim() || undefined,
      status: form.status as AssetStatus,
      patrimonialValueUsd: form.patrimonialValueUsd ? parseFloat(form.patrimonialValueUsd) : 0,
      valuationDate: form.valuationDate,
      valueHistory: form.patrimonialValueUsd ? [{
        id: `vh-${Date.now()}`,
        date: form.valuationDate || new Date().toISOString().slice(0, 10),
        valueUsd: parseFloat(form.patrimonialValueUsd),
        notes: 'Alta inicial',
      }] : [],
      observations: form.observations.trim(),
      companyId: primaryAlloc?.companyId ?? '',
      costCenterId: primaryAlloc?.costCenterId ?? '',
      allocations,
      productiveUnit: form.productiveUnit,
      area: form.area,
      coordinates: form.mapsUrl ? parseGoogleMapsUrl(form.mapsUrl) ?? undefined : undefined,
      mapsUrl: form.mapsUrl || undefined,
      silos: silos.length > 0 ? silos : undefined,
      photos: [],
    })

    navigate(`/assets/${newAsset.id}`)
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
              subtitle="Código de Bien de Uso (Finnegans), nombre y estado."
            >
              <FormSection title="">
                <FormField label="Código de activo (sistema)">
                  <AutoCodeDisplay code={generatedCode} />
                </FormField>
                {IS_CARGA(category) ? (
                  <FormField label="Bien de Uso (Finnegans)" fullWidth>
                    <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border border-amber-200 bg-amber-50">
                      <Info size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800">
                        Este tipo de activo <strong>no requiere código de Bien de Uso de Finnegans</strong>. La carga animal se contabiliza como inventario, no como bien de uso fijo.
                      </p>
                    </div>
                  </FormField>
                ) : (
                  <FormField label="Bien de Uso (Finnegans)" fullWidth>
                    <BienDeUsoField
                      value={form.bienDeUsoId}
                      onChange={(id) => setForm((prev) => ({ ...prev, bienDeUsoId: id }))}
                      categoryFilter={category ? CATEGORY_TO_FINNEGANS[category] : undefined}
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
                <FormField label="Valor Patrimonial (USD)" required error={errors.patrimonialValueUsd}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput type="number" placeholder="0.00" min={0} step="0.01" className="pl-7" value={form.patrimonialValueUsd} onChange={set('patrimonialValueUsd')} />
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
                      {FUEL_TYPES.map((f) => <option key={f} value={f}>{f}</option>)}
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
                      {IMPL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
                        {BUILDING_PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
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
                    <EstBuildingsSection buildings={buildings} onAdd={addBuilding} onRemove={removeBuilding} onChange={updateBuilding} />
                  </div>
                  <div className="border-t border-slate-100 pt-5">
                    <SilosSection silos={silos} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
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
                      {INFRASTRUCTURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
                          {SILO_CONTENTS.map((c) => <option key={c} value={c}>{c}</option>)}
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
                    <SilosSection silos={silos} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
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
                      {CARGO_SPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
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
              subtitle="Asignación a empresas y centros de costo con porcentaje."
            >
              <div className="space-y-5">
                <AllocationEditor allocations={allocations} onChange={setAllocations} />
                <div className="border-t border-slate-100 pt-4">
                  <FormSection title="">
                    <FormField label="Unidad Productiva">
                      <FormSelect value={form.productiveUnit} onChange={set('productiveUnit')}>
                        <option value="">Seleccionar unidad…</option>
                        {PRODUCTIVE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </FormSelect>
                    </FormField>
                    <FormField label="Área">
                      <FormSelect value={form.area} onChange={set('area')}>
                        <option value="">Seleccionar área…</option>
                        {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
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
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Save size={16} />
                Guardar Activo
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
