import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, X, Settings, CheckSquare, Plus, Trash2 } from 'lucide-react'
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
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { SearchableSelect } from '../../../shared/components/forms/SearchableSelect'
import { PolicyAttachmentsSection } from './PolicyAttachmentsSection'
import { policiesApi, policyKeys, policyQueries, type PolicyCoverageInput } from '../../../shared/api/policies.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { assetQueries } from '../../../shared/api/assets.api'
import { insuranceTypeQueries } from '../../../shared/api/insurance-types.api'
import { catalogQueries } from '../../../shared/api/catalogs.api'
import { notifyValidationErrors } from '../../../shared/utils/formValidation'
import { buildAssetSearchKeywords } from '../../../shared/utils/assetSearch'
import { CURRENCY_OPTIONS } from '../../../shared/constants'
import type { Policy, PolicyCoverage } from '../../../shared/types'
import type { InsuranceTypeConfig } from '../../../shared/api/insurance-types.api'

type AssociationType = 'activo' | 'sin_activo'

interface PolicyForm {
  policyNumber: string
  insuranceCompany: string
  producerId: string
  startDate: string
  endDate: string
  description: string
}

// Línea de cobertura en edición — conserva el `coverageId` real (línea
// existente en el backend) cuando corresponde, para que replaceCoverages
// pueda actualizarla en lugar de recrearla.
interface CoverageLineForm {
  formId: string
  coverageId?: string
  association: AssociationType
  assetId: string
  insuranceType: string
  coverageTypes: string[]
  currency: 'ARS' | 'USD'
  insuredAmount: string
  exchangeRate: string
  companyId: string
  costCenterId: string
  beneficiaryDescription: string
}

function coverageToLine(c: PolicyCoverage): CoverageLineForm {
  return {
    formId: crypto.randomUUID(),
    coverageId: c.id,
    association: c.assetId ? 'activo' : 'sin_activo',
    assetId: c.assetId ?? '',
    insuranceType: c.insuranceType,
    coverageTypes: c.coverageIds ?? [],
    currency: c.currency,
    insuredAmount: String(c.currency === 'USD' ? c.insuredAmountUsd : c.insuredAmountArs),
    exchangeRate: String(c.exchangeRate),
    companyId: c.companyId ?? '',
    costCenterId: c.costCenterId ?? '',
    beneficiaryDescription: c.beneficiaryDescription ?? '',
  }
}

function createEmptyLine(defaultExchangeRate = ''): CoverageLineForm {
  return {
    formId: crypto.randomUUID(),
    association: 'activo',
    assetId: '',
    insuranceType: '',
    coverageTypes: [],
    currency: 'ARS',
    insuredAmount: '',
    exchangeRate: defaultExchangeRate,
    companyId: '',
    costCenterId: '',
    beneficiaryDescription: '',
  }
}

type LineErrors = Partial<Record<keyof CoverageLineForm, string>>

// ── CoverageSelector ──────────────────────────────────────────────────────────

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
        <Link to="/settings/insurance-types" className="text-xs text-brand-600 hover:underline mt-1 block">
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
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          {selected.length === 0
            ? 'Ninguna seleccionada'
            : `${selected.length} de ${coverageItems.length} seleccionada${selected.length !== 1 ? 's' : ''}`}
        </p>
        <button type="button" onClick={toggleAll} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
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
                  checked ? 'bg-brand-50' : 'bg-white hover:bg-slate-50',
                  idx % 2 === 0 && idx < coverageItems.length - 1 ? 'sm:border-r border-slate-100' : '',
                  !isLastRow ? 'border-b border-slate-100' : '',
                ].join(' ')}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                  }`}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={checked} onChange={() => toggle(coverage.id)} className="sr-only" />
                <span className={`text-sm leading-snug ${checked ? 'text-brand-800 font-medium' : 'text-slate-700'}`}>
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

export default function PolicyEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: policy, isLoading: loadingPolicy } = useQuery(policyQueries.detail(id!))
  const { data: producers = [] } = useQuery(producerQueries.list())
  const { data: allAssets = [] } = useQuery(assetQueries.list())
  const { data: companies = [] } = useQuery(companyQueries.list())
  const { data: costCenters = [] } = useQuery(costCenterQueries.list())
  const { data: insuranceTypes = [] } = useQuery(insuranceTypeQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))

  const [form, setForm] = useState<PolicyForm>({
    policyNumber: '', insuranceCompany: '', producerId: '', startDate: '', endDate: '', description: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof PolicyForm, string>>>({})
  const [lines, setLines] = useState<CoverageLineForm[]>([])
  const [lineErrors, setLineErrors] = useState<Record<string, LineErrors>>({})
  const [formInitialized, setFormInitialized] = useState(false)

  useEffect(() => {
    if (policy && !formInitialized) {
      setForm({
        policyNumber: policy.policyNumber,
        insuranceCompany: policy.insuranceCompany,
        producerId: policy.producerId,
        startDate: policy.startDate,
        endDate: policy.endDate,
        description: policy.description,
      })
      setLines((policy.coverages ?? []).map(coverageToLine))
      setFormInitialized(true)
    }
  }, [policy, formInitialized])

  const updatePolicyMutation = useMutation({
    mutationFn: (input: Parameters<typeof policiesApi.update>[1]) => policiesApi.update(id!, input),
  })
  const replaceCoveragesMutation = useMutation({
    mutationFn: (coverages: PolicyCoverageInput[]) => policiesApi.replaceCoverages(id!, coverages),
  })

  const activeAssets = useMemo(() => allAssets.filter((a) => a.status === 'activo'), [allAssets])
  const activeCompanies = useMemo(() => companies.filter((c) => c.status === 'activo'), [companies])
  const activeCostCenters = useMemo(() => costCenters.filter((cc) => cc.status === 'activo'), [costCenters])

  const usedAssetIds = new Set(lines.map((l) => l.assetId).filter(Boolean))

  const set =
    (key: keyof PolicyForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }))
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }))
    }

  function updateLine(formId: string, patch: Partial<CoverageLineForm>) {
    setLines((prev) => prev.map((l) => (l.formId === formId ? { ...l, ...patch } : l)))
    setLineErrors((prev) => {
      if (!prev[formId]) return prev
      const next = { ...prev[formId] }
      for (const key of Object.keys(patch)) delete next[key as keyof CoverageLineForm]
      return { ...prev, [formId]: next }
    })
  }

  function addLine() {
    setLines((prev) => [...prev, createEmptyLine(prev[0]?.exchangeRate)])
  }

  function removeLine(formId: string) {
    setLines((prev) => prev.filter((l) => l.formId !== formId))
  }

  if (loadingPolicy) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </PageContent>
    )
  }

  if (!policy) {
    return (
      <PageContent>
        <EmptyState title="Póliza no encontrada" description="La póliza solicitada no existe o fue eliminada." />
      </PageContent>
    )
  }

  function validate(): boolean {
    const next: Partial<Record<keyof PolicyForm, string>> = {}
    if (!form.policyNumber.trim()) next.policyNumber = 'Requerido'
    if (!form.insuranceCompany) next.insuranceCompany = 'Requerido'
    if (!form.startDate) next.startDate = 'Requerido'
    if (!form.endDate) next.endDate = 'Requerido'
    setErrors(next)

    const nextLineErrors: Record<string, LineErrors> = {}
    for (const line of lines) {
      const lineErr: LineErrors = {}
      if (line.association === 'activo' && !line.assetId) lineErr.assetId = 'Seleccioná un activo'
      if (!line.insuranceType) lineErr.insuranceType = 'Requerido'
      if (line.coverageTypes.length === 0) lineErr.coverageTypes = 'Seleccioná al menos una cobertura'
      if (line.association === 'sin_activo') {
        if (!line.companyId) lineErr.companyId = 'Requerido'
        if (!line.costCenterId) lineErr.costCenterId = 'Requerido'
        const isAP = line.coverageTypes.length > 0 && line.insuranceType.toLowerCase().includes('personal')
        if (isAP && !line.beneficiaryDescription.trim()) {
          lineErr.beneficiaryDescription = 'Describí a quién corresponde este seguro'
        }
      }
      if (Object.keys(lineErr).length > 0) nextLineErrors[line.formId] = lineErr
    }
    setLineErrors(nextLineErrors)

    const hasErrors = Object.keys(next).length > 0 || Object.keys(nextLineErrors).length > 0
    if (hasErrors) {
      notifyValidationErrors({ ...next, ...(Object.keys(nextLineErrors).length > 0 && { lines: 'Revisá las líneas de cobertura' }) })
    }
    return !hasErrors
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const coverages: PolicyCoverageInput[] = lines.map((line) => {
      const insuranceTypeObj = insuranceTypes.find((t) => t.label === line.insuranceType)
      return {
        id: line.coverageId,
        assetId: line.association === 'activo' ? line.assetId : null,
        insuranceTypeId: insuranceTypeObj?.id ?? '',
        coverageIds: line.coverageTypes,
        insuredAmount: parseFloat(line.insuredAmount) || 0,
        currency: line.currency,
        exchangeRate: parseFloat(line.exchangeRate) || 1,
        companyId: line.association === 'sin_activo' ? line.companyId : null,
        costCenterId: line.association === 'sin_activo' ? line.costCenterId || null : null,
        beneficiaryDescription: line.association === 'sin_activo' ? line.beneficiaryDescription.trim() || null : null,
      }
    })

    try {
      await updatePolicyMutation.mutateAsync({
        producerId: form.producerId || undefined,
        insuredName: form.insuranceCompany,
        startDate: form.startDate,
        endDate: form.endDate,
        description: form.description.trim() || undefined,
      })
      await replaceCoveragesMutation.mutateAsync(coverages)

      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      queryClient.invalidateQueries({ queryKey: policyKeys.detail(id!) })
      queryClient.invalidateQueries({ queryKey: policyKeys.coverages(id!) })
      toast.success('Póliza actualizada correctamente')
      navigate(`/insurance/policies/${id}`)
    } catch {
      // errors are shown via the global axios interceptor toast
    }
  }

  const isSaving = updatePolicyMutation.isPending || replaceCoveragesMutation.isPending

  return (
    <PageContent>
      <PageHeader
        title="Editar Póliza"
        subtitle={`Modificar datos de la póliza ${policy.policyNumber}`}
        backTo={`/insurance/policies/${id}`}
        backLabel="Volver al detalle"
      />

      <form onSubmit={handleSubmit} className="max-w-5xl space-y-5">

        {/* 1. Datos de la Póliza */}
        <SectionCard title="Datos de la Póliza" subtitle="Identificación única de la póliza">
          <FormSection title="">
            <FormField label="N° de Póliza" required error={errors.policyNumber}>
              <FormInput placeholder="Ej: AUT-2026-001234" value={form.policyNumber} onChange={set('policyNumber')} required />
            </FormField>
            <FormField label="Compañía Aseguradora" required error={errors.insuranceCompany}>
              <FormSelect value={form.insuranceCompany} onChange={set('insuranceCompany')} required>
                <option value="">Seleccionar aseguradora…</option>
                {insuranceCompanies.map((c) => <option key={c.id} value={c.label}>{c.label}</option>)}
              </FormSelect>
            </FormField>
            <FormField label="Productor Asesor">
              <FormSelect value={form.producerId} onChange={set('producerId')}>
                <option value="">Seleccionar productor…</option>
                {producers.filter((p) => p.status === 'activo').map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </FormSelect>
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 2. Vigencia */}
        <SectionCard title="Vigencia" subtitle="Período de cobertura y observaciones">
          <FormSection title="">
            <FormField label="Fecha de Inicio" required error={errors.startDate}>
              <FormInput type="date" value={form.startDate} onChange={set('startDate')} required />
            </FormField>
            <FormField label="Fecha de Vencimiento" required error={errors.endDate}>
              <FormInput type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} required />
            </FormField>
            <FormField label="Observaciones" fullWidth>
              <FormTextarea
                placeholder="Detalle adicional sobre la póliza, notas para el equipo…"
                value={form.description}
                onChange={set('description')}
                rows={3}
              />
            </FormField>
          </FormSection>
        </SectionCard>

        {/* 3. Líneas de cobertura */}
        <div className="space-y-4">
          <div className="px-1">
            <h2 className="text-sm font-semibold text-slate-800">Activos cubiertos</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Cada línea es un activo (o "sin activo") con su propio tipo de seguro, coberturas, suma asegurada y documentación.
            </p>
          </div>

          {lines.map((line, idx) => {
            const err = lineErrors[line.formId] ?? {}
            const equivalentCurrencyLabel = line.currency === 'ARS' ? 'USD' : 'ARS'
            const equivalentPrefix = line.currency === 'ARS' ? 'US$' : 'AR$'
            const amount = parseFloat(line.insuredAmount)
            const rate = parseFloat(line.exchangeRate)
            const equivalentAmount =
              !isNaN(amount) && !isNaN(rate) && rate > 0
                ? (line.currency === 'ARS' ? amount / rate : amount * rate)
                : null
            const isAP = line.coverageTypes.length > 0 && line.insuranceType.toLowerCase().includes('personal')
            const showBeneficiaryField = isAP && line.association === 'sin_activo'
            const selectedAsset = activeAssets.find((a) => a.id === line.assetId)

            return (
              <SectionCard
                key={line.formId}
                title={`Línea ${idx + 1}${selectedAsset ? ` — ${selectedAsset.name}` : ''}`}
                subtitle={line.association === 'sin_activo' ? 'Sin activo asociado' : undefined}
                actions={
                  lines.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeLine(line.formId)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Quitar esta línea"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : undefined
                }
              >
                <div className="space-y-5">
                  {/* Asociación */}
                  <div>
                    <div className="flex items-center gap-1 mb-3 bg-slate-100 rounded-lg p-1 w-fit">
                      {(['activo', 'sin_activo'] as AssociationType[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => updateLine(line.formId, {
                            association: opt, assetId: '', companyId: '', costCenterId: '', beneficiaryDescription: '',
                          })}
                          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                            line.association === opt ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {opt === 'activo' ? 'Con activo' : 'Sin activo'}
                        </button>
                      ))}
                    </div>

                    {line.association === 'activo' ? (
                      <FormField label="Activo Asegurado" required error={err.assetId}>
                        <SearchableSelect
                          options={activeAssets
                            .filter((a) => a.id === line.assetId || !usedAssetIds.has(a.id))
                            .map((a) => ({
                              value: a.id,
                              label: a.name,
                              sublabel: a.internalCode,
                              keywords: buildAssetSearchKeywords(a),
                            }))}
                          value={line.assetId}
                          onChange={(v) => updateLine(line.formId, { assetId: v })}
                          placeholder="Seleccionar activo…"
                          searchPlaceholder="Buscar por nombre, código, patente, bien de uso…"
                        />
                      </FormField>
                    ) : (
                      <div className="space-y-4">
                        <FormSection title="">
                          <FormField label="Empresa" required error={err.companyId}>
                            <FormSelect value={line.companyId} onChange={(e) => updateLine(line.formId, { companyId: e.target.value })} required>
                              <option value="">Seleccionar empresa…</option>
                              {activeCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </FormSelect>
                          </FormField>
                          <FormField label="Centro de Costo" required error={err.costCenterId}>
                            <FormSelect
                              value={line.costCenterId}
                              onChange={(e) => updateLine(line.formId, { costCenterId: e.target.value })}
                              disabled={!line.companyId}
                              required
                            >
                              <option value="">{line.companyId ? 'Seleccionar centro…' : 'Primero empresa'}</option>
                              {activeCostCenters.map((cc) => <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>)}
                            </FormSelect>
                          </FormField>
                        </FormSection>

                        {showBeneficiaryField && (
                          <FormField label="¿A quién corresponde este seguro?" required error={err.beneficiaryDescription} fullWidth>
                            <FormTextarea
                              placeholder="Ej: Empleados del establecimiento Las Vertientes — Personal en relación de dependencia"
                              value={line.beneficiaryDescription}
                              onChange={(e) => updateLine(line.formId, { beneficiaryDescription: e.target.value })}
                              rows={2}
                            />
                            <p className="text-xs text-slate-400 mt-1">
                              Requerido cuando Accidentes Personales no está vinculado a un activo específico.
                            </p>
                          </FormField>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Tipo de seguro + coberturas */}
                  <div className="border-t border-slate-100 pt-5">
                    <FormField label="Tipo de Seguro" required error={err.insuranceType}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <FormSelect
                            value={line.insuranceType}
                            onChange={(e) => updateLine(line.formId, { insuranceType: e.target.value, coverageTypes: [] })}
                            required
                          >
                            <option value="">Seleccionar tipo…</option>
                            {insuranceTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
                          </FormSelect>
                        </div>
                        <Link
                          to="/settings/insurance-types"
                          title="Configurar tipos de seguro"
                          className="flex-shrink-0 p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                          <Settings size={15} />
                        </Link>
                      </div>
                    </FormField>

                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-800 mb-2">Coberturas</p>
                      <CoverageSelector
                        insuranceType={line.insuranceType}
                        insuranceTypes={insuranceTypes}
                        selected={line.coverageTypes}
                        onChange={(v) => updateLine(line.formId, { coverageTypes: v })}
                        error={err.coverageTypes}
                      />
                    </div>
                  </div>

                  {/* Importes */}
                  <div className="border-t border-slate-100 pt-5">
                    <p className="text-sm font-semibold text-slate-800 mb-3">Suma Asegurada</p>
                    <FormSection title="">
                      <FormField label="Moneda">
                        <FormSelect value={line.currency} onChange={(e) => updateLine(line.formId, { currency: e.target.value as 'ARS' | 'USD' })}>
                          {CURRENCY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </FormSelect>
                      </FormField>
                      <FormField label={`Suma Asegurada (${line.currency})`}>
                        <FormInput
                          type="number" placeholder="Ej: 30000000" min="0" step="1"
                          value={line.insuredAmount}
                          onChange={(e) => updateLine(line.formId, { insuredAmount: e.target.value })}
                        />
                      </FormField>
                      <FormField label="Tipo de Cambio (ARS/USD)">
                        <FormInput
                          type="number" placeholder="Ej: 970" min="0" step="0.01"
                          value={line.exchangeRate}
                          onChange={(e) => updateLine(line.formId, { exchangeRate: e.target.value })}
                        />
                      </FormField>
                      <FormField label={`Suma Asegurada (${equivalentCurrencyLabel})`}>
                        <FormInput
                          value={equivalentAmount != null
                            ? `${equivalentPrefix} ${equivalentAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : ''}
                          readOnly disabled placeholder="Se calcula automáticamente"
                        />
                      </FormField>
                    </FormSection>
                  </div>

                  {/* Documentación — sólo disponible una vez que la línea existe en el backend */}
                  {line.coverageId ? (
                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-sm font-semibold text-slate-800 mb-3">Documentación</p>
                      <PolicyAttachmentsSection policyId={policy.id} coverageId={line.coverageId} policyEndDate={form.endDate} />
                    </div>
                  ) : (
                    <div className="border-t border-slate-100 pt-5">
                      <p className="text-sm font-semibold text-slate-800 mb-2">Documentación</p>
                      <p className="text-xs text-slate-400">
                        Vas a poder adjuntar documentación una vez que guardes esta línea por primera vez.
                      </p>
                    </div>
                  )}
                </div>
              </SectionCard>
            )
          })}

          <button
            type="button"
            onClick={addLine}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors px-1"
          >
            <Plus size={14} />
            Agregar línea de cobertura
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 pt-2 pb-6">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <Save size={16} />
            {isSaving ? 'Guardando…' : 'Guardar Cambios'}
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
