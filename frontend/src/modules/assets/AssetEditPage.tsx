import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, X, MapPin, Hash, Info, Tag } from 'lucide-react'
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
import { ASSET_STATUS_LABELS, PROVINCES } from '../../shared/constants'
import { ASSET_TYPE_TO_FINNEGANS, LABEL_TO_CATEGORY } from '../../shared/constants/asset-categories'
import { parseGoogleMapsUrl } from '../../shared/utils/maps'
import { BienDeUsoField } from './components/BienDeUsoField'
import { AllocationEditor } from './components/AllocationEditor'
import { SilosSection } from './components/SilosSection'
import { ValueHistorySection } from './components/ValueHistorySection'
import type {
  AssetStatus, AssetAllocation, AssetValueEntry, AssetAttachment, AssetCategory, Silo,
} from '../../shared/types'

// ── Form type ──────────────────────────────────────────────────────────────────

type FormErrors = Partial<Record<string, string>>

type EditForm = {
  fixedAssetCode: string
  name: string
  status: string
  assetType: string
  // Shared technical
  brand: string; model: string; year: string; serialNumber: string; chassisNumber: string
  // Vehicle-specific
  plate: string; engineNumber: string; color: string; fuelType: string
  // Agro machinery
  powerHp: string; cutWidth: string; tankCapacity: string; workWidth: string; implementType: string
  // Building
  surfaceM2: string; address: string; constructionType: string
  floors: string; constructionYear: string; buildingPurpose: string
  // Farm / property
  surfaceHa: string; locality: string; province: string
  // Infrastructure
  infraType: string; infraCapacityTons: string; infraContent: string; technicalSpec: string
  // Common
  productiveUnit: string; area: string; observations: string; mapsUrl: string
}

const EMPTY_FORM: EditForm = {
  fixedAssetCode: '', name: '', status: 'activo', assetType: '',
  brand: '', model: '', year: '', serialNumber: '', chassisNumber: '',
  plate: '', engineNumber: '', color: '', fuelType: '',
  powerHp: '', cutWidth: '', tankCapacity: '', workWidth: '', implementType: '',
  surfaceM2: '', address: '', constructionType: '', floors: '', constructionYear: '', buildingPurpose: '',
  surfaceHa: '', locality: '', province: '',
  infraType: '', infraCapacityTons: '', infraContent: '', technicalSpec: '',
  productiveUnit: '', area: '', observations: '', mapsUrl: '',
}

const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][]

// ── Read-only code badge ───────────────────────────────────────────────────────

function AutoCodeDisplay({ code }: { code: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
      <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center flex-shrink-0">
        <Hash size={14} className="text-slate-500" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold font-mono text-slate-800 tracking-wider">{code}</p>
        <p className="text-xs text-slate-400 mt-0.5">Código interno del sistema</p>
      </div>
      <span className="ml-auto flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
        Auto
      </span>
    </div>
  )
}

function AssetTypeBadge({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-slate-50">
      <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
        <Tag size={14} className="text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-700">{label || '—'}</p>
      <span className="ml-auto flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
        Fijo
      </span>
    </div>
  )
}

// ── Map section ────────────────────────────────────────────────────────────────

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
          <MapPin size={11} /> No se pudo extraer coordenadas de esta URL.
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
              <MapPin size={10} /> Ver en Google Maps
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

  const { data: existingAttachments = [] } = useQuery({
    queryKey: ['assets', id, 'attachments'],
    queryFn: () => assetsApi.findAttachments(id!),
    enabled: !!id,
  })

  const [form, setForm] = useState<EditForm>(EMPTY_FORM)
  const [patrimonialValueUsd, setPatrimonialValueUsd] = useState('')
  const [patrimonialValueNew, setPatrimonialValueNew] = useState('')
  const [valuationDate, setValuationDate] = useState('')
  const [dischargeDate, setDischargeDate] = useState('')
  const [saleDate, setSaleDate] = useState('')
  const [allocations, setAllocations] = useState<AssetAllocation[]>([
    { id: 'alloc-init', companyId: '', costCenterId: '', percentage: 100 },
  ])
  const [valueHistory, setValueHistory] = useState<AssetValueEntry[]>([])
  const [silos, setSilos] = useState<Silo[]>([])
  const [attachments, setAttachments] = useState<AssetAttachment[]>([])
  const [errors, setErrors] = useState<FormErrors>({})

  // Catalog queries
  const { data: fuelTypes = [] } = useQuery({ queryKey: ['catalogs', 'asset_fuel_type'], queryFn: () => catalogsApi.findByCategory('asset_fuel_type') })
  const { data: buildingPurposes = [] } = useQuery({ queryKey: ['catalogs', 'asset_building_purpose'], queryFn: () => catalogsApi.findByCategory('asset_building_purpose') })
  const { data: infrastructureTypes = [] } = useQuery({ queryKey: ['catalogs', 'asset_infrastructure_type'], queryFn: () => catalogsApi.findByCategory('asset_infrastructure_type') })
  const { data: implementTypes = [] } = useQuery({ queryKey: ['catalogs', 'asset_implement_type'], queryFn: () => catalogsApi.findByCategory('asset_implement_type') })
  const { data: cargoSpecies = [] } = useQuery({ queryKey: ['catalogs', 'asset_cargo_species'], queryFn: () => catalogsApi.findByCategory('asset_cargo_species') })
  const { data: siloContents = [] } = useQuery({ queryKey: ['catalogs', 'asset_silo_content'], queryFn: () => catalogsApi.findByCategory('asset_silo_content') })
  const { data: productiveUnits = [] } = useQuery({ queryKey: ['catalogs', 'asset_productive_unit'], queryFn: () => catalogsApi.findByCategory('asset_productive_unit') })
  const { data: areas = [] } = useQuery({ queryKey: ['catalogs', 'asset_area'], queryFn: () => catalogsApi.findByCategory('asset_area') })

  useEffect(() => {
    if (!asset) return
    const meta = (asset.metadata ?? {}) as Record<string, unknown>
    const str = (v: unknown) => (v !== undefined && v !== null ? String(v) : '')
    setForm({
      ...EMPTY_FORM,
      fixedAssetCode: asset.fixedAssetCode ?? '',
      name: asset.name,
      status: asset.status,
      assetType: asset.assetType,
      brand: asset.brand,
      model: asset.model,
      year: asset.year > 0 ? String(asset.year) : '',
      serialNumber: asset.serialNumber,
      chassisNumber: asset.chassisNumber || str(meta.chassisNumber),
      // Vehicle
      plate: str(meta.plate),
      engineNumber: str(meta.engineNumber),
      color: str(meta.color),
      fuelType: str(meta.fuelType),
      // Agro machinery
      powerHp: str(meta.powerHp),
      cutWidth: str(meta.cutWidth),
      tankCapacity: str(meta.tankCapacity),
      workWidth: str(meta.workWidth),
      // Implemento
      implementType: str(meta.implementType),
      // Edificio
      surfaceM2: str(meta.surfaceM2),
      buildingPurpose: str(meta.buildingPurpose),
      constructionType: str(meta.constructionType),
      floors: str(meta.floors),
      constructionYear: str(meta.constructionYear),
      address: str(meta.address),
      // Establecimiento
      surfaceHa: str(meta.surfaceHa),
      province: str(meta.province),
      locality: str(meta.locality),
      // Infraestructura
      infraType: str(meta.infraType),
      infraCapacityTons: str(meta.infraCapacityTons),
      infraContent: str(meta.infraContent),
      technicalSpec: str(meta.technicalSpec),
      // Common
      mapsUrl: asset.mapsUrl || str(meta.mapsUrl),
      productiveUnit: asset.productiveUnit ?? '',
      area: asset.area ?? '',
      observations: asset.observations,
    })
    setPatrimonialValueUsd(asset.patrimonialValueUsd > 0 ? String(asset.patrimonialValueUsd) : '')
    setPatrimonialValueNew(asset.patrimonialValueNew != null ? String(asset.patrimonialValueNew) : '')
    setValuationDate(asset.valuationDate ?? '')
    setDischargeDate(asset.dischargeDate ?? '')
    setSaleDate(asset.saleDate ?? '')
    if (asset.allocations && asset.allocations.length > 0) {
      setAllocations(asset.allocations)
    } else {
      setAllocations([{ id: 'alloc-init', companyId: asset.companyId, costCenterId: asset.costCenterId, percentage: 100 }])
    }
    setValueHistory(asset.valueHistory ?? [])
    setSilos(asset.silos ?? [])
  }, [asset])

  useEffect(() => {
    if (existingAttachments.length > 0) {
      setAttachments(existingAttachments)
    }
  }, [existingAttachments])

  // ── Derived category from stored assetType ────────────────────────────────
  const assetCategory: AssetCategory | undefined = LABEL_TO_CATEGORY[form.assetType]
  const isWheeled = ['vehiculo', 'camioneta', 'camion', 'moto'].includes(assetCategory ?? '')
  const isAgroMachine = ['tractor', 'cosechadora', 'pulverizadora'].includes(assetCategory ?? '')
  const isImplemento = assetCategory === 'implemento'
  const isEdificio = assetCategory === 'edificio'
  const isEstablecimiento = assetCategory === 'establecimiento'
  const isInfraestructura = assetCategory === 'infraestructura'
  const isCarga = assetCategory === 'carga'
  const isEquipoMaq = ['equipo', 'maquinaria'].includes(assetCategory ?? '')
  const isSiloInfra = isInfraestructura && form.infraType === 'Silo'

  // ── Early returns ──────────────────────────────────────────────────────────

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

  // ── Helpers ────────────────────────────────────────────────────────────────

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
  }

  function buildMetadata(): Record<string, unknown> {
    const opt = (v: string) => v.trim() || undefined
    const num = (v: string) => v ? parseFloat(v) : undefined
    const int = (v: string) => v ? parseInt(v, 10) : undefined

    if (isWheeled) {
      return {
        ...(opt(form.chassisNumber) && { chassisNumber: form.chassisNumber.trim() }),
        ...(opt(form.plate) && { plate: form.plate.trim() }),
        ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
        ...(opt(form.color) && { color: form.color.trim() }),
        ...(opt(form.fuelType) && { fuelType: form.fuelType }),
      }
    }
    if (isAgroMachine) {
      return {
        ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
        ...(num(form.powerHp) !== undefined && { powerHp: num(form.powerHp) }),
        ...(num(form.cutWidth) !== undefined && { cutWidth: num(form.cutWidth) }),
        ...(num(form.tankCapacity) !== undefined && { tankCapacity: num(form.tankCapacity) }),
        ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
      }
    }
    if (isImplemento) {
      return {
        ...(opt(form.implementType) && { implementType: form.implementType }),
        ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
      }
    }
    if (isEdificio) {
      return {
        ...(num(form.surfaceM2) !== undefined && { surfaceM2: num(form.surfaceM2) }),
        ...(opt(form.buildingPurpose) && { buildingPurpose: form.buildingPurpose }),
        ...(opt(form.constructionType) && { constructionType: form.constructionType.trim() }),
        ...(int(form.floors) !== undefined && { floors: int(form.floors) }),
        ...(int(form.constructionYear) !== undefined && { constructionYear: int(form.constructionYear) }),
        ...(opt(form.address) && { address: form.address.trim() }),
      }
    }
    if (isEstablecimiento) {
      return {
        ...(num(form.surfaceHa) !== undefined && { surfaceHa: num(form.surfaceHa) }),
        ...(opt(form.province) && { province: form.province }),
        ...(opt(form.locality) && { locality: form.locality.trim() }),
        ...(opt(form.address) && { address: form.address.trim() }),
        ...(silos.length > 0 && {
          silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
        }),
      }
    }
    if (isInfraestructura) {
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
    if (isEquipoMaq) {
      return {
        ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
      }
    }
    return {}
  }

  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!asset) return
    if (!validate()) return

    setSubmitting(true)
    try {
      const metadata = buildMetadata()
      const validAllocations = allocations.filter((a) => a.companyId && a.costCenterId)
      const existingIds = new Set(existingAttachments.map((a) => a.id))
      const currentIds = new Set(attachments.filter((a) => !a.pendingFile).map((a) => a.id))
      const toDelete = [...existingIds].filter((eid) => !currentIds.has(eid))
      const toUpload = attachments.filter((a) => a.pendingFile)
      const newHistoryEntries = valueHistory.filter((e) => e.id.startsWith('vh-'))

      // Update asset + allocations + delete attachments + history entries — all in parallel
      await Promise.all([
        assetsApi.update(asset.id, {
          name: form.name.trim(),
          assetType: form.assetType.trim(),
          status: form.status,
          fixedAssetCode: form.fixedAssetCode?.trim() || undefined,
          brand: form.brand.trim() || undefined,
          model: form.model.trim() || undefined,
          year: form.year ? parseInt(form.year, 10) : undefined,
          serialNumber: form.serialNumber.trim() || undefined,
          purchaseDate: valuationDate || undefined,
          dischargeDate: dischargeDate || null,
          saleDate: saleDate || null,
          currentValue: patrimonialValueUsd ? parseFloat(patrimonialValueUsd) : undefined,
          patrimonialValueNew: patrimonialValueNew ? parseFloat(patrimonialValueNew) : undefined,
          mapsUrl: form.mapsUrl.trim() || undefined,
          productiveUnit: form.productiveUnit || undefined,
          area: form.area || undefined,
          description: form.observations.trim() || undefined,
          metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        }),
        validAllocations.length > 0
          ? assetsApi.replaceAllocations(
              asset.id,
              validAllocations.map(({ companyId, costCenterId, percentage }) => ({ companyId, costCenterId, percentage })),
            )
          : Promise.resolve(),
        ...toDelete.map((attId) => assetsApi.deleteAttachment(asset.id, attId)),
        ...newHistoryEntries.map((entry) =>
          assetsApi.addValueHistory(asset.id, {
            value: entry.valueUsd,
            date: entry.date,
            type: entry.type,
            note: entry.notes || undefined,
          }),
        ),
      ])

      // Uploads are sequential (multipart, can't parallelize safely)
      for (const att of toUpload) {
        if (att.pendingFile) {
          await assetsApi.addAttachment(asset.id, {
            file: att.pendingFile,
            description: att.description || undefined,
            expirationDate: att.expirationDate ?? undefined,
            notifyEmail: att.notifyEmail,
          })
        }
      }

      toast.success('Activo actualizado correctamente')
      navigate(`/assets/${asset.id}`)
      void queryClient.invalidateQueries({ queryKey: ['assets', id] })
      void queryClient.invalidateQueries({ queryKey: ['assets'] })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageContent>
      <form onSubmit={handleSubmit} noValidate>
        <PageHeader
          title="Editar activo"
          subtitle={`${asset.internalCode} · ${asset.name}`}
          backTo={`/assets/${asset.id}`}
          backLabel="Volver al activo"
        />

        <div className="max-w-5xl space-y-5">

          {/* 1. Identificación */}
          <SectionCard
            title="Identificación del activo"
            subtitle="Código interno (automático), tipo de activo y datos de identificación."
          >
            <FormSection title="">
              <FormField label="Código de activo (sistema)">
                <AutoCodeDisplay code={asset.internalCode} />
              </FormField>
              {isCarga ? (
                <FormField label="Bien de Uso (Finnegans)" fullWidth>
                  <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-lg border border-amber-200 bg-amber-50">
                    <Info size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-amber-800">
                      Este tipo de activo <strong>no requiere código de Bien de Uso de Finnegans</strong>.
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
              <FormField label="Tipo de activo">
                <AssetTypeBadge label={form.assetType} />
              </FormField>
              <FormField label="Nombre del activo" required error={errors.name as string | undefined}>
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
            </FormSection>
          </SectionCard>

          {/* 2. Type-specific sections */}

          {/* Vehicles */}
          {isWheeled && (
            <SectionCard title="Datos del vehículo" subtitle="Marca, modelo, año y datos técnicos del rodado.">
              <FormSection title="">
                <FormField label="Marca">
                  <FormInput placeholder="Ej: Toyota, Ford, Volkswagen…" value={form.brand} onChange={set('brand')} />
                </FormField>
                <FormField label="Modelo">
                  <FormInput placeholder="Ej: Hilux SRX, Ranger XLS…" value={form.model} onChange={set('model')} />
                </FormField>
                <FormField label="Año">
                  <FormInput type="number" min={1950} max={2030} placeholder="Ej: 2022" value={form.year} onChange={set('year')} />
                </FormField>
                <FormField label="N° de Chasis">
                  <FormInput placeholder="Ej: JTFHM923X00123456" value={form.chassisNumber} onChange={set('chassisNumber')} />
                </FormField>
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

          {/* Agro machinery */}
          {isAgroMachine && (
            <SectionCard title="Datos de la maquinaria" subtitle="Marca, modelo y especificaciones técnicas del equipo.">
              <FormSection title="">
                <FormField label="Marca">
                  <FormInput placeholder="Ej: John Deere, Case IH…" value={form.brand} onChange={set('brand')} />
                </FormField>
                <FormField label="Modelo">
                  <FormInput placeholder="Ej: 8R 340, Axial-Flow 250…" value={form.model} onChange={set('model')} />
                </FormField>
                <FormField label="Año">
                  <FormInput type="number" min={1950} max={2030} placeholder="Ej: 2021" value={form.year} onChange={set('year')} />
                </FormField>
                <FormField label="N° de Serie">
                  <FormInput placeholder="Ej: RW8320P024316" value={form.serialNumber} onChange={set('serialNumber')} />
                </FormField>
                <FormField label="N° de Motor">
                  <FormInput placeholder="Ej: CD6090-123456" value={form.engineNumber} onChange={set('engineNumber')} />
                </FormField>
                <FormField label="Potencia (HP)">
                  <FormInput type="number" min={0} placeholder="Ej: 340" value={form.powerHp} onChange={set('powerHp')} />
                </FormField>
                {assetCategory === 'cosechadora' && (
                  <FormField label="Ancho de corte (m)">
                    <FormInput type="number" min={0} step="0.1" placeholder="Ej: 9.2" value={form.cutWidth} onChange={set('cutWidth')} />
                  </FormField>
                )}
                {assetCategory === 'pulverizadora' && (
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
          {isImplemento && (
            <SectionCard title="Datos del implemento" subtitle="Tipo y especificaciones técnicas.">
              <FormSection title="">
                <FormField label="Marca">
                  <FormInput placeholder="Ej: Agrometal, Apache…" value={form.brand} onChange={set('brand')} />
                </FormField>
                <FormField label="Modelo">
                  <FormInput placeholder="Ej: MX 33/52" value={form.model} onChange={set('model')} />
                </FormField>
                <FormField label="Año">
                  <FormInput type="number" min={1950} max={2030} placeholder="Ej: 2019" value={form.year} onChange={set('year')} />
                </FormField>
                <FormField label="N° de Serie">
                  <FormInput placeholder="Ej: RW8320P024316" value={form.serialNumber} onChange={set('serialNumber')} />
                </FormField>
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

          {/* Edificio */}
          {isEdificio && (
            <SectionCard title="Datos del edificio" subtitle="Características físicas y constructivas.">
              <FormSection title="">
                <FormField label="Superficie (m²)">
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
            </SectionCard>
          )}

          {/* Establecimiento */}
          {isEstablecimiento && (
            <SectionCard title="Datos del establecimiento" subtitle="Campo o predio con sus características principales.">
              <FormSection title="">
                <FormField label="Superficie total (ha)">
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
            </SectionCard>
          )}

          {/* Infraestructura */}
          {isInfraestructura && (
            <SectionCard title="Especificaciones de infraestructura" subtitle="Tipo y características técnicas.">
              <FormSection title="">
                <FormField label="Tipo de infraestructura">
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
                    <FormTextarea rows={3} placeholder="Describí las características del activo…" value={form.technicalSpec} onChange={set('technicalSpec')} />
                  </FormField>
                )}
              </FormSection>
            </SectionCard>
          )}

          {/* Equipo / Maquinaria genérica */}
          {isEquipoMaq && (
            <SectionCard title="Especificaciones técnicas" subtitle="Características y uso del activo.">
              <FormSection title="">
                <FormField label="Marca">
                  <FormInput placeholder="Ej: Siemens, Grundfos…" value={form.brand} onChange={set('brand')} />
                </FormField>
                <FormField label="Modelo">
                  <FormInput placeholder="Ej: SKS-500, TP 100…" value={form.model} onChange={set('model')} />
                </FormField>
                <FormField label="N° de Serie">
                  <FormInput placeholder="Ej: SN-2023-00456" value={form.serialNumber} onChange={set('serialNumber')} />
                </FormField>
                <FormField label="Especificaciones" fullWidth>
                  <FormTextarea rows={3} placeholder="Ej: Equipo de bombeo 50HP, marca X, modelo Y…" value={form.technicalSpec} onChange={set('technicalSpec')} />
                </FormField>
              </FormSection>
            </SectionCard>
          )}

          {/* Carga animal */}
          {isCarga && (
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

          {/* 3. Valuación patrimonial */}
          <SectionCard
            title="Valuación patrimonial"
            subtitle="Valor actual y registro histórico de valuaciones en USD."
          >
            <div className="space-y-5">
              <FormSection title="">
                <FormField label="Valor Patrimonial Real (USD)" required error={errors.patrimonialValueUsd as string | undefined}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput
                      type="number" min={0} step="0.01" placeholder="Ej: 32000"
                      className="pl-7"
                      value={patrimonialValueUsd}
                      onChange={(e) => { setPatrimonialValueUsd(e.target.value); setErrors((p) => ({ ...p, patrimonialValueUsd: undefined })) }}
                    />
                  </div>
                </FormField>
                <FormField label="Valor Patrimonial a Nuevo (USD)">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">$</span>
                    <FormInput
                      type="number" min={0} step="0.01" placeholder="Ej: 45000"
                      className="pl-7"
                      value={patrimonialValueNew}
                      onChange={(e) => setPatrimonialValueNew(e.target.value)}
                    />
                  </div>
                </FormField>
                <FormField label="Fecha de valuación">
                  <FormInput type="date" value={valuationDate} onChange={(e) => setValuationDate(e.target.value)} />
                </FormField>
                {form.status === 'baja' && (
                  <FormField label="Fecha de baja">
                    <FormInput type="date" value={dischargeDate} onChange={(e) => setDischargeDate(e.target.value)} />
                  </FormField>
                )}
                {form.status === 'vendido' && (
                  <FormField label="Fecha de venta">
                    <FormInput type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
                  </FormField>
                )}
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
            subtitle="Empresa, centro de costo y porcentaje de imputación."
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

          {/* 5. Ubicación y silos — solo para tipos con ubicación geográfica */}
          {(isEdificio || isEstablecimiento || isInfraestructura) && (
            <SectionCard
              title="Ubicación y silos"
              subtitle="Mapa del activo y registro de silos o celdas de almacenamiento."
            >
              <div className="space-y-5">
                <MapSection mapsUrl={form.mapsUrl} onChange={(v) => setForm((p) => ({ ...p, mapsUrl: v }))} />
                {(isEstablecimiento || isSiloInfra) && (
                  <div className="border-t border-slate-100 pt-5">
                    <SilosSection silos={silos} siloContents={siloContents} onAdd={addSilo} onRemove={removeSilo} onChange={updateSilo} />
                  </div>
                )}
              </div>
            </SectionCard>
          )}

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
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 rounded-lg transition-colors"
            >
              <X size={15} /> Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors font-medium"
            >
              <Save size={15} /> {submitting ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>

        </div>
      </form>
    </PageContent>
  )
}
