import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Save, X, Plus, Trash2, Check, Search, Building2,
  TrendingUp, Calendar, MapPin, Wheat, Hash,
} from 'lucide-react'
import clsx from 'clsx'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection, FormField, FormInput, FormSelect, FormTextarea,
} from '../../shared/components/forms/FormSection'
import { AttachmentListEditor } from '../../shared/components/file-upload/AttachmentListEditor'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { assetRepository } from '../../services/repositories/asset.repository'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import { mockBienesDeUso } from '../../data/mock-bienes-de-uso'
import { ASSET_STATUS_LABELS, PRODUCTIVE_UNITS, AREAS, SILO_CONTENTS } from '../../shared/constants'
import { formatDate } from '../../shared/utils/format'
import type { AssetStatus, AssetAllocation, AssetValueEntry, AssetAttachment, Silo } from '../../shared/types'

// ── Types ──────────────────────────────────────────────────────────────────────

type EditForm = {
  fixedAssetCode: string  // BienDeUso id (Finnegans) — NOT the system internalCode
  name: string
  status: string
  assetType: string
  brand: string
  model: string
  year: string
  serialNumber: string
  chassisNumber: string
  productiveUnit: string
  area: string
  observations: string
  mapsUrl: string
}

type NewValueEntry = {
  date: string
  valueUsd: string
  notes: string
}

const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][]

// Maps the stored assetType string to the matching Finnegans categories for filtering
const ASSET_TYPE_TO_FINNEGANS: Record<string, string[]> = {
  'Vehículo':       ['Rodados'],
  'Camioneta':      ['Rodados'],
  'Camión':         ['Rodados'],
  'Moto':           ['Rodados'],
  'Tractor':        ['Maquinaria y Equipo'],
  'Cosechadora':    ['Maquinaria y Equipo'],
  'Pulverizadora':  ['Maquinaria y Equipo'],
  'Implemento':     ['Maquinaria y Equipo', 'Implementos Agrícolas'],
  'Equipo':         ['Maquinaria y Equipo'],
  'Maquinaria':     ['Maquinaria y Equipo'],
  'Edificio':       ['Inmuebles'],
  'Establecimiento': ['Inmuebles'],
  'Infraestructura': ['Infraestructura y Mejoras'],
}

// ── Auto-generated internal code display (read-only) ──────────────────────────

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

// ── AllocationEditor ───────────────────────────────────────────────────────────

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
            Asignación contable con porcentaje. Debe sumar 100%.
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
          {allocations.map((alloc) => {
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
                {allocations.length === 1 && <div className="w-7 flex-shrink-0" />}
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

// ── Value History Section ──────────────────────────────────────────────────────

function ValueHistorySection({
  history,
  currentValue,
  onAdd,
}: {
  history: AssetValueEntry[]
  currentValue: string
  onAdd: (entry: Omit<AssetValueEntry, 'id'>) => void
}) {
  const [adding, setAdding] = useState(false)
  const [entry, setEntry] = useState<NewValueEntry>({ date: '', valueUsd: '', notes: '' })

  function handleAdd() {
    if (!entry.date || !entry.valueUsd) return
    onAdd({
      date: entry.date,
      valueUsd: parseFloat(entry.valueUsd),
      notes: entry.notes.trim() || undefined,
    })
    setEntry({ date: '', valueUsd: '', notes: '' })
    setAdding(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Historial de valuaciones USD</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Registro histórico de valuaciones para seguimiento patrimonial.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Nueva entrada
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Nueva entrada de valuación</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
              <input
                type="date"
                value={entry.date}
                onChange={(e) => setEntry((p) => ({ ...p, date: e.target.value }))}
                className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor USD</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Ej: 32000"
                  value={entry.valueUsd}
                  onChange={(e) => setEntry((p) => ({ ...p, valueUsd: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-slate-200 bg-white pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
              <input
                type="text"
                placeholder="Ej: Revaluación por tasador externo"
                value={entry.notes}
                onChange={(e) => setEntry((p) => ({ ...p, notes: e.target.value }))}
                className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!entry.date || !entry.valueUsd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <Check size={14} />
              Registrar
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setEntry({ date: '', valueUsd: '', notes: '' }) }}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* History list */}
      {history.length === 0 && !adding ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <TrendingUp size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin historial de valuaciones registrado</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {history.map((h, idx) => {
            const isLatest = idx === history.length - 1
            return (
              <div key={h.id} className={clsx('flex items-center justify-between gap-4 px-4 py-3', isLatest && 'bg-emerald-50/40')}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0', isLatest ? 'bg-emerald-100' : 'bg-slate-100')}>
                    <Calendar size={13} className={isLatest ? 'text-emerald-600' : 'text-slate-500'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700">{formatDate(h.date)}</p>
                    {h.notes && <p className="text-xs text-slate-400 truncate">{h.notes}</p>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={clsx('text-sm font-semibold font-mono', isLatest ? 'text-emerald-700' : 'text-slate-700')}>
                    US$ {h.valueUsd.toLocaleString('es-AR')}
                  </p>
                  {isLatest && <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wide">Actual</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Current value display alongside history */}
      {currentValue && parseFloat(currentValue) > 0 && (
        <p className="text-xs text-slate-400 mt-2 text-right">
          Valor actual del formulario: US$ {parseFloat(currentValue).toLocaleString('es-AR')}
        </p>
      )}
    </div>
  )
}

// ── Map & Silos helpers ────────────────────────────────────────────────────────

function parseGoogleMapsUrl(url: string): { lat: number; lng: number } | null {
  const patterns = [
    /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/,
    /\/(-?\d+\.?\d*),(-?\d+\.?\d*)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) }
  }
  return null
}

function MapSection({ mapsUrl, onChange }: { mapsUrl: string; onChange: (v: string) => void }) {
  const coords = mapsUrl ? parseGoogleMapsUrl(mapsUrl) : null

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <MapPin size={14} className="text-slate-500" />
        <p className="text-sm font-semibold text-slate-800">Ubicación en mapa</p>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Pegá una URL de Google Maps para mostrar la ubicación del activo.
      </p>
      <input
        type="url"
        value={mapsUrl}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://www.google.com/maps/@-34.603722,-58.381592,15z"
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 bg-white"
      />
      {mapsUrl && !coords && (
        <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
          <MapPin size={11} />
          No se pudo extraer coordenadas de esta URL.
        </p>
      )}
      {coords && (
        <div className="mt-3 rounded-xl overflow-hidden border border-slate-200">
          <iframe
            title="Mapa del activo"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${coords.lng - 0.005},${coords.lat - 0.003},${coords.lng + 0.005},${coords.lat + 0.003}&layer=mapnik&marker=${coords.lat},${coords.lng}`}
            className="w-full h-48 block"
            loading="lazy"
          />
          <div className="px-3 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-mono">{coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}</span>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
              <MapPin size={10} />
              Ver en Google Maps
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

function SilosSection({
  silos, onAdd, onRemove, onChange,
}: {
  silos: Silo[]
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, field: keyof Omit<Silo, 'id'>, value: string | number) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wheat size={14} className="text-slate-500" />
          <p className="text-sm font-semibold text-slate-800">Silos / Celdas</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
        >
          <Plus size={14} />
          Agregar silo
        </button>
      </div>

      {silos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <Wheat size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin silos registrados</p>
          <button type="button" onClick={onAdd} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Agregar silo
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {silos.map((silo, idx) => (
            <div key={silo.id} className="flex items-end gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-500">
                {idx + 1}
              </div>
              <div className="w-36 flex-shrink-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">Capacidad (tn)</label>
                <input
                  type="number"
                  min={0}
                  value={silo.capacityTons || ''}
                  onChange={(e) => onChange(silo.id, 'capacityTons', parseFloat(e.target.value) || 0)}
                  placeholder="2200"
                  className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 min-w-0">
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
                className="mb-0.5 p-2 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-400 text-right">
            Capacidad total: {silos.reduce((s, x) => s + (x.capacityTons || 0), 0).toLocaleString('es-AR')} tn
          </p>
        </div>
      )}
    </div>
  )
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AssetEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const asset = assetRepository.findById(id!)

  const [form, setForm] = useState<EditForm>(() => {
    if (!asset) return {
      fixedAssetCode: '', name: '', status: 'activo', assetType: '',
      brand: '', model: '', year: '', serialNumber: '', chassisNumber: '',
      productiveUnit: '', area: '', observations: '', mapsUrl: '',
    }
    // Find the BienDeUso by its Finnegans code to get the id used by the selector
    const linkedBienDeUso = mockBienesDeUso.find((b) => b.code === asset.fixedAssetCode)
    return {
      fixedAssetCode: linkedBienDeUso?.id ?? '',
      name: asset.name,
      status: asset.status,
      assetType: asset.assetType,
      brand: asset.brand,
      model: asset.model,
      year: asset.year > 0 ? String(asset.year) : '',
      serialNumber: asset.serialNumber,
      chassisNumber: asset.chassisNumber ?? '',
      productiveUnit: asset.productiveUnit,
      area: asset.area,
      observations: asset.observations,
      mapsUrl: asset.mapsUrl ?? '',
    }
  })

  const [patrimonialValueUsd, setPatrimonialValueUsd] = useState(
    asset ? String(asset.patrimonialValueUsd) : '',
  )
  const [valuationDate, setValuationDate] = useState(asset?.valuationDate ?? '')

  const [allocations, setAllocations] = useState<AssetAllocation[]>(() => {
    if (!asset) return [{ id: 'alloc-init', companyId: '', costCenterId: '', percentage: 100 }]
    if (asset.allocations && asset.allocations.length > 0) return asset.allocations
    return [{
      id: 'alloc-init',
      companyId: asset.companyId,
      costCenterId: asset.costCenterId,
      percentage: 100,
    }]
  })

  const [valueHistory, setValueHistory] = useState<AssetValueEntry[]>(
    asset?.valueHistory ?? [],
  )

  const [silos, setSilos] = useState<Silo[]>(asset?.silos ?? [])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])

  if (!asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  function set(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
    }
  }

  function addSilo() {
    setSilos((prev) => [...prev, { id: `silo-${Date.now()}`, name: '', capacityTons: 0, content: '' }])
  }
  function removeSilo(id: string) { setSilos((prev) => prev.filter((s) => s.id !== id)) }
  function updateSilo(id: string, field: keyof Omit<Silo, 'id'>, value: string | number) {
    setSilos((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s))
  }

  function handleAddValueEntry(entry: Omit<AssetValueEntry, 'id'>) {
    const newEntry: AssetValueEntry = { id: `vh-${Date.now()}`, ...entry }
    setValueHistory((prev) => [...prev, newEntry])
    setPatrimonialValueUsd(String(entry.valueUsd))
    setValuationDate(entry.date)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!asset) return

    const primaryAlloc = allocations[0]
    const selectedBienDeUso = mockBienesDeUso.find((b) => b.id === form.fixedAssetCode)
    assetRepository.update(asset.id, {
      name: form.name.trim(),
      internalCode: asset.internalCode,
      fixedAssetCode: selectedBienDeUso?.code ?? asset.fixedAssetCode,
      status: form.status as AssetStatus,
      assetType: form.assetType.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: form.year ? parseInt(form.year, 10) : 0,
      serialNumber: form.serialNumber.trim(),
      chassisNumber: form.chassisNumber.trim() || undefined,
      patrimonialValueUsd: patrimonialValueUsd ? parseFloat(patrimonialValueUsd) : 0,
      valuationDate,
      valueHistory,
      companyId: primaryAlloc?.companyId ?? '',
      costCenterId: primaryAlloc?.costCenterId ?? '',
      allocations,
      productiveUnit: form.productiveUnit,
      area: form.area,
      observations: form.observations.trim(),
      mapsUrl: form.mapsUrl || undefined,
      coordinates: form.mapsUrl ? parseGoogleMapsUrl(form.mapsUrl) ?? undefined : undefined,
      silos: silos.length > 0 ? silos : undefined,
    })

    navigate(`/assets/${asset.id}`)
  }

  return (
    <PageContent>
      <form onSubmit={handleSubmit} noValidate>
        <PageHeader
          title="Editar activo"
          subtitle={`${asset.internalCode} · ${asset.name}`}
          backTo={`/assets/${asset.id}`}
          backLabel="Volver al activo"
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/assets/${asset.id}`)}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
              >
                <X size={15} />
                Cancelar
              </button>
              <button
                type="submit"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Save size={15} />
                Guardar cambios
              </button>
            </div>
          }
        />

        <div className="max-w-5xl space-y-5">

          {/* 1. Identificación */}
          <SectionCard
            title="Identificación del activo"
            subtitle="Código del sistema (automático) y Bien de Uso vinculado desde Finnegans."
          >
            <FormSection title="">
              <FormField label="Código de activo (sistema)">
                <AutoCodeDisplay code={asset.internalCode} />
              </FormField>
              <FormField label="Bien de Uso (Finnegans)" fullWidth>
                <BienDeUsoField
                  value={form.fixedAssetCode}
                  onChange={(id) => setForm((p) => ({ ...p, fixedAssetCode: id }))}
                  categoryFilter={ASSET_TYPE_TO_FINNEGANS[asset.assetType]}
                />
              </FormField>
              <FormField label="Nombre del activo" required>
                <FormInput
                  placeholder="Ej: Toyota Hilux 4x4 Doble Cabina"
                  value={form.name}
                  onChange={set('name')}
                  required
                />
              </FormField>
              <FormField label="Estado" required>
                <FormSelect value={form.status} onChange={set('status')}>
                  {ASSET_STATUS_OPTIONS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label="Tipo de activo">
                <FormInput
                  placeholder="Ej: Camioneta, Tractor, Galpón…"
                  value={form.assetType}
                  onChange={set('assetType')}
                />
              </FormField>
            </FormSection>
          </SectionCard>

          {/* 2. Características técnicas */}
          <SectionCard
            title="Características técnicas"
            subtitle="Marca, modelo, año y números de identificación."
          >
            <FormSection title="">
              <FormField label="Marca">
                <FormInput placeholder="Ej: Toyota, John Deere…" value={form.brand} onChange={set('brand')} />
              </FormField>
              <FormField label="Modelo">
                <FormInput placeholder="Ej: Hilux SRX, 8R 340…" value={form.model} onChange={set('model')} />
              </FormField>
              <FormField label="Año de fabricación">
                <FormInput type="number" min={1950} max={2030} placeholder="Ej: 2022" value={form.year} onChange={set('year')} />
              </FormField>
              <FormField label="N° de serie">
                <FormInput placeholder="Ej: RW8320P024316" value={form.serialNumber} onChange={set('serialNumber')} />
              </FormField>
              {asset.chassisNumber !== undefined && (
                <FormField label="N° de chasis">
                  <FormInput placeholder="Ej: JTFHM923X00123456" value={form.chassisNumber} onChange={set('chassisNumber')} />
                </FormField>
              )}
            </FormSection>
          </SectionCard>

          {/* 3. Valuación patrimonial */}
          <SectionCard
            title="Valuación patrimonial"
            subtitle="Valor actual y registro histórico de valuaciones en USD."
          >
            <div className="space-y-5">
              <FormSection title="">
                <FormField label="Valor patrimonial actual (USD)" required>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Ej: 32000"
                      className="pl-7"
                      value={patrimonialValueUsd}
                      onChange={(e) => setPatrimonialValueUsd(e.target.value)}
                      required
                    />
                  </div>
                </FormField>
                <FormField label="Fecha de valuación">
                  <FormInput
                    type="date"
                    value={valuationDate}
                    onChange={(e) => setValuationDate(e.target.value)}
                  />
                </FormField>
              </FormSection>
              <div className="border-t border-slate-100 pt-4">
                <ValueHistorySection
                  history={valueHistory}
                  currentValue={patrimonialValueUsd}
                  onAdd={handleAddValueEntry}
                />
              </div>
            </div>
          </SectionCard>

          {/* 4. Imputación contable */}
          <SectionCard
            title="Imputación contable"
            subtitle="Empresas, centros de costo y área de imputación."
          >
            <div className="space-y-5">
              <AllocationEditor allocations={allocations} onChange={setAllocations} />
              <div className="border-t border-slate-100 pt-4">
                <FormSection title="">
                  <FormField label="Unidad productiva">
                    <FormSelect value={form.productiveUnit} onChange={set('productiveUnit')}>
                      <option value="">Seleccionar…</option>
                      {PRODUCTIVE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Área">
                    <FormSelect value={form.area} onChange={set('area')}>
                      <option value="">Seleccionar…</option>
                      {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </FormSelect>
                  </FormField>
                </FormSection>
              </div>
            </div>
          </SectionCard>

          {/* 5. Ubicación y silos */}
          <SectionCard
            title="Ubicación y silos"
            subtitle="Mapa del activo y registro de silos o celdas de almacenamiento."
          >
            <div className="space-y-5">
              <MapSection mapsUrl={form.mapsUrl} onChange={(v) => setForm((p) => ({ ...p, mapsUrl: v }))} />
              <div className="border-t border-slate-100 pt-5">
                <SilosSection silos={silos} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
              </div>
            </div>
          </SectionCard>

          {/* 6. Observaciones y documentación */}
          <SectionCard
            title="Observaciones y documentación"
            subtitle="Notas internas y documentos asociados al activo (vencimientos, seguros, habilitaciones)."
          >
            <div className="space-y-5">
              <FormSection title="">
                <FormField label="Observaciones" fullWidth>
                  <FormTextarea
                    rows={3}
                    placeholder="Estado actual, historial de mantenimiento, notas relevantes…"
                    value={form.observations}
                    onChange={set('observations')}
                  />
                </FormField>
              </FormSection>
              <div className="border-t border-slate-100 pt-4">
                <AttachmentListEditor attachments={attachments} onChange={setAttachments} />
              </div>
            </div>
          </SectionCard>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-6">
            <button
              type="button"
              onClick={() => navigate(`/assets/${asset.id}`)}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <X size={15} />
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
            >
              <Save size={15} />
              Guardar cambios
            </button>
          </div>

        </div>
      </form>
    </PageContent>
  )
}
