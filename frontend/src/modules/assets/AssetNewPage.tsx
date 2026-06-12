import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, X, Car, Truck, Settings2, Layers, Wrench,
  Building2, Landmark, Warehouse, Box, Cog, Network,
  Check, Plus, Trash2,
} from 'lucide-react'
import clsx from 'clsx'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection, FormField, FormInput, FormSelect, FormTextarea,
} from '../../shared/components/forms/FormSection'
import { AttachmentListEditor } from '../../shared/components/file-upload/AttachmentListEditor'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import { ASSET_STATUS_LABELS, PRODUCTIVE_UNITS, AREAS } from '../../shared/constants'
import type { AssetCategory, AssetAttachment } from '../../shared/types'

// ── Local types ────────────────────────────────────────────────────────────────

interface EstBuilding {
  id: string
  name: string
  surfaceM2: string
  purpose: string
  constructionType: string
  constructionYear: string
}

type FormState = {
  internalCode: string
  name: string
  status: string
  patrimonialValueUsd: string
  valuationDate: string
  // vehicles & machinery
  brand: string
  model: string
  year: string
  serialNumber: string
  // vehicle-only
  plate: string
  engineNumber: string
  color: string
  fuelType: string
  // machinery-only
  powerHp: string
  cutWidth: string
  tankCapacity: string
  workWidth: string
  implementType: string
  // building / plant
  surfaceM2: string
  address: string
  constructionType: string
  floors: string
  constructionYear: string
  buildingPurpose: string
  // estate
  surfaceHa: string
  locality: string
  province: string
  // plant
  activityType: string
  // other
  technicalSpec: string
  // accounting
  companyId: string
  costCenterId: string
  fixedAssetCode: string
  productiveUnit: string
  area: string
  observations: string
}

const EMPTY: FormState = {
  internalCode: '', name: '', status: '', patrimonialValueUsd: '', valuationDate: '',
  brand: '', model: '', year: '', serialNumber: '',
  plate: '', engineNumber: '', color: '', fuelType: '',
  powerHp: '', cutWidth: '', tankCapacity: '', workWidth: '', implementType: '',
  surfaceM2: '', address: '', constructionType: '', floors: '', constructionYear: '', buildingPurpose: '',
  surfaceHa: '', locality: '', province: '',
  activityType: '',
  technicalSpec: '',
  companyId: '', costCenterId: '', fixedAssetCode: '', productiveUnit: '', area: '', observations: '',
}

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORY_GROUPS: {
  label: string
  items: { key: AssetCategory; label: string; desc: string; icon: React.ElementType; color: string }[]
}[] = [
  {
    label: 'Vehículos',
    items: [
      { key: 'vehiculo',  label: 'Vehículo',  desc: 'Auto, utilitario o pick-up liviana', icon: Car,   color: 'text-blue-600 bg-blue-50' },
      { key: 'camioneta', label: 'Camioneta', desc: 'Pick-up 4x4 o doble cabina',          icon: Truck, color: 'text-blue-600 bg-blue-50' },
      { key: 'camion',    label: 'Camión',    desc: 'Camión de carga o transporte pesado', icon: Truck, color: 'text-slate-600 bg-slate-100' },
    ],
  },
  {
    label: 'Maquinaria agrícola',
    items: [
      { key: 'tractor',       label: 'Tractor',       desc: 'Tractor de campo o industrial',       icon: Settings2, color: 'text-green-600 bg-green-50' },
      { key: 'cosechadora',   label: 'Cosechadora',   desc: 'Cosechadora de granos o forraje',     icon: Layers,    color: 'text-green-600 bg-green-50' },
      { key: 'pulverizadora', label: 'Pulverizadora', desc: 'Autopropulsada o de arrastre',        icon: Layers,    color: 'text-green-600 bg-green-50' },
      { key: 'implemento',    label: 'Implemento',    desc: 'Sembradora, rastra, arado, acoplado', icon: Wrench,    color: 'text-orange-600 bg-orange-50' },
    ],
  },
  {
    label: 'Inmuebles y construcciones',
    items: [
      { key: 'edificio',          label: 'Edificio',          desc: 'Galpón, depósito, vivienda, oficinas',        icon: Building2, color: 'text-purple-600 bg-purple-50' },
      { key: 'establecimiento',   label: 'Establecimiento',   desc: 'Campo o predio con múltiples construcciones', icon: Landmark,  color: 'text-purple-600 bg-purple-50' },
      { key: 'planta_industrial', label: 'Planta industrial', desc: 'Planta de producción o procesamiento',        icon: Warehouse, color: 'text-rose-600 bg-rose-50' },
    ],
  },
  {
    label: 'Otros',
    items: [
      { key: 'equipo',          label: 'Equipo',          desc: 'Equipo técnico o especializado',  icon: Box,     color: 'text-slate-600 bg-slate-100' },
      { key: 'maquinaria',      label: 'Maquinaria',      desc: 'Maquinaria industrial o de proceso', icon: Cog,  color: 'text-slate-600 bg-slate-100' },
      { key: 'infraestructura', label: 'Infraestructura', desc: 'Silo, tanque, obra civil, alambrado', icon: Network, color: 'text-slate-600 bg-slate-100' },
    ],
  },
]

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  vehiculo: 'Vehículo', camioneta: 'Camioneta', camion: 'Camión',
  tractor: 'Tractor', cosechadora: 'Cosechadora', pulverizadora: 'Pulverizadora', implemento: 'Implemento',
  edificio: 'Edificio', establecimiento: 'Establecimiento', planta_industrial: 'Planta industrial',
  equipo: 'Equipo', maquinaria: 'Maquinaria', infraestructura: 'Infraestructura',
}

// ── Field option lists ─────────────────────────────────────────────────────────

const FUEL_TYPES   = ['Diésel', 'Nafta', 'GNC', 'Eléctrico', 'Híbrido']
const CONSTRUCTION = ['Hormigón', 'Steel Frame', 'Mampostería', 'Madera', 'Prefabricado', 'Mixta']
const PURPOSES     = ['Galpón', 'Depósito', 'Vivienda', 'Oficinas', 'Taller', 'Industrial', 'Otro']
const IMPL_TYPES   = ['Sembradora', 'Arado', 'Rastra', 'Fertilizadora', 'Cincel', 'Rolo', 'Acoplado', 'Otro']
const PROVINCES    = [
  'Buenos Aires', 'Córdoba', 'Santa Fe', 'Entre Ríos', 'La Pampa', 'Mendoza', 'San Luis',
  'San Juan', 'Río Negro', 'Neuquén', 'Chubut', 'Santa Cruz', 'Tierra del Fuego',
  'Salta', 'Jujuy', 'Tucumán', 'Santiago del Estero', 'Catamarca', 'La Rioja',
  'Chaco', 'Formosa', 'Misiones', 'Corrientes', 'Ciudad de Buenos Aires',
]

// ── Category helpers ───────────────────────────────────────────────────────────

const IS_ROAD  = (c: AssetCategory | '') => ['vehiculo', 'camioneta', 'camion'].includes(c)
const IS_AGRO  = (c: AssetCategory | '') => ['tractor', 'cosechadora', 'pulverizadora', 'implemento'].includes(c)
const HAS_BRAND = (c: AssetCategory | '') => IS_ROAD(c) || IS_AGRO(c)

// ── CategoryPicker ─────────────────────────────────────────────────────────────

function CategoryPicker({
  value, onChange,
}: { value: AssetCategory | ''; onChange: (v: AssetCategory) => void }) {
  return (
    <div className="space-y-6">
      {CATEGORY_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            {group.label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {group.items.map((item) => {
              const selected = value === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  className={clsx(
                    'relative flex flex-col gap-2.5 p-3.5 rounded-xl border-2 text-left transition-all',
                    selected
                      ? 'border-blue-600 bg-blue-50/60 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
                  )}
                >
                  {selected && (
                    <span className="absolute top-2.5 right-2.5 w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', item.color)}>
                    <item.icon size={17} />
                  </div>
                  <div>
                    <p className={clsx('text-sm font-semibold leading-tight', selected ? 'text-blue-700' : 'text-slate-800')}>
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500 leading-snug mt-0.5 line-clamp-2">{item.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Establecimiento buildings sub-form ────────────────────────────────────────

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
          <p className="text-sm text-slate-500">Ningún edificio registrado aún</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Agregar primer edificio
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {buildings.map((b, idx) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Edificio {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(b.id)}
                  className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Name — full width */}
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                  <FormInput
                    value={b.name}
                    onChange={(e) => onChange(b.id, 'name', e.target.value)}
                    placeholder="Ej: Galpón Norte, Casa de personal, Depósito"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Superficie (m²)</label>
                  <FormInput
                    type="number"
                    min={0}
                    value={b.surfaceM2}
                    onChange={(e) => onChange(b.id, 'surfaceM2', e.target.value)}
                    placeholder="Ej: 800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Uso / Destino</label>
                  <FormSelect
                    value={b.purpose}
                    onChange={(e) => onChange(b.id, 'purpose', e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </FormSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de construcción</label>
                  <FormSelect
                    value={b.constructionType}
                    onChange={(e) => onChange(b.id, 'constructionType', e.target.value)}
                  >
                    <option value="">Seleccionar…</option>
                    {CONSTRUCTION.map((c) => <option key={c} value={c}>{c}</option>)}
                  </FormSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Año de construcción</label>
                  <FormInput
                    type="number"
                    min={1900}
                    max={2030}
                    value={b.constructionYear}
                    onChange={(e) => onChange(b.id, 'constructionYear', e.target.value)}
                    placeholder="Ej: 2005"
                  />
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
  const [category, setCategory] = useState<AssetCategory | ''>('')
  const [form, setForm] = useState<FormState>(EMPTY)
  const [buildings, setBuildings] = useState<EstBuilding[]>([])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])

  const filteredCostCenters = form.companyId
    ? mockCostCenters.filter((cc) => cc.companyId === form.companyId)
    : []

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => {
        const next = { ...prev, [field]: e.target.value }
        if (field === 'companyId') next.costCenterId = ''
        return next
      })
    }
  }

  function handleCategoryChange(cat: AssetCategory) {
    setCategory(cat)
    setForm(EMPTY)
    setBuildings([])
  }

  function addBuilding() {
    setBuildings((prev) => [...prev, {
      id: `b-${Date.now()}`,
      name: '', surfaceM2: '', purpose: '', constructionType: '', constructionYear: '',
    }])
  }

  function removeBuilding(id: string) {
    setBuildings((prev) => prev.filter((b) => b.id !== id))
  }

  function updateBuilding(id: string, field: keyof Omit<EstBuilding, 'id'>, value: string) {
    setBuildings((prev) => prev.map((b) => b.id === id ? { ...b, [field]: value } : b))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: wire to backend create endpoint
    navigate('/assets')
  }

  const hasCategory = category !== ''

  // Placeholder text for "Nombre" per category type
  const namePlaceholder =
    IS_ROAD(category) ? 'Ej: Toyota Hilux 4x4 Doble Cabina' :
    IS_AGRO(category) ? 'Ej: John Deere 8R 340' :
    category === 'establecimiento' ? 'Ej: Establecimiento La Esperanza' :
    category === 'edificio' ? 'Ej: Galpón de almacenamiento Norte' :
    category === 'planta_industrial' ? 'Ej: Planta de secado Córdoba' :
    'Ej: Nombre del activo'

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Activo"
        subtitle="Registrá un nuevo bien en el inventario patrimonial."
        backTo="/assets"
        backLabel="Volver al inventario"
      />

      <form onSubmit={handleSubmit} noValidate className="max-w-5xl space-y-5">

        {/* ── 1. Tipo de activo (category picker) ── */}
        <SectionCard
          title="Tipo de activo"
          subtitle={
            hasCategory
              ? `Categoría seleccionada: ${CATEGORY_LABEL[category as AssetCategory]}`
              : 'Seleccioná la categoría del activo para ver los campos correspondientes.'
          }
        >
          <CategoryPicker value={category} onChange={handleCategoryChange} />
        </SectionCard>

        {/* ── Resto del form — solo visible tras elegir categoría ── */}
        {hasCategory && (
          <>
            {/* ── 2. Identificación base ── */}
            <SectionCard title="Identificación" subtitle="Datos generales del activo.">
              <FormSection title="">
                <FormField label="Código Interno" required>
                  <FormInput
                    placeholder="Ej: ACT-0042"
                    value={form.internalCode}
                    onChange={set('internalCode')}
                  />
                </FormField>

                <FormField label="Nombre / Descripción" required>
                  <FormInput
                    placeholder={namePlaceholder}
                    value={form.name}
                    onChange={set('name')}
                  />
                </FormField>

                <FormField label="Estado" required>
                  <FormSelect value={form.status} onChange={set('status')}>
                    <option value="">Seleccionar estado…</option>
                    {Object.entries(ASSET_STATUS_LABELS).map(([k, l]) => (
                      <option key={k} value={k}>{l}</option>
                    ))}
                  </FormSelect>
                </FormField>

                {/* Marca / Modelo / Año — solo vehículos y maquinaria */}
                {HAS_BRAND(category) && (
                  <>
                    <FormField label="Marca">
                      <FormInput
                        placeholder={IS_ROAD(category) ? 'Ej: Toyota' : 'Ej: John Deere'}
                        value={form.brand}
                        onChange={set('brand')}
                      />
                    </FormField>

                    {category !== 'implemento' && (
                      <FormField label="Modelo">
                        <FormInput
                          placeholder={IS_ROAD(category) ? 'Ej: Hilux SRX' : 'Ej: 8R 340'}
                          value={form.model}
                          onChange={set('model')}
                        />
                      </FormField>
                    )}

                    <FormField label="Año">
                      <FormInput
                        type="number"
                        placeholder="Ej: 2022"
                        min={1950}
                        max={2030}
                        value={form.year}
                        onChange={set('year')}
                      />
                    </FormField>
                  </>
                )}

                {/* N° de Serie / Chasis */}
                {(IS_ROAD(category) || IS_AGRO(category)) && (
                  <FormField label={IS_ROAD(category) ? 'N° de Chasis' : 'N° de Serie'}>
                    <FormInput
                      placeholder="Ej: 1GC1KWEY5HF123456"
                      value={form.serialNumber}
                      onChange={set('serialNumber')}
                    />
                  </FormField>
                )}

                <FormField label="Valor Patrimonial (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput
                      type="number"
                      placeholder="0.00"
                      min={0}
                      step="0.01"
                      className="pl-7"
                      value={form.patrimonialValueUsd}
                      onChange={set('patrimonialValueUsd')}
                    />
                  </div>
                </FormField>

                <FormField label="Fecha de Valuación">
                  <FormInput type="date" value={form.valuationDate} onChange={set('valuationDate')} />
                </FormField>
              </FormSection>
            </SectionCard>

            {/* ── 3. Datos específicos por categoría ── */}

            {/* Vehículos */}
            {IS_ROAD(category) && (
              <SectionCard
                title="Datos del vehículo"
                subtitle="Información técnica y de identificación del rodado."
              >
                <FormSection title="">
                  <FormField label="Patente">
                    <FormInput
                      placeholder="Ej: AB 123 CD"
                      value={form.plate}
                      onChange={set('plate')}
                    />
                  </FormField>
                  <FormField label="N° de Motor">
                    <FormInput
                      placeholder="Ej: 2GR-FE-0012345"
                      value={form.engineNumber}
                      onChange={set('engineNumber')}
                    />
                  </FormField>
                  <FormField label="Color">
                    <FormInput
                      placeholder="Ej: Blanco perla"
                      value={form.color}
                      onChange={set('color')}
                    />
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

            {/* Tractor / Cosechadora / Pulverizadora */}
            {(['tractor', 'cosechadora', 'pulverizadora'] as AssetCategory[]).includes(category as AssetCategory) && (
              <SectionCard
                title="Datos de la maquinaria"
                subtitle="Especificaciones técnicas del equipo."
              >
                <FormSection title="">
                  <FormField label="N° de Motor">
                    <FormInput
                      placeholder="Ej: CD6090-123456"
                      value={form.engineNumber}
                      onChange={set('engineNumber')}
                    />
                  </FormField>
                  <FormField label="Potencia (HP)">
                    <FormInput
                      type="number"
                      min={0}
                      placeholder="Ej: 340"
                      value={form.powerHp}
                      onChange={set('powerHp')}
                    />
                  </FormField>
                  {category === 'cosechadora' && (
                    <FormField label="Ancho de corte (m)">
                      <FormInput
                        type="number"
                        min={0}
                        step="0.1"
                        placeholder="Ej: 9.2"
                        value={form.cutWidth}
                        onChange={set('cutWidth')}
                      />
                    </FormField>
                  )}
                  {category === 'pulverizadora' && (
                    <>
                      <FormField label="Capacidad del tanque (lts)">
                        <FormInput
                          type="number"
                          min={0}
                          placeholder="Ej: 4500"
                          value={form.tankCapacity}
                          onChange={set('tankCapacity')}
                        />
                      </FormField>
                      <FormField label="Ancho de trabajo (m)">
                        <FormInput
                          type="number"
                          min={0}
                          step="0.1"
                          placeholder="Ej: 32"
                          value={form.workWidth}
                          onChange={set('workWidth')}
                        />
                      </FormField>
                    </>
                  )}
                </FormSection>
              </SectionCard>
            )}

            {/* Implemento */}
            {category === 'implemento' && (
              <SectionCard
                title="Datos del implemento"
                subtitle="Tipo y especificaciones técnicas."
              >
                <FormSection title="">
                  <FormField label="Tipo de implemento">
                    <FormSelect value={form.implementType} onChange={set('implementType')}>
                      <option value="">Seleccionar…</option>
                      {IMPL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Ancho de trabajo (m)">
                    <FormInput
                      type="number"
                      min={0}
                      step="0.1"
                      placeholder="Ej: 9.5"
                      value={form.workWidth}
                      onChange={set('workWidth')}
                    />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {/* Edificio */}
            {category === 'edificio' && (
              <SectionCard
                title="Datos del edificio"
                subtitle="Características físicas y constructivas."
              >
                <FormSection title="">
                  <FormField label="Superficie (m²)" required>
                    <FormInput
                      type="number"
                      min={0}
                      placeholder="Ej: 1200"
                      value={form.surfaceM2}
                      onChange={set('surfaceM2')}
                    />
                  </FormField>
                  <FormField label="Uso / Destino">
                    <FormSelect value={form.buildingPurpose} onChange={set('buildingPurpose')}>
                      <option value="">Seleccionar…</option>
                      {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Tipo de construcción">
                    <FormSelect value={form.constructionType} onChange={set('constructionType')}>
                      <option value="">Seleccionar…</option>
                      {CONSTRUCTION.map((c) => <option key={c} value={c}>{c}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="N° de pisos">
                    <FormInput
                      type="number"
                      min={1}
                      max={50}
                      placeholder="Ej: 1"
                      value={form.floors}
                      onChange={set('floors')}
                    />
                  </FormField>
                  <FormField label="Año de construcción">
                    <FormInput
                      type="number"
                      min={1900}
                      max={2030}
                      placeholder="Ej: 2010"
                      value={form.constructionYear}
                      onChange={set('constructionYear')}
                    />
                  </FormField>
                  <FormField label="Dirección / Ubicación" fullWidth>
                    <FormInput
                      placeholder="Ej: Ruta 8 Km. 340, Trenque Lauquen"
                      value={form.address}
                      onChange={set('address')}
                    />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {/* Establecimiento */}
            {category === 'establecimiento' && (
              <SectionCard
                title="Datos del establecimiento"
                subtitle="Información del campo o predio y sus construcciones."
              >
                <div className="space-y-6">
                  <FormSection title="">
                    <FormField label="Superficie total (ha)" required>
                      <FormInput
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="Ej: 1250.5"
                        value={form.surfaceHa}
                        onChange={set('surfaceHa')}
                      />
                    </FormField>
                    <FormField label="Provincia">
                      <FormSelect value={form.province} onChange={set('province')}>
                        <option value="">Seleccionar…</option>
                        {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </FormSelect>
                    </FormField>
                    <FormField label="Localidad / Partido">
                      <FormInput
                        placeholder="Ej: General Villegas"
                        value={form.locality}
                        onChange={set('locality')}
                      />
                    </FormField>
                    <FormField label="Dirección / Ubicación" fullWidth>
                      <FormInput
                        placeholder="Ej: Ruta Provincial 70 Km. 12"
                        value={form.address}
                        onChange={set('address')}
                      />
                    </FormField>
                  </FormSection>

                  <div className="border-t border-slate-100 pt-5">
                    <EstBuildingsSection
                      buildings={buildings}
                      onAdd={addBuilding}
                      onRemove={removeBuilding}
                      onChange={updateBuilding}
                    />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Planta industrial */}
            {category === 'planta_industrial' && (
              <SectionCard
                title="Datos de la planta"
                subtitle="Características de la planta industrial."
              >
                <FormSection title="">
                  <FormField label="Superficie (m²)">
                    <FormInput
                      type="number"
                      min={0}
                      placeholder="Ej: 5000"
                      value={form.surfaceM2}
                      onChange={set('surfaceM2')}
                    />
                  </FormField>
                  <FormField label="Tipo de actividad">
                    <FormInput
                      placeholder="Ej: Secado y almacenamiento de granos"
                      value={form.activityType}
                      onChange={set('activityType')}
                    />
                  </FormField>
                  <FormField label="Año de construcción">
                    <FormInput
                      type="number"
                      min={1900}
                      max={2030}
                      placeholder="Ej: 2015"
                      value={form.constructionYear}
                      onChange={set('constructionYear')}
                    />
                  </FormField>
                  <FormField label="Dirección / Ubicación" fullWidth>
                    <FormInput
                      placeholder="Ej: Parque Industrial Norte, Lote 14"
                      value={form.address}
                      onChange={set('address')}
                    />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {/* Equipo / Maquinaria / Infraestructura */}
            {(['equipo', 'maquinaria', 'infraestructura'] as AssetCategory[]).includes(category as AssetCategory) && (
              <SectionCard
                title="Especificaciones técnicas"
                subtitle="Describí las características y uso del activo."
              >
                <FormSection title="">
                  <FormField label="Especificaciones" fullWidth>
                    <FormTextarea
                      rows={3}
                      placeholder="Ej: Silo metálico de 1500 t, estructura de acero galvanizado, año 2019…"
                      value={form.technicalSpec}
                      onChange={set('technicalSpec')}
                    />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {/* ── 4. Imputación Contable ── */}
            <SectionCard
              title="Imputación Contable"
              subtitle="Asignación a empresa, centro de costo y unidad productiva."
            >
              <FormSection title="">
                <FormField label="Empresa" required>
                  <FormSelect value={form.companyId} onChange={set('companyId')}>
                    <option value="">Seleccionar empresa…</option>
                    {mockCompanies.filter((c) => c.status === 'activo').map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </FormSelect>
                </FormField>

                <FormField label="Centro de Costo">
                  <FormSelect
                    value={form.costCenterId}
                    onChange={set('costCenterId')}
                    disabled={!form.companyId}
                  >
                    <option value="">
                      {form.companyId ? 'Seleccionar centro de costo…' : 'Primero seleccioná una empresa'}
                    </option>
                    {filteredCostCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                    ))}
                  </FormSelect>
                </FormField>

                <FormField label="Código de Bien de Uso">
                  <FormInput
                    placeholder="Ej: BU-00123"
                    value={form.fixedAssetCode}
                    onChange={set('fixedAssetCode')}
                  />
                </FormField>

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
            </SectionCard>

            {/* ── 5. Observaciones y adjuntos ── */}
            <SectionCard
              title="Observaciones y documentación"
              subtitle="Anotaciones generales y archivos adjuntos del activo."
            >
              <div className="space-y-4">
                <FormField label="Observaciones" fullWidth>
                  <FormTextarea
                    rows={3}
                    placeholder="Anotaciones sobre el estado, historial o condiciones del activo…"
                    value={form.observations}
                    onChange={set('observations')}
                  />
                </FormField>
                <AttachmentListEditor
                  attachments={attachments}
                  onChange={setAttachments}
                />
              </div>
            </SectionCard>

            {/* ── Footer ── */}
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
