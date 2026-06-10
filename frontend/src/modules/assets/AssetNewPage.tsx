import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Save, X } from 'lucide-react'
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
import { FileDropzone } from '../../shared/components/file-upload/FileDropzone'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import {
  ASSET_TYPES,
  ASSET_STATUS_LABELS,
  PRODUCTIVE_UNITS,
  AREAS,
} from '../../shared/constants'

interface AssetFormState {
  internalCode: string
  name: string
  assetType: string
  brand: string
  model: string
  year: string
  serialNumber: string
  status: string
  patrimonialValueUsd: string
  valuationDate: string
  companyId: string
  costCenterId: string
  fixedAssetCode: string
  productiveUnit: string
  area: string
  observations: string
}

const INITIAL_STATE: AssetFormState = {
  internalCode: '',
  name: '',
  assetType: '',
  brand: '',
  model: '',
  year: '',
  serialNumber: '',
  status: '',
  patrimonialValueUsd: '',
  valuationDate: '',
  companyId: '',
  costCenterId: '',
  fixedAssetCode: '',
  productiveUnit: '',
  area: '',
  observations: '',
}

export default function AssetNewPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<AssetFormState>(INITIAL_STATE)

  const filteredCostCenters = form.companyId
    ? mockCostCenters.filter((cc) => cc.companyId === form.companyId)
    : []

  function set(field: keyof AssetFormState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
    ) => {
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
    // TODO: wire to backend create endpoint
    navigate('/assets')
  }

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Activo"
        subtitle="Registrá un nuevo bien en el inventario patrimonial."
        backTo="/assets"
        backLabel="Volver al inventario"
      />

      <form onSubmit={handleSubmit} noValidate className="max-w-5xl space-y-5">

        {/* 1 — Datos Generales */}
        <SectionCard
          title="Datos Generales"
          subtitle="Identificación y características físicas del activo."
        >
          <FormSection title="">
            <FormField label="Código Interno" required>
              <FormInput
                placeholder="Ej. ACT-0042"
                value={form.internalCode}
                onChange={set('internalCode')}
              />
            </FormField>

            <FormField label="Nombre / Descripción" required>
              <FormInput
                placeholder="Ej. Tractor John Deere 6120"
                value={form.name}
                onChange={set('name')}
              />
            </FormField>

            <FormField label="Tipo de Activo" required>
              <FormSelect value={form.assetType} onChange={set('assetType')}>
                <option value="">Seleccionar tipo…</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Marca">
              <FormInput
                placeholder="Ej. John Deere"
                value={form.brand}
                onChange={set('brand')}
              />
            </FormField>

            <FormField label="Modelo">
              <FormInput
                placeholder="Ej. 6120"
                value={form.model}
                onChange={set('model')}
              />
            </FormField>

            <FormField label="Año">
              <FormInput
                type="number"
                placeholder="Ej. 2021"
                min={1950}
                max={2030}
                value={form.year}
                onChange={set('year')}
              />
            </FormField>

            <FormField label="Número de Serie / Chasis">
              <FormInput
                placeholder="Ej. 1GC1KWEY5HF123456"
                value={form.serialNumber}
                onChange={set('serialNumber')}
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 2 — Estado y Valorización */}
        <SectionCard
          title="Estado y Valorización"
          subtitle="Estado operativo y valor patrimonial del activo."
        >
          <FormSection title="">
            <FormField label="Estado" required>
              <FormSelect value={form.status} onChange={set('status')}>
                <option value="">Seleccionar estado…</option>
                {Object.entries(ASSET_STATUS_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Valor Patrimonial (USD)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">
                  $
                </span>
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
              <FormInput
                type="date"
                value={form.valuationDate}
                onChange={set('valuationDate')}
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 3 — Imputación Contable */}
        <SectionCard
          title="Imputación Contable"
          subtitle="Asignación a empresa, centro de costo y unidad productiva."
        >
          <FormSection title="">
            <FormField label="Empresa" required>
              <FormSelect value={form.companyId} onChange={set('companyId')}>
                <option value="">Seleccionar empresa…</option>
                {mockCompanies
                  .filter((c) => c.status === 'activo')
                  .map((c) => (
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
                  {form.companyId
                    ? 'Seleccionar centro de costo…'
                    : 'Primero seleccioná una empresa'}
                </option>
                {filteredCostCenters.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.code} — {cc.name}
                  </option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Código de Bien de Uso">
              <FormInput
                placeholder="Ej. BU-00123"
                value={form.fixedAssetCode}
                onChange={set('fixedAssetCode')}
              />
            </FormField>

            <FormField label="Unidad Productiva">
              <FormSelect value={form.productiveUnit} onChange={set('productiveUnit')}>
                <option value="">Seleccionar unidad…</option>
                {PRODUCTIVE_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </FormSelect>
            </FormField>

            <FormField label="Área">
              <FormSelect value={form.area} onChange={set('area')}>
                <option value="">Seleccionar área…</option>
                {AREAS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </FormSelect>
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 4 — Documentación */}
        <SectionCard
          title="Documentación"
          subtitle="Observaciones generales y archivos adjuntos del activo."
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

            <FileDropzone
              label="Adjuntar documentación (PDF, imágenes, certificados)"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
              maxFiles={8}
            />
          </div>
        </SectionCard>

        {/* Footer actions */}
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

      </form>
    </PageContent>
  )
}
