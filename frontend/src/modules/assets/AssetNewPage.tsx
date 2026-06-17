import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, X, Car, Truck, Settings2, Layers, Wrench,
  Building2, Landmark, Box, Cog, Network,
  Check, Plus, Trash2, MapPin, Bike, Hash, Search,
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
import { mockAssets } from '../../data/mock-assets'
import { mockBienesDeUso } from '../../data/mock-bienes-de-uso'
import { assetRepository } from '../../services/repositories/asset.repository'
import {
  BUILDING_PURPOSES, FUEL_TYPES, INFRASTRUCTURE_TYPES,
  PRODUCTIVE_UNITS, AREAS, PROVINCES, SILO_CONTENTS,
} from '../../shared/constants'
import type { AssetCategory, AssetAttachment, AssetAllocation, Silo, AssetStatus } from '../../shared/types'

// ── Helpers ────────────────────────────────────────────────────────────────────

const IS_WHEELED = (c: AssetCategory | '') =>
  ['vehiculo', 'camioneta', 'camion', 'moto'].includes(c)
const IS_AGRO = (c: AssetCategory | '') =>
  ['tractor', 'cosechadora', 'pulverizadora', 'implemento'].includes(c)
const HAS_BRAND = (c: AssetCategory | '') => IS_WHEELED(c) || IS_AGRO(c)

// ── Local form state ───────────────────────────────────────────────────────────

type FormState = {
  bienDeUsoId: string
  name: string
  status: string
  patrimonialValueUsd: string
  valuationDate: string
  // vehicles & machinery
  brand: string
  model: string
  year: string
  serialNumber: string
  chassisNumber: string
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
  // building / establishment
  surfaceM2: string
  address: string
  constructionType: string
  floors: string
  constructionYear: string
  buildingPurpose: string
  mapsUrl: string
  // estate
  surfaceHa: string
  locality: string
  province: string
  // infrastructure
  infraType: string
  infraCapacityTons: string
  infraContent: string
  // shared
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

// ── Category picker config ─────────────────────────────────────────────────────

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
      { key: 'moto',      label: 'Moto',      desc: 'Motocicleta o cuatriciclo',           icon: Bike,  color: 'text-blue-600 bg-blue-50' },
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
      { key: 'edificio',        label: 'Edificio',        desc: 'Galpón, depósito, vivienda, oficinas',        icon: Building2, color: 'text-purple-600 bg-purple-50' },
      { key: 'establecimiento', label: 'Establecimiento', desc: 'Campo o predio con múltiples construcciones', icon: Landmark,  color: 'text-purple-600 bg-purple-50' },
    ],
  },
  {
    label: 'Otros',
    items: [
      { key: 'equipo',          label: 'Equipo',          desc: 'Equipo técnico o especializado',     icon: Box,     color: 'text-slate-600 bg-slate-100' },
      { key: 'maquinaria',      label: 'Maquinaria',      desc: 'Maquinaria industrial o de proceso', icon: Cog,     color: 'text-slate-600 bg-slate-100' },
      { key: 'infraestructura', label: 'Infraestructura', desc: 'Silo, tanque, obra civil, alambrado', icon: Network, color: 'text-slate-600 bg-slate-100' },
    ],
  },
]

const CATEGORY_LABEL: Record<AssetCategory, string> = {
  vehiculo: 'Vehículo', camioneta: 'Camioneta', camion: 'Camión', moto: 'Moto',
  tractor: 'Tractor', cosechadora: 'Cosechadora', pulverizadora: 'Pulverizadora', implemento: 'Implemento',
  edificio: 'Edificio', establecimiento: 'Establecimiento',
  equipo: 'Equipo', maquinaria: 'Maquinaria', infraestructura: 'Infraestructura',
}

const IMPL_TYPES = ['Sembradora', 'Arado', 'Rastra', 'Fertilizadora', 'Cincel', 'Rolo', 'Acoplado', 'Otro']

// ── Subcomponents ──────────────────────────────────────────────────────────────

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

// ── Auto-generated internal code (system-assigned) ────────────────────────────

function generateNextCode(): string {
  const nums = mockAssets
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

// ── Bien de Uso selector (Finnegans catalog) ───────────────────────────────────

// Maps AssetCategory to matching Finnegans categories for filtering
const CATEGORY_TO_FINNEGANS: Partial<Record<AssetCategory, string[]>> = {
  vehiculo:       ['Rodados'],
  camioneta:      ['Rodados'],
  camion:         ['Rodados'],
  moto:           ['Rodados'],
  tractor:        ['Maquinaria y Equipo'],
  cosechadora:    ['Maquinaria y Equipo'],
  pulverizadora:  ['Maquinaria y Equipo'],
  implemento:     ['Maquinaria y Equipo', 'Implementos Agrícolas'],
  equipo:         ['Maquinaria y Equipo'],
  maquinaria:     ['Maquinaria y Equipo'],
  edificio:       ['Inmuebles'],
  establecimiento: ['Inmuebles'],
  infraestructura: ['Infraestructura y Mejoras'],
}

function BienDeUsoField({
  value, onChange, categoryFilter,
}: { value: string; onChange: (id: string) => void; categoryFilter?: string[] }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const filteredCatalog = useMemo(() => {
    if (!categoryFilter?.length) return mockBienesDeUso
    return mockBienesDeUso.filter((b) => categoryFilter.includes(b.category))
  }, [categoryFilter])

  const results = useMemo(() => {
    if (!query.trim()) return filteredCatalog.slice(0, 8)
    const q = query.toLowerCase()
    return filteredCatalog.filter(
      (b) => b.code.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    ).slice(0, 8)
  }, [query, filteredCatalog])

  const selected = mockBienesDeUso.find((b) => b.id === value)

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-start justify-between gap-2 px-3 py-3 rounded-lg border border-blue-300 bg-blue-50">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-blue-700 font-mono tracking-wide">{selected.code}</p>
              <span className="text-xs text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded font-medium">{selected.category}</span>
            </div>
            <p className="text-sm font-medium text-slate-700">{selected.description}</p>
            <div className="flex items-center gap-3 pt-0.5">
              <span className="text-xs text-slate-500">
                Incorporación: <span className="font-medium">{selected.incorporationDate}</span>
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                VU: <span className="font-medium">{selected.usefulLifeYears} años</span>
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                Amort: <span className="font-medium">{selected.depreciationRate}% anual</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); setQuery('') }}
            className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors mt-0.5"
            title="Limpiar selección"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Buscar por código o descripción en Finnegans…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {results.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseDown={() => { onChange(b.id); setQuery(''); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
                >
                  <span className="text-xs font-mono font-semibold text-blue-600 flex-shrink-0 w-[72px]">{b.code}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{b.description}</p>
                    <p className="text-xs text-slate-400">{b.category}</p>
                  </div>
                </button>
              ))}
              <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400 italic">
                Catálogo de muestra — en producción conecta con Finnegans
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Allocation editor ──────────────────────────────────────────────────────────

function AllocationEditor({
  allocations, onChange,
}: {
  allocations: AssetAllocation[]
  onChange: (v: AssetAllocation[]) => void
}) {
  const activeCompanies = mockCompanies.filter((c) => c.status === 'activo')

  function add() {
    onChange([...allocations, { id: `alloc-${Date.now()}`, companyId: '', costCenterId: '', percentage: 0 }])
  }

  function remove(id: string) {
    onChange(allocations.filter((a) => a.id !== id))
  }

  function update(id: string, field: keyof Omit<AssetAllocation, 'id'>, value: string | number) {
    onChange(allocations.map((a) =>
      a.id === id ? { ...a, [field]: value, ...(field === 'companyId' ? { costCenterId: '' } : {}) } : a,
    ))
  }

  const total = allocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0)
  const isValid = total === 100

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Empresas y Centros de Costo</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Asigná el porcentaje de imputación por empresa. Los porcentajes deben sumar 100%.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>

      {allocations.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <Building2 size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin asignación contable</p>
          <button type="button" onClick={add} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Agregar empresa
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {allocations.map((alloc, idx) => {
            const ccs = mockCostCenters.filter(
              (cc) => cc.status === 'activo' && (!alloc.companyId || cc.companyId === alloc.companyId),
            )
            return (
              <div key={alloc.id} className="flex items-end gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
                  <select
                    value={alloc.companyId}
                    onChange={(e) => update(alloc.id, 'companyId', e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar…</option>
                    {activeCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Centro de Costo</label>
                  <select
                    value={alloc.costCenterId}
                    onChange={(e) => update(alloc.id, 'costCenterId', e.target.value)}
                    disabled={!alloc.companyId}
                    className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  >
                    <option value="">{alloc.companyId ? 'Seleccionar…' : 'Primero empresa'}</option>
                    {ccs.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
                  </select>
                </div>
                <div className="w-24 flex-shrink-0">
                  <label className="block text-xs font-medium text-slate-500 mb-1">% Imputación</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={alloc.percentage || ''}
                      onChange={(e) => update(alloc.id, 'percentage', parseInt(e.target.value) || 0)}
                      className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 pr-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>
                {allocations.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(alloc.id)}
                    className="mb-0.5 p-2 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                {idx === 0 && allocations.length === 1 && <div className="w-7 flex-shrink-0" />}
              </div>
            )
          })}
          <div className={clsx(
            'flex items-center justify-end gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold',
            isValid ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50',
          )}>
            <span>Total: {total}%</span>
            {isValid ? <Check size={14} /> : <span className="text-xs font-normal">(debe ser 100%)</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Map input ──────────────────────────────────────────────────────────────────

function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  // Matches @lat,lng or ?q=lat,lng or /@lat,lng
  const patterns = [
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) {
      const lat = parseFloat(m[1])
      const lng = parseFloat(m[2])
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { lat, lng }
      }
    }
  }
  return null
}

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

// ── Silos sub-form ─────────────────────────────────────────────────────────────

function SilosSection({
  silos, onAdd, onRemove, onChange,
}: {
  silos: Silo[]
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, field: keyof Omit<Silo, 'id'>, value: string | number) => void
}) {
  const totalTons = silos.reduce((sum, s) => sum + (Number(s.capacityTons) || 0), 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Silos</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Registrá los silos con su capacidad y contenido
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <Plus size={14} />
          Agregar silo
        </button>
      </div>

      {silos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <Box size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin silos registrados</p>
          <button type="button" onClick={onAdd} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Agregar primer silo
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {silos.map((silo, idx) => (
            <div key={silo.id} className="flex items-end gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-slate-500">{idx + 1}</span>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Capacidad (toneladas)</label>
                <input
                  type="number"
                  min={0}
                  value={silo.capacityTons || ''}
                  onChange={(e) => onChange(silo.id, 'capacityTons', parseFloat(e.target.value) || 0)}
                  placeholder="Ej: 2200"
                  className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-500 mb-1">Contenido</label>
                <select
                  value={silo.content}
                  onChange={(e) => onChange(silo.id, 'content', e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar…</option>
                  {SILO_CONTENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button
                type="button"
                onClick={() => onRemove(silo.id)}
                className="mb-0.5 p-2 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {totalTons > 0 && (
            <div className="flex items-center justify-end gap-2 px-2 py-1.5 rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">
              Capacidad total: {totalTons.toLocaleString('es-AR')} tn ({silos.length} silo{silos.length !== 1 ? 's' : ''})
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Buildings sub-form ─────────────────────────────────────────────────────────

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
  const [allocations, setAllocations] = useState<AssetAllocation[]>([
    { id: 'alloc-init', companyId: '', costCenterId: '', percentage: 100 },
  ])
  const [buildings, setBuildings] = useState<EstBuilding[]>([])
  const [silos, setSilos] = useState<Silo[]>([])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
    }
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

    const primaryAlloc = allocations[0]

    const selectedBienDeUso = mockBienesDeUso.find((b) => b.id === form.bienDeUsoId)

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
            {/* 2. Código de Bien de Uso + Identificación */}
            <SectionCard
              title="Identificación"
              subtitle="Código de Bien de Uso (Finnegans), nombre y estado."
            >
              <FormSection title="">
                <FormField label="Código de activo (sistema)">
                  <AutoCodeDisplay code={generatedCode} />
                </FormField>
                <FormField label="Bien de Uso (Finnegans)" fullWidth>
                  <BienDeUsoField
                    value={form.bienDeUsoId}
                    onChange={(id) => setForm((prev) => ({ ...prev, bienDeUsoId: id }))}
                    categoryFilter={category ? CATEGORY_TO_FINNEGANS[category] : undefined}
                  />
                </FormField>
                <FormField label="Nombre / Descripción" required>
                  <FormInput placeholder={namePlaceholder} value={form.name} onChange={set('name')} />
                </FormField>
                <FormField label="Estado" required>
                  <FormSelect value={form.status} onChange={set('status')}>
                    <option value="activo">Activo</option>
                    <option value="baja">Baja</option>
                    <option value="vendido">Vendido</option>
                  </FormSelect>
                </FormField>
                {/* Marca / Modelo / Año */}
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
                {/* Número de Chasis (ruedas) o Serie (agro) */}
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
                <FormField label="Valor Patrimonial (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput type="number" placeholder="0.00" min={0} step="0.01" className="pl-7" value={form.patrimonialValueUsd} onChange={set('patrimonialValueUsd')} />
                  </div>
                </FormField>
                <FormField label="Fecha de Valuación">
                  <FormInput type="date" value={form.valuationDate} onChange={set('valuationDate')} />
                </FormField>
              </FormSection>
            </SectionCard>

            {/* 3. Datos específicos por categoría */}

            {/* Vehículos (incluyendo moto) */}
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

            {/* Tractor / Cosechadora / Pulverizadora */}
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

            {/* Implemento */}
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

            {/* Edificio */}
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

            {/* Establecimiento */}
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

            {/* Infraestructura */}
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
                {/* Silos múltiples si es tipo Silo */}
                {isSiloInfra && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <SilosSection silos={silos} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
                  </div>
                )}
              </SectionCard>
            )}

            {/* Equipo / Maquinaria */}
            {(['equipo', 'maquinaria'] as AssetCategory[]).includes(category as AssetCategory) && (
              <SectionCard title="Especificaciones técnicas" subtitle="Características y uso del activo.">
                <FormSection title="">
                  <FormField label="Especificaciones" fullWidth>
                    <FormTextarea rows={3} placeholder="Ej: Equipo de bombeo 50HP, marca X, modelo Y…" value={form.technicalSpec} onChange={set('technicalSpec')} />
                  </FormField>
                </FormSection>
              </SectionCard>
            )}

            {/* 4. Imputación Contable (multi-empresa) */}
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

            {/* 5. Observaciones y adjuntos */}
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
