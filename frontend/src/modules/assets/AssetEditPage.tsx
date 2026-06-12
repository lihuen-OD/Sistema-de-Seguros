import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Save, X } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import {
  FormSection, FormField, FormInput, FormSelect, FormTextarea,
} from '../../shared/components/forms/FormSection'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { assetRepository } from '../../services/repositories/asset.repository'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import { ASSET_STATUS_LABELS, PRODUCTIVE_UNITS, AREAS } from '../../shared/constants'
import type { AssetStatus } from '../../shared/types'

// ── Types ──────────────────────────────────────────────────────────────────────

type EditForm = {
  name: string
  internalCode: string
  status: string
  assetType: string
  brand: string
  model: string
  year: string
  serialNumber: string
  patrimonialValueUsd: string
  valuationDate: string
  fixedAssetCode: string
  companyId: string
  costCenterId: string
  productiveUnit: string
  area: string
  observations: string
}

const ASSET_STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS) as [AssetStatus, string][]

// ── Component ──────────────────────────────────────────────────────────────────

export default function AssetEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const asset = assetRepository.findById(id!)

  const [form, setForm] = useState<EditForm>(() => {
    if (!asset) return {
      name: '', internalCode: '', status: '', assetType: '', brand: '', model: '',
      year: '', serialNumber: '', patrimonialValueUsd: '', valuationDate: '',
      fixedAssetCode: '', companyId: '', costCenterId: '', productiveUnit: '', area: '', observations: '',
    }
    return {
      name: asset.name,
      internalCode: asset.internalCode,
      status: asset.status,
      assetType: asset.assetType,
      brand: asset.brand,
      model: asset.model,
      year: asset.year > 0 ? String(asset.year) : '',
      serialNumber: asset.serialNumber,
      patrimonialValueUsd: String(asset.patrimonialValueUsd),
      valuationDate: asset.valuationDate,
      fixedAssetCode: asset.fixedAssetCode,
      companyId: asset.companyId,
      costCenterId: asset.costCenterId,
      productiveUnit: asset.productiveUnit,
      area: asset.area,
      observations: asset.observations,
    }
  })

  if (!asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const filteredCostCenters = mockCostCenters.filter(
    (cc) => cc.status === 'activo' && (!form.companyId || cc.companyId === form.companyId),
  )

  function set(field: keyof EditForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const value = e.target.value
      setForm((prev) => {
        const next = { ...prev, [field]: value }
        if (field === 'companyId') next.costCenterId = ''
        return next
      })
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!asset) return

    assetRepository.update(asset.id, {
      name: form.name.trim(),
      internalCode: form.internalCode.trim(),
      status: form.status as AssetStatus,
      assetType: form.assetType.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      year: form.year ? parseInt(form.year, 10) : 0,
      serialNumber: form.serialNumber.trim(),
      patrimonialValueUsd: form.patrimonialValueUsd ? parseFloat(form.patrimonialValueUsd) : 0,
      valuationDate: form.valuationDate,
      fixedAssetCode: form.fixedAssetCode.trim(),
      companyId: form.companyId,
      costCenterId: form.costCenterId,
      productiveUnit: form.productiveUnit,
      area: form.area,
      observations: form.observations.trim(),
    })

    navigate(`/assets/${asset!.id}`)
  }

  return (
    <PageContent>
      <form onSubmit={handleSubmit}>
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

        <div className="space-y-5">

          {/* ── 1. Identificación ── */}
          <SectionCard
            title="Identificación del activo"
            subtitle="Nombre, código interno y estado operativo."
          >
            <FormSection title="">
              <FormField label="Nombre del activo" required>
                <FormInput
                  placeholder="Ej: Toyota Hilux 4x4 Doble Cabina"
                  value={form.name}
                  onChange={set('name')}
                  required
                />
              </FormField>
              <FormField label="Código interno" required>
                <FormInput
                  placeholder="Ej: VEH-001"
                  value={form.internalCode}
                  onChange={set('internalCode')}
                  required
                />
              </FormField>
              <FormField label="Estado">
                <FormSelect value={form.status} onChange={set('status')}>
                  <option value="">Seleccionar…</option>
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

          {/* ── 2. Características técnicas ── */}
          <SectionCard
            title="Características técnicas"
            subtitle="Marca, modelo, año y número de serie."
          >
            <FormSection title="">
              <FormField label="Marca">
                <FormInput
                  placeholder="Ej: Toyota, John Deere…"
                  value={form.brand}
                  onChange={set('brand')}
                />
              </FormField>
              <FormField label="Modelo">
                <FormInput
                  placeholder="Ej: Hilux SRX, 8R 340…"
                  value={form.model}
                  onChange={set('model')}
                />
              </FormField>
              <FormField label="Año de fabricación">
                <FormInput
                  type="number"
                  min={1950}
                  max={2030}
                  placeholder="Ej: 2022"
                  value={form.year}
                  onChange={set('year')}
                />
              </FormField>
              <FormField label="N° de serie / chasis">
                <FormInput
                  placeholder="Ej: JTFHM923X00123456"
                  value={form.serialNumber}
                  onChange={set('serialNumber')}
                />
              </FormField>
            </FormSection>
          </SectionCard>

          {/* ── 3. Valuación patrimonial ── */}
          <SectionCard
            title="Valuación patrimonial"
            subtitle="Valor contable asignado al activo."
          >
            <FormSection title="">
              <FormField label="Valor patrimonial (USD)" required>
                <FormInput
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Ej: 32000"
                  value={form.patrimonialValueUsd}
                  onChange={set('patrimonialValueUsd')}
                  required
                />
              </FormField>
              <FormField label="Fecha de valuación">
                <FormInput
                  type="date"
                  value={form.valuationDate}
                  onChange={set('valuationDate')}
                />
              </FormField>
              <FormField label="Código bien de uso">
                <FormInput
                  placeholder="Ej: BU-VEH-2022-001"
                  value={form.fixedAssetCode}
                  onChange={set('fixedAssetCode')}
                />
              </FormField>
            </FormSection>
          </SectionCard>

          {/* ── 4. Imputación contable ── */}
          <SectionCard
            title="Imputación contable"
            subtitle="Empresa, centro de costo y área."
          >
            <FormSection title="">
              <FormField label="Empresa">
                <FormSelect value={form.companyId} onChange={set('companyId')}>
                  <option value="">Seleccionar…</option>
                  {mockCompanies
                    .filter((c) => c.status === 'activo')
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </FormSelect>
              </FormField>
              <FormField label="Centro de costo">
                <FormSelect value={form.costCenterId} onChange={set('costCenterId')} disabled={!form.companyId}>
                  <option value="">Seleccionar…</option>
                  {filteredCostCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                  ))}
                </FormSelect>
              </FormField>
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
          </SectionCard>

          {/* ── 5. Observaciones ── */}
          <SectionCard
            title="Observaciones"
            subtitle="Anotaciones sobre el estado o historial del activo."
          >
            <FormSection title="">
              <FormField label="Observaciones" fullWidth>
                <FormTextarea
                  rows={4}
                  placeholder="Estado actual, historial de mantenimiento, notas relevantes…"
                  value={form.observations}
                  onChange={set('observations')}
                />
              </FormField>
            </FormSection>
          </SectionCard>

          {/* ── Footer actions ── */}
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
