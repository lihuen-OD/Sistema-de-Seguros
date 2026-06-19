import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Save, X, MapPin, Hash, Info,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection, FormField, FormInput, FormSelect, FormTextarea,
} from '../../shared/components/forms/FormSection'
import { AttachmentListEditor } from '../../shared/components/file-upload/AttachmentListEditor'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { assetsApi } from '../../shared/api/assets.api'
import { catalogsApi } from '../../shared/api/catalogs.api'
import { ASSET_STATUS_LABELS } from '../../shared/constants'
import { ASSET_TYPE_TO_FINNEGANS } from '../../shared/constants/asset-categories'
import { parseGoogleMapsUrl } from '../../shared/utils/maps'
import { BienDeUsoField } from './components/BienDeUsoField'
import { AllocationEditor } from './components/AllocationEditor'
import { SilosSection } from './components/SilosSection'
import { ValueHistorySection } from './components/ValueHistorySection'
import type { AssetStatus, AssetAllocation, AssetValueEntry, AssetAttachment, Silo } from '../../shared/types'

// ── Types ──────────────────────────────────────────────────────────────────────

type FormErrors = Partial<Record<keyof EditForm | 'patrimonialValueUsd', string>>

type EditForm = {
  fixedAssetCode: string
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

const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][]

// ── Read-only internal code badge ─────────────────────────────────────────────

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

// ── Map section (edit-page variant: card-like with coords bar) ─────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

export default function AssetEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: asset, isLoading, isError } = useQuery({
    queryKey: ['assets', id],
    queryFn: () => assetsApi.findById(id!),
    enabled: !!id,
  })

  const [form, setForm] = useState<EditForm>({
    fixedAssetCode: '', name: '', status: 'activo', assetType: '',
    brand: '', model: '', year: '', serialNumber: '', chassisNumber: '',
    productiveUnit: '', area: '', observations: '', mapsUrl: '',
  })

  const [patrimonialValueUsd, setPatrimonialValueUsd] = useState('')
  const [valuationDate, setValuationDate] = useState('')
  const [allocations, setAllocations] = useState<AssetAllocation[]>([
    { id: 'alloc-init', companyId: '', costCenterId: '', percentage: 100 },
  ])
  const [valueHistory, setValueHistory] = useState<AssetValueEntry[]>([])
  const [silos, setSilos] = useState<Silo[]>([])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])
  const [errors, setErrors] = useState<FormErrors>({})

  const { data: cargoSpecies = [] } = useQuery({ queryKey: ['catalogs', 'asset_cargo_species'], queryFn: () => catalogsApi.findByCategory('asset_cargo_species') })
  const { data: productiveUnits = [] } = useQuery({ queryKey: ['catalogs', 'asset_productive_unit'], queryFn: () => catalogsApi.findByCategory('asset_productive_unit') })
  const { data: areas = [] } = useQuery({ queryKey: ['catalogs', 'asset_area'], queryFn: () => catalogsApi.findByCategory('asset_area') })
  const { data: siloContents = [] } = useQuery({ queryKey: ['catalogs', 'asset_silo_content'], queryFn: () => catalogsApi.findByCategory('asset_silo_content') })

  useEffect(() => {
    if (!asset) return
    setForm({
      fixedAssetCode: '',
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
    })
    setPatrimonialValueUsd(asset.patrimonialValueUsd > 0 ? String(asset.patrimonialValueUsd) : '')
    setValuationDate(asset.valuationDate ?? '')
    if (asset.allocations && asset.allocations.length > 0) {
      setAllocations(asset.allocations)
    } else {
      setAllocations([{ id: 'alloc-init', companyId: asset.companyId, costCenterId: asset.costCenterId, percentage: 100 }])
    }
    setValueHistory(asset.valueHistory ?? [])
    setSilos(asset.silos ?? [])
  }, [asset])

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Cargando activo…</div>
      </PageContent>
    )
  }

  if (isError || !asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  function set(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }))
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function validate(): boolean {
    const e: FormErrors = {}
    if (!form.name.trim()) e.name = 'El nombre del activo es obligatorio.'
    if (!patrimonialValueUsd || parseFloat(patrimonialValueUsd) < 0)
      e.patrimonialValueUsd = 'Ingresá un valor patrimonial válido.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function addSilo() {
    setSilos((prev) => [...prev, { id: `silo-${Date.now()}`, name: '', capacityTons: 0, content: '' }])
  }
  function removeSilo(sid: string) { setSilos((prev) => prev.filter((s) => s.id !== sid)) }
  function updateSilo(sid: string, field: keyof Omit<Silo, 'id'>, value: string | number) {
    setSilos((prev) => prev.map((s) => s.id === sid ? { ...s, [field]: value } : s))
  }

  function handleAddValueEntry(entry: Omit<AssetValueEntry, 'id'>) {
    const newEntry: AssetValueEntry = { id: `vh-${Date.now()}`, ...entry }
    setValueHistory((prev) => [...prev, newEntry])
    setPatrimonialValueUsd(String(entry.valueUsd))
    setValuationDate(entry.date)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!asset) return
    if (!validate()) return

    await assetsApi.update(asset.id, {
      name: form.name.trim(),
      assetType: form.assetType.trim(),
      brand: form.brand.trim() || undefined,
      model: form.model.trim() || undefined,
      serialNumber: form.serialNumber.trim() || undefined,
      purchaseDate: valuationDate || undefined,
      currentValue: patrimonialValueUsd ? parseFloat(patrimonialValueUsd) : undefined,
      description: form.observations.trim() || undefined,
    })

    await queryClient.invalidateQueries({ queryKey: ['assets', id] })
    await queryClient.invalidateQueries({ queryKey: ['assets'] })
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
              {asset.assetType === 'Carga' ? (
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
                    value={form.fixedAssetCode}
                    onChange={(id) => setForm((p) => ({ ...p, fixedAssetCode: id }))}
                    categoryFilter={ASSET_TYPE_TO_FINNEGANS[asset.assetType]}
                  />
                </FormField>
              )}
              <FormField label="Nombre del activo" required error={errors.name}>
                <FormInput
                  placeholder="Ej: Toyota Hilux 4x4 Doble Cabina"
                  value={form.name}
                  onChange={set('name')}
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
            title={asset.assetType === 'Carga' ? 'Datos de la Carga' : 'Características técnicas'}
            subtitle={asset.assetType === 'Carga' ? 'Especie, categoría y números de identificación.' : 'Marca, modelo, año y números de identificación.'}
          >
            <FormSection title="">
              <FormField label={asset.assetType === 'Carga' ? 'Especie' : 'Marca'}>
                {asset.assetType === 'Carga' ? (
                  <FormSelect value={form.brand} onChange={set('brand')}>
                    <option value="">Seleccionar especie…</option>
                    {cargoSpecies.map((s) => <option key={s.id} value={s.label}>{s.label}</option>)}
                  </FormSelect>
                ) : (
                  <FormInput placeholder="Ej: Toyota, John Deere…" value={form.brand} onChange={set('brand')} />
                )}
              </FormField>
              <FormField label={asset.assetType === 'Carga' ? 'Categoría / Raza' : 'Modelo'}>
                <FormInput
                  placeholder={asset.assetType === 'Carga' ? 'Ej: Capón — Yorkshire, Novillo…' : 'Ej: Hilux SRX, 8R 340…'}
                  value={form.model}
                  onChange={set('model')}
                />
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
                <FormField label="Valor patrimonial actual (USD)" required error={errors.patrimonialValueUsd}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Ej: 32000"
                      className="pl-7"
                      value={patrimonialValueUsd}
                      onChange={(e) => { setPatrimonialValueUsd(e.target.value); setErrors((p) => ({ ...p, patrimonialValueUsd: undefined })) }}
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
                      {productiveUnits.map((u) => <option key={u.id} value={u.label}>{u.label}</option>)}
                    </FormSelect>
                  </FormField>
                  <FormField label="Área">
                    <FormSelect value={form.area} onChange={set('area')}>
                      <option value="">Seleccionar…</option>
                      {areas.map((a) => <option key={a.id} value={a.label}>{a.label}</option>)}
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
                <SilosSection silos={silos} siloContents={siloContents} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
              </div>
            </div>
          </SectionCard>

          {/* 6. Observaciones y documentación */}
          <SectionCard
            title="Observaciones y documentación"
            subtitle="Notas internas y documentos asociados al activo."
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
