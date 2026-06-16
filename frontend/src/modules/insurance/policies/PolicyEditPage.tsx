import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, X } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import {
  FormSection,
  FormField,
  FormInput,
  FormSelect,
  FormTextarea,
} from '../../../shared/components/forms/FormSection'
import { FileDropzone } from '../../../shared/components/file-upload/FileDropzone'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { mockCompanies } from '../../../data/mock-companies'
import { mockCostCenters } from '../../../data/mock-cost-centers'
import { mockProducers } from '../../../data/mock-producers'
import { mockAssets } from '../../../data/mock-assets'
import { policyRepository } from '../../../services/repositories/policy.repository'
import {
  INSURANCE_TYPES,
  COVERAGE_TYPES,
  INSURANCE_COMPANIES,
} from '../../../shared/constants'
import type { Policy } from '../../../shared/types'

type AssociationType = 'activo' | 'sin_activo'

interface PolicyForm {
  policyNumber: string
  insuranceCompany: string
  producerId: string
  insuranceType: string
  coverageType: string
  startDate: string
  endDate: string
  description: string
  association: AssociationType
  assetId: string
  companyId: string
  costCenterId: string
  insuredAmountArs: string
  exchangeRate: string
}

function policyToForm(p: Policy): PolicyForm {
  return {
    policyNumber: p.policyNumber,
    insuranceCompany: p.insuranceCompany,
    producerId: p.producerId,
    insuranceType: p.insuranceType,
    coverageType: p.coverageType,
    startDate: p.startDate,
    endDate: p.endDate,
    description: p.description,
    association: p.assetId ? 'activo' : 'sin_activo',
    assetId: p.assetId ?? '',
    companyId: p.companyId ?? '',
    costCenterId: p.costCenterId ?? '',
    insuredAmountArs: String(p.insuredAmountArs),
    exchangeRate: String(p.exchangeRate),
  }
}

export default function PolicyEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const policy = policyRepository.findById(id!)

  const [form, setForm] = useState<PolicyForm>(() =>
    policy ? policyToForm(policy) : {
      policyNumber: '', insuranceCompany: '', producerId: '', insuranceType: '',
      coverageType: '', startDate: '', endDate: '', description: '',
      association: 'activo', assetId: '', companyId: '', costCenterId: '',
      insuredAmountArs: '', exchangeRate: '',
    }
  )
  const [errors, setErrors] = useState<Partial<Record<keyof PolicyForm, string>>>({})

  if (!policy) {
    return (
      <PageContent>
        <EmptyState
          title="Póliza no encontrada"
          description="La póliza solicitada no existe o fue eliminada."
        />
      </PageContent>
    )
  }

  const set =
    (key: keyof PolicyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

  const setAssociation = (value: AssociationType) => {
    setForm((prev) => ({
      ...prev,
      association: value,
      assetId: '',
      companyId: '',
      costCenterId: '',
    }))
  }

  // Derived: insuredAmountUsd = ars / exchangeRate
  const insuredAmountUsd = useMemo(() => {
    const ars = parseFloat(form.insuredAmountArs)
    const rate = parseFloat(form.exchangeRate)
    if (!isNaN(ars) && !isNaN(rate) && rate > 0) {
      return (ars / rate).toFixed(2)
    }
    return ''
  }, [form.insuredAmountArs, form.exchangeRate])

  // Cost centers filtered by selected company
  const filteredCostCenters = useMemo(
    () =>
      mockCostCenters.filter(
        (cc) => cc.status === 'activo' && (!form.companyId || cc.companyId === form.companyId),
      ),
    [form.companyId],
  )

  const validate = (): boolean => {
    const next: Partial<Record<keyof PolicyForm, string>> = {}
    if (!form.policyNumber.trim())  next.policyNumber    = 'Requerido'
    if (!form.insuranceCompany)     next.insuranceCompany = 'Requerido'
    if (!form.producerId)           next.producerId       = 'Requerido'
    if (!form.insuranceType)        next.insuranceType    = 'Requerido'
    if (!form.coverageType)         next.coverageType     = 'Requerido'
    if (!form.startDate)            next.startDate        = 'Requerido'
    if (!form.endDate)              next.endDate          = 'Requerido'
    if (form.association === 'activo' && !form.assetId)    next.assetId    = 'Seleccioná un activo'
    if (form.association === 'sin_activo') {
      if (!form.companyId)    next.companyId    = 'Requerido sin activo'
      if (!form.costCenterId) next.costCenterId = 'Requerido sin activo'
    }
    if (!form.insuredAmountArs) next.insuredAmountArs = 'Requerido'
    if (!form.exchangeRate)     next.exchangeRate     = 'Requerido'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    // In production: call API to update policy
    alert('Póliza actualizada exitosamente (simulación). En producción se conectará al backend.')
    navigate(`/insurance/policies/${id}`)
  }

  return (
    <PageContent>
      <PageHeader
        title="Editar Póliza"
        subtitle={`Modificar datos de la póliza ${policy.policyNumber}`}
        backTo={`/insurance/policies/${id}`}
        backLabel="Volver al detalle"
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">

        {/* Section 1: Datos de la Póliza */}
        <SectionCard
          title="Datos de la Póliza"
          subtitle="Información principal de identificación y clasificación"
        >
          <FormSection title="">
            <FormField label="N° de Póliza" required error={errors.policyNumber}>
              <FormInput
                placeholder="Ej: AUT-2026-001234"
                value={form.policyNumber}
                onChange={set('policyNumber')}
                required
              />
            </FormField>
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect
                value={form.insuranceCompany}
                onChange={set('insuranceCompany')}
                required
              >
                <option value="">Seleccionar aseguradora…</option>
                {INSURANCE_COMPANIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Productor Asesor" required error={errors.producerId}>
              <FormSelect value={form.producerId} onChange={set('producerId')} required>
                <option value="">Seleccionar productor…</option>
                {mockProducers
                  .filter((p) => p.status === 'activo')
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </FormSelect>
            </FormField>
            <FormField label="Tipo de Seguro" required error={errors.insuranceType}>
              <FormSelect value={form.insuranceType} onChange={set('insuranceType')} required>
                <option value="">Seleccionar tipo…</option>
                {INSURANCE_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </FormSelect>
            </FormField>
            <FormField label="Tipo de Cobertura" required error={errors.coverageType}>
              <FormSelect value={form.coverageType} onChange={set('coverageType')} required>
                <option value="">Seleccionar cobertura…</option>
                {COVERAGE_TYPES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </FormSelect>
            </FormField>
          </FormSection>
        </SectionCard>

        {/* Section 2: Vigencia */}
        <SectionCard title="Vigencia" subtitle="Período de cobertura y descripción">
          <FormSection title="">
            <FormField label="Fecha de Inicio" required error={errors.startDate}>
              <FormInput
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                required
              />
            </FormField>
            <FormField label="Fecha de Vencimiento" required error={errors.endDate}>
              <FormInput
                type="date"
                value={form.endDate}
                onChange={set('endDate')}
                min={form.startDate}
                required
              />
            </FormField>
            <FormField label="Descripción" fullWidth>
              <FormTextarea
                placeholder="Detalle adicional sobre la cobertura, bienes incluidos, observaciones…"
                value={form.description}
                onChange={set('description')}
                rows={3}
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* Section 3: Association */}
        <SectionCard
          title="Asociación"
          subtitle="Vinculá la póliza a un activo o indicá empresa y centro de costo"
        >
          {/* Toggle */}
          <div className="flex items-center gap-1 mb-5 bg-slate-100 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setAssociation('activo')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                form.association === 'activo'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Con activo
            </button>
            <button
              type="button"
              onClick={() => setAssociation('sin_activo')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                form.association === 'sin_activo'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Sin activo
            </button>
          </div>

          {form.association === 'activo' ? (
            <FormSection title="">
              <FormField label="Activo Asegurado" required error={errors.assetId} fullWidth>
                <FormSelect value={form.assetId} onChange={set('assetId')} required>
                  <option value="">Seleccionar activo…</option>
                  {mockAssets
                    .filter((a) => a.status === 'activo')
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.internalCode} — {a.name} ({a.assetType})
                      </option>
                    ))}
                </FormSelect>
              </FormField>
            </FormSection>
          ) : (
            <FormSection title="">
              <FormField label="Empresa" required error={errors.companyId}>
                <FormSelect value={form.companyId} onChange={set('companyId')} required>
                  <option value="">Seleccionar empresa…</option>
                  {mockCompanies
                    .filter((c) => c.status === 'activo')
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </FormSelect>
              </FormField>
              <FormField label="Centro de Costo" required error={errors.costCenterId}>
                <FormSelect
                  value={form.costCenterId}
                  onChange={set('costCenterId')}
                  disabled={!form.companyId}
                  required
                >
                  <option value="">Seleccionar centro…</option>
                  {filteredCostCenters.map((cc) => (
                    <option key={cc.id} value={cc.id}>
                      {cc.code} — {cc.name}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
            </FormSection>
          )}
        </SectionCard>

        {/* Section 4: Importes */}
        <SectionCard
          title="Importes"
          subtitle="Suma asegurada y tipo de cambio"
        >
          <FormSection title="">
            <FormField label="Suma Asegurada (ARS)" required error={errors.insuredAmountArs}>
              <FormInput
                type="number"
                placeholder="Ej: 30000000"
                value={form.insuredAmountArs}
                onChange={set('insuredAmountArs')}
                min="0"
                step="1"
                required
              />
            </FormField>
            <FormField label="Tipo de Cambio (ARS/USD)" required error={errors.exchangeRate}>
              <FormInput
                type="number"
                placeholder="Ej: 970"
                value={form.exchangeRate}
                onChange={set('exchangeRate')}
                min="0"
                step="0.01"
                required
              />
            </FormField>
            <FormField label="Suma Asegurada (USD)" fullWidth>
              <FormInput
                value={
                  insuredAmountUsd
                    ? `US$ ${parseFloat(insuredAmountUsd).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : ''
                }
                readOnly
                disabled
                placeholder="Se calcula automáticamente"
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* Section 5: Documentación */}
        <SectionCard
          title="Documentación de la Póliza"
          subtitle="Reemplazá o agregá documentos (póliza, certificados, adjuntos)"
        >
          <FileDropzone
            label="Documentos de la póliza (PDF, imágenes, certificados)"
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls"
            maxFiles={10}
          />
        </SectionCard>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2 pb-6">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Save size={16} />
            Guardar Cambios
          </button>
          <button
            type="button"
            onClick={() => navigate(`/insurance/policies/${id}`)}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
          >
            <X size={16} />
            Cancelar
          </button>
        </div>

      </form>
    </PageContent>
  )
}
