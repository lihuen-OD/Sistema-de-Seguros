import { useState, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, X, Settings, CheckSquare, Plus, Paperclip } from 'lucide-react'
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
import {
  AddAttachmentModal,
  FileTypeIcon,
  ExpirationCell,
} from '../../../shared/components/file-upload/AttachmentListEditor'
import { AssetSelector } from '../../../shared/components/forms/AssetSelector'
import { policiesApi, policyKeys } from '../../../shared/api/policies.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { assetQueries } from '../../../shared/api/assets.api'
import { insuranceTypeQueries } from '../../../shared/api/insurance-types.api'
import { catalogQueries } from '../../../shared/api/catalogs.api'
import type { PolicyAttachment } from '../../../shared/types'

type AssociationType = 'activo' | 'sin_activo'
type PolicyAttachmentDraft = Omit<PolicyAttachment, 'id' | 'policyId'> & { pendingFile?: File }

interface PolicyForm {
  policyNumber: string
  insuranceCompany: string
  producerId: string
  insuranceType: string
  coverageTypes: string[]
  startDate: string
  endDate: string
  description: string
  beneficiaryDescription: string
  association: AssociationType
  assetIds: string[]
  companyId: string
  costCenterId: string
  insuredAmountArs: string
  exchangeRate: string
}

const INITIAL: PolicyForm = {
  policyNumber: '',
  insuranceCompany: '',
  producerId: '',
  insuranceType: '',
  coverageTypes: [],
  startDate: '',
  endDate: '',
  description: '',
  beneficiaryDescription: '',
  association: 'activo',
  assetIds: [],
  companyId: '',
  costCenterId: '',
  insuredAmountArs: '',
  exchangeRate: '',
}

// ── CoverageSelector ──────────────────────────────────────────────────────────

import type { InsuranceTypeConfig } from '../../../shared/api/insurance-types.api'

function CoverageSelector({
  insuranceType,
  insuranceTypes,
  selected,
  onChange,
  error,
}: {
  insuranceType: string
  insuranceTypes: InsuranceTypeConfig[]
  selected: string[]
  onChange: (v: string[]) => void
  error?: string
}) {
  const config = insuranceTypes.find((t) => t.label === insuranceType)

  if (!insuranceType) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-5 text-center">
        <CheckSquare size={18} className="mx-auto text-slate-300 mb-1.5" />
        <p className="text-sm text-slate-400">Seleccioná primero el tipo de seguro</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-400">Sin coberturas configuradas para este tipo.</p>
        <Link to="/settings/insurance-types" className="text-xs text-blue-600 hover:underline mt-1 block">
          Configurar tipos de seguro →
        </Link>
      </div>
    )
  }

  const coverageItems = config.coverageObjects ?? config.coverages.map((c) => ({ id: c, name: c }))

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((c) => c !== id)
        : [...selected, id],
    )
  }

  const allSelected = coverageItems.every((c) => selected.includes(c.id))
  const toggleAll = () => onChange(allSelected ? [] : coverageItems.map((c) => c.id))

  return (
    <div>
      {/* Contador + acción rápida */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          {selected.length === 0
            ? 'Ninguna seleccionada'
            : `${selected.length} de ${coverageItems.length} seleccionada${selected.length !== 1 ? 's' : ''}`}
        </p>
        <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          {allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {coverageItems.map((coverage, idx) => {
            const checked = selected.includes(coverage.id)
            const isLastRow = idx >= coverageItems.length - (coverageItems.length % 2 === 0 ? 2 : 1)
            return (
              <label
                key={coverage.id}
                className={[
                  'relative flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors select-none',
                  checked ? 'bg-blue-50' : 'bg-white hover:bg-slate-50',
                  idx % 2 === 0 && idx < coverageItems.length - 1 ? 'sm:border-r border-slate-100' : '',
                  !isLastRow ? 'border-b border-slate-100' : '',
                ].join(' ')}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                  }`}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={checked} onChange={() => toggle(coverage.id)} className="sr-only" />
                <span className={`text-sm leading-snug ${checked ? 'text-blue-800 font-medium' : 'text-slate-700'}`}>
                  {coverage.name}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PolicyNewPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PolicyForm>(INITIAL)
  const [errors, setErrors] = useState<Partial<Record<keyof PolicyForm | 'coverageTypes', string>>>({})
  const [attachmentDrafts, setAttachmentDrafts] = useState<PolicyAttachmentDraft[]>([])
  const [showAttachModal, setShowAttachModal] = useState(false)

  const { data: producers = [] } = useQuery(producerQueries.list())

  const { data: allAssets = [] } = useQuery(assetQueries.list())

  const { data: companies = [] } = useQuery(companyQueries.list())

  const { data: costCenters = [] } = useQuery(costCenterQueries.list())

  const { data: insuranceTypes = [] } = useQuery(insuranceTypeQueries.list())

  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))

  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof policiesApi.create>[0]) => policiesApi.create(input),
  })

  const set =
    (key: keyof PolicyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

  const setInsuranceType = (value: string) => {
    setForm((prev) => ({ ...prev, insuranceType: value, coverageTypes: [] }))
    setErrors((prev) => ({ ...prev, insuranceType: undefined, coverageTypes: undefined }))
  }

  const setAssociation = (value: AssociationType) => {
    setForm((prev) => ({
      ...prev,
      association: value,
      assetIds: [],
      companyId: '',
      costCenterId: '',
      beneficiaryDescription: '',
    }))
  }

  const toggleAsset = (assetId: string) => {
    setForm((prev) => ({
      ...prev,
      assetIds: prev.assetIds.includes(assetId)
        ? prev.assetIds.filter((id) => id !== assetId)
        : [...prev.assetIds, assetId],
    }))
    setErrors((prev) => ({ ...prev, assetIds: undefined }))
  }

  const insuredAmountUsd = useMemo(() => {
    const ars = parseFloat(form.insuredAmountArs)
    const rate = parseFloat(form.exchangeRate)
    if (!isNaN(ars) && !isNaN(rate) && rate > 0) return (ars / rate).toFixed(2)
    return ''
  }, [form.insuredAmountArs, form.exchangeRate])

  const filteredCostCenters = useMemo(
    () => costCenters.filter((cc) => cc.status === 'activo'),
    [costCenters],
  )

  // "Accidentes Personales" sin activo → pide descripción del asegurado
  const isAP = form.coverageTypes.includes('Accidentes Personales') || form.insuranceType === 'Personal'
  const showBeneficiaryField = isAP && form.association === 'sin_activo'

  const validate = (): boolean => {
    const next: Partial<Record<keyof PolicyForm | 'coverageTypes', string>> = {}
    if (!form.policyNumber.trim())   next.policyNumber    = 'Requerido'
    if (!form.insuranceCompany)      next.insuranceCompany = 'Requerido'
    if (!form.producerId)            next.producerId       = 'Requerido'
    if (!form.insuranceType)         next.insuranceType    = 'Requerido'
    if (form.coverageTypes.length === 0) next.coverageTypes = 'Seleccioná al menos una cobertura'
    if (!form.startDate)             next.startDate        = 'Requerido'
    if (!form.endDate)               next.endDate          = 'Requerido'
    if (form.association === 'activo' && form.assetIds.length === 0) next.assetIds = 'Seleccioná al menos un activo'
    if (form.association === 'sin_activo') {
      if (!form.companyId)    next.companyId    = 'Requerido'
      if (!form.costCenterId) next.costCenterId = 'Requerido'
    }
    if (showBeneficiaryField && !form.beneficiaryDescription.trim()) {
      next.beneficiaryDescription = 'Describí a quién corresponde este seguro'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const ars = parseFloat(form.insuredAmountArs) || 0
    const rate = parseFloat(form.exchangeRate) || 1

    const insuranceTypeObj = insuranceTypes.find((t) => t.label === form.insuranceType)
    const insuranceTypeId = insuranceTypeObj?.id ?? ''

    const firstAsset = form.association === 'activo' && form.assetIds.length > 0
      ? allAssets.find((a) => a.id === form.assetIds[0])
      : undefined
    const companyId = form.association === 'sin_activo'
      ? form.companyId
      : (firstAsset?.companyId ?? '')
    const costCenterId = form.association === 'sin_activo' ? form.costCenterId || null : null

    try {
      const newPolicy = await createMutation.mutateAsync({
        policyNumber: form.policyNumber.trim(),
        insuranceTypeId,
        companyId,
        costCenterId,
        producerId: form.producerId || undefined,
        insuredName: form.insuranceCompany,
        assetIds: form.association === 'activo' ? form.assetIds : [],
        beneficiaryDescription: form.beneficiaryDescription.trim() || null,
        startDate: form.startDate,
        endDate: form.endDate,
        premium: ars,
        currency: 'ARS',
        exchangeRate: rate,
        description: form.description.trim() || undefined,
        coverageIds: form.coverageTypes,
      })

      // Upload pending attachments after policy is created
      const pending = attachmentDrafts.filter((a) => a.pendingFile)
      for (const att of pending) {
        await policiesApi.addAttachment(newPolicy.id, att.pendingFile!, {
          description: att.description || undefined,
          expirationDate: att.expirationDate ?? undefined,
        })
      }

      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      toast.success('Póliza creada correctamente')
      navigate(`/insurance/policies/${newPolicy.id}`)
    } catch {
      // errors are shown via the global axios interceptor toast
    }
  }

  return (
    <PageContent>
      <PageHeader
        title="Nueva Póliza"
        subtitle="Registrar una nueva póliza de seguro"
        backTo="/insurance/policies"
        backLabel="Volver a pólizas"
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">

        {/* 1. Datos de la Póliza */}
        <SectionCard
          title="Datos de la Póliza"
          subtitle="Identificación, tipo de seguro y coberturas"
        >
          <div className="space-y-5">
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
                <FormSelect value={form.insuranceCompany} onChange={set('insuranceCompany')} required>
                  <option value="">Seleccionar aseguradora…</option>
                  {insuranceCompanies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
                </FormSelect>
              </FormField>
              <FormField label="Productor Asesor" required error={errors.producerId}>
                <FormSelect value={form.producerId} onChange={set('producerId')} required>
                  <option value="">Seleccionar productor…</option>
                  {producers.filter((p) => p.status === 'activo').map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label="Tipo de Seguro" required error={errors.insuranceType}>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <FormSelect
                      value={form.insuranceType}
                      onChange={(e) => setInsuranceType(e.target.value)}
                      required
                    >
                      <option value="">Seleccionar tipo…</option>
                      {insuranceTypes.map((t) => (
                        <option key={t.id} value={t.label}>{t.label}</option>
                      ))}
                    </FormSelect>
                  </div>
                  <Link
                    to="/settings/insurance-types"
                    title="Configurar tipos de seguro"
                    className="flex-shrink-0 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Settings size={15} />
                  </Link>
                </div>
              </FormField>
            </FormSection>

            {/* Coberturas — multi-select dinámico */}
            <div className="border-t border-slate-100 pt-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Coberturas</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Seleccioná las coberturas incluidas en esta póliza
                  </p>
                </div>
              </div>
              <CoverageSelector
                insuranceType={form.insuranceType}
                insuranceTypes={insuranceTypes}
                selected={form.coverageTypes}
                onChange={(v) => {
                  setForm((prev) => ({ ...prev, coverageTypes: v }))
                  setErrors((prev) => ({ ...prev, coverageTypes: undefined }))
                }}
                error={errors.coverageTypes}
              />
            </div>
          </div>
        </SectionCard>

        {/* 2. Vigencia */}
        <SectionCard title="Vigencia" subtitle="Período de cobertura y observaciones">
          <FormSection title="">
            <FormField label="Fecha de Inicio" required error={errors.startDate}>
              <FormInput type="date" value={form.startDate} onChange={set('startDate')} required />
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
            <FormField label="Observaciones" fullWidth>
              <FormTextarea
                placeholder="Detalle adicional sobre la cobertura, bienes incluidos, notas…"
                value={form.description}
                onChange={set('description')}
                rows={3}
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 3. Asociación */}
        <SectionCard
          title="Asociación"
          subtitle="Vinculá la póliza a un activo o indicá empresa y centro de costo"
        >
          <div className="flex items-center gap-1 mb-5 bg-slate-100 rounded-lg p-1 w-fit">
            {(['activo', 'sin_activo'] as AssociationType[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAssociation(opt)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  form.association === opt
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt === 'activo' ? 'Con activo' : 'Sin activo'}
              </button>
            ))}
          </div>

          {form.association === 'activo' ? (
            <FormField label="Activos Asegurados" required error={errors.assetIds} fullWidth>
              <AssetSelector
                assets={allAssets.filter((a) => a.status === 'activo')}
                selected={form.assetIds}
                onToggle={toggleAsset}
                error={errors.assetIds}
              />
            </FormField>
          ) : (
            <div className="space-y-4">
              <FormSection title="">
                <FormField label="Empresa" required error={errors.companyId}>
                  <FormSelect value={form.companyId} onChange={set('companyId')} required>
                    <option value="">Seleccionar empresa…</option>
                    {companies.filter((c) => c.status === 'activo').map((c) => (
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
                    <option value="">{form.companyId ? 'Seleccionar centro…' : 'Primero empresa'}</option>
                    {filteredCostCenters.map((cc) => (
                      <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                    ))}
                  </FormSelect>
                </FormField>
              </FormSection>

              {/* Campo beneficiario — solo Accidentes Personales sin activo */}
              {showBeneficiaryField && (
                <div className="border-t border-slate-100 pt-4">
                  <FormField
                    label="¿A quién corresponde este seguro?"
                    required
                    error={errors.beneficiaryDescription}
                    fullWidth
                  >
                    <FormTextarea
                      placeholder="Ej: Empleados del establecimiento Las Vertientes — Personal en relación de dependencia"
                      value={form.beneficiaryDescription}
                      onChange={set('beneficiaryDescription')}
                      rows={2}
                    />
                  </FormField>
                  <p className="text-xs text-slate-400 mt-1">
                    Requerido cuando la cobertura de Accidentes Personales no está vinculada a un activo específico.
                  </p>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* 4. Importes */}
        <SectionCard title="Importes" subtitle="Suma asegurada y tipo de cambio al momento del alta">
          <FormSection title="">
            <FormField label="Suma Asegurada (ARS)" error={errors.insuredAmountArs}>
              <FormInput
                type="number"
                placeholder="Ej: 30000000"
                value={form.insuredAmountArs}
                onChange={set('insuredAmountArs')}
                min="0"
                step="1"
              />
            </FormField>
            <FormField label="Tipo de Cambio (ARS/USD)" error={errors.exchangeRate}>
              <FormInput
                type="number"
                placeholder="Ej: 970"
                value={form.exchangeRate}
                onChange={set('exchangeRate')}
                min="0"
                step="0.01"
              />
            </FormField>
            <FormField label="Suma Asegurada (USD)">
              <FormInput
                value={
                  insuredAmountUsd
                    ? `US$ ${parseFloat(insuredAmountUsd).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : ''
                }
                readOnly
                disabled
                placeholder="Se calcula automáticamente"
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 5. Documentación */}
        <SectionCard
          title="Documentación de la Póliza"
          subtitle="Adjuntá la póliza, certificados y documentación adicional"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-500">
              {attachmentDrafts.length === 0
                ? 'Sin archivos adjuntos'
                : `${attachmentDrafts.length} archivo${attachmentDrafts.length !== 1 ? 's' : ''} adjunto${attachmentDrafts.length !== 1 ? 's' : ''}`}
            </span>
            <button
              type="button"
              onClick={() => setShowAttachModal(true)}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Plus size={12} />
              Adjuntar archivo
            </button>
          </div>

          {attachmentDrafts.length === 0 ? (
            <div
              onClick={() => setShowAttachModal(true)}
              className="border-2 border-dashed border-slate-200 rounded-xl py-6 text-center cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition-colors"
            >
              <Paperclip size={18} className="mx-auto text-slate-300 mb-1.5" />
              <p className="text-sm text-slate-500">Adjuntá la póliza, certificados u otros documentos</p>
              <p className="text-xs text-slate-400 mt-0.5">PDF, Excel o imágenes — con fecha de vencimiento opcional</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {attachmentDrafts.map((att, idx) => (
                <li key={idx} className="flex items-center gap-3 p-2.5 bg-white border border-slate-200 rounded-xl group">
                  <FileTypeIcon fileType={att.fileType} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 truncate">{att.name}</p>
                    <p className="text-xs text-slate-400">
                      {att.description ? <>{att.description} · {att.fileSize}</> : att.fileSize}
                    </p>
                  </div>
                  {att.expirationDate && (
                    <div className="flex-shrink-0">
                      <ExpirationCell date={att.expirationDate} />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachmentDrafts((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showAttachModal && (
            <AddAttachmentModal
              onClose={() => setShowAttachModal(false)}
              onAdd={(partial) => {
                setAttachmentDrafts((prev) => [...prev, {
                  name: partial.name,
                  description: partial.description,
                  fileType: partial.fileType,
                  fileSize: partial.fileSize,
                  expirationDate: partial.expirationDate,
                  uploadedAt: partial.uploadedAt,
                  uploadedBy: partial.uploadedBy,
                  pendingFile: partial.pendingFile,
                }])
                setShowAttachModal(false)
              }}
            />
          )}
        </SectionCard>

        {/* Footer */}
        <div className="flex items-center gap-3 pt-2 pb-6">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <Save size={16} />
            {createMutation.isPending ? 'Guardando…' : 'Guardar Póliza'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/insurance/policies')}
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
