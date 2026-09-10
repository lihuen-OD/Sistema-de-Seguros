import { useState, useMemo } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, X, Settings, Plus, Trash2, ShieldOff, History } from 'lucide-react'
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
import { DeactivateCoverageModal } from './DeactivateCoverageModal'
import { CoverageSelector } from './components/CoverageSelector'
import { policiesApi, policyKeys, policyQueries, type PolicyCoverageInput } from '../../../shared/api/policies.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { producerQueries } from '../../../shared/api/producers.api'
import { assetQueries } from '../../../shared/api/assets.api'
import { insuranceTypeQueries } from '../../../shared/api/insurance-types.api'
import { catalogQueries } from '../../../shared/api/catalogs.api'
import { notifyValidationErrors } from '../../../shared/utils/formValidation'
import { formatCurrencyFull, formatDate, isExpired } from '../../../shared/utils/format'
import { buildAssetSearchKeywords } from '../../../shared/utils/assetSearch'
import { CURRENCY_OPTIONS } from '../../../shared/constants'
import type { Policy, PolicyCoverage, Producer, Asset, Company, CostCenter } from '../../../shared/types'
import type { InsuranceTypeConfig } from '../../../shared/api/insurance-types.api'
import type { CatalogItem } from '../../../shared/api/catalogs.api'

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
  attachmentsCount: number
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
  // Ciclo de vida (Fase 3) — effectiveDate solo es editable en una línea
  // nueva (sin coverageId): en una ya persistida no hay forma de que este
  // save la modifique (replaceCoverages no la toca), así que se muestra de
  // solo lectura. bajaDate != null bloquea la acción de baja desde acá
  // (evita un doble intento — ver el botón de la card). bajaReason solo se
  // usa para mostrarlo cuando la baja ya es efectiva (ver isEffectivelyDeBaja).
  effectiveDate: string
  bajaDate: string | null
  bajaReason: string | null
}

function coverageToLine(c: PolicyCoverage): CoverageLineForm {
  return {
    formId: crypto.randomUUID(),
    coverageId: c.id,
    attachmentsCount: c.attachmentsCount ?? 0,
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
    effectiveDate: c.effectiveDate,
    bajaDate: c.bajaDate,
    bajaReason: c.bajaReason,
  }
}

function createEmptyLine(defaultExchangeRate = '0'): CoverageLineForm {
  return {
    formId: crypto.randomUUID(),
    attachmentsCount: 0,
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
    effectiveDate: '',
    bajaDate: null,
    bajaReason: null,
  }
}

type LineErrors = Partial<Record<keyof CoverageLineForm, string>>

// ── Component ─────────────────────────────────────────────────────────────────

export default function PolicyEditPage() {
  const { id } = useParams<{ id: string }>()

  const { data: policy, isLoading: loadingPolicy } = useQuery(policyQueries.detail(id!))
  const { data: producers = [] } = useQuery(producerQueries.list())
  const { data: allAssets = [] } = useQuery(assetQueries.list())
  const { data: companies = [] } = useQuery(companyQueries.list())
  const { data: costCenters = [] } = useQuery(costCenterQueries.list())
  const { data: insuranceTypes = [] } = useQuery(insuranceTypeQueries.list())
  const { data: insuranceCompanies = [] } = useQuery(catalogQueries.byCategory('insurance_company'))

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

  return (
    <PageContent>
      <PageHeader
        title="Editar Póliza"
        subtitle={`Modificar datos de la póliza ${policy.policyNumber}`}
        backTo={`/insurance/policies/${id}`}
        backLabel="Volver al detalle"
      />

      <PolicyEditForm
        key={id}
        policy={policy}
        producers={producers}
        allAssets={allAssets}
        companies={companies}
        costCenters={costCenters}
        insuranceTypes={insuranceTypes}
        insuranceCompanies={insuranceCompanies}
      />
    </PageContent>
  )
}

interface PolicyEditFormProps {
  policy: Policy
  producers: Producer[]
  allAssets: Asset[]
  companies: Company[]
  costCenters: CostCenter[]
  insuranceTypes: InsuranceTypeConfig[]
  insuranceCompanies: CatalogItem[]
}

// Recibe key={id} del padre — se remonta entero al cambiar de póliza, así
// que form/lines pueden inicializarse directo desde `policy` sin useEffect.
function PolicyEditForm({
  policy, producers, allAssets, companies, costCenters, insuranceTypes, insuranceCompanies,
}: PolicyEditFormProps) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<PolicyForm>({
    policyNumber: policy.policyNumber,
    insuranceCompany: policy.insuranceCompany,
    producerId: policy.producerId,
    startDate: policy.startDate,
    endDate: policy.endDate,
    description: policy.description,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof PolicyForm, string>>>({})
  const [lines, setLines] = useState<CoverageLineForm[]>(() => (policy.coverages ?? []).map(coverageToLine))
  const [lineErrors, setLineErrors] = useState<Record<string, LineErrors>>({})
  // Línea persistida sobre la que se abrió el modal de baja histórica —
  // guarda tanto el PolicyCoverage original (lo que necesita el modal) como
  // el formId local (para sacarla de `lines` cuando la baja se confirma).
  const [deactivateTarget, setDeactivateTarget] = useState<{ formId: string; coverage: PolicyCoverage } | null>(null)

  const updatePolicyMutation = useMutation({
    mutationFn: (input: Parameters<typeof policiesApi.update>[1]) => policiesApi.update(id!, input),
  })
  const replaceCoveragesMutation = useMutation({
    mutationFn: (coverages: PolicyCoverageInput[]) => policiesApi.replaceCoverages(id!, coverages),
  })
  // Alta de líneas nuevas (una llamada por línea, en paralelo) — no encaja
  // en un único useMutation porque la cantidad de llamadas varía por submit.
  const [isAddingCoverages, setIsAddingCoverages] = useState(false)

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

  // Solo para líneas nuevas todavía sin guardar (sin coverageId) — una línea
  // persistida NUNCA se saca así, ver requestDeactivate().
  function removeLine(formId: string) {
    setLines((prev) => prev.filter((l) => l.formId !== formId))
  }

  // Línea persistida: abre el modal de baja histórica en vez de tocar el
  // estado local — la baja se confirma contra el backend (POST .../de-baja),
  // nunca se asume acá.
  function requestDeactivate(line: CoverageLineForm) {
    const original = (policy.coverages ?? []).find((c) => c.id === line.coverageId)
    if (!original) return
    setDeactivateTarget({ formId: line.formId, coverage: original })
  }

  // Al confirmarse la baja, la línea ya quedó dada de baja en el backend —
  // se saca del set editable de esta pantalla (no vuelve a viajar en el
  // próximo replaceCoverages) y se refresca el detalle.
  function handleDeactivated() {
    if (deactivateTarget) {
      setLines((prev) => prev.filter((l) => l.formId !== deactivateTarget.formId))
    }
    setDeactivateTarget(null)
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
      // effectiveDate solo se valida (y solo se manda) para líneas nuevas —
      // una persistida ya tiene la suya y no se toca desde este formulario.
      if (!line.coverageId) {
        if (!line.effectiveDate) lineErr.effectiveDate = 'Requerido'
        else if (line.effectiveDate < form.startDate || line.effectiveDate > form.endDate) {
          lineErr.effectiveDate = 'Debe estar dentro de la vigencia de la póliza'
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

  function buildCoverageInput(line: CoverageLineForm) {
    const insuranceTypeObj = insuranceTypes.find((t) => t.label === line.insuranceType)
    return {
      assetId: line.association === 'activo' ? line.assetId : null,
      insuranceTypeId: insuranceTypeObj?.id ?? '',
      coverageIds: line.coverageTypes,
      insuredAmount: parseFloat(line.insuredAmount) || 0,
      currency: line.currency,
      exchangeRate: parseFloat(line.exchangeRate) || 0,
      companyId: line.association === 'sin_activo' ? line.companyId : null,
      costCenterId: line.association === 'sin_activo' ? line.costCenterId || null : null,
      beneficiaryDescription: line.association === 'sin_activo' ? line.beneficiaryDescription.trim() || null : null,
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    // Persistidas → replaceCoverages (solo edita campos, nunca alta/baja).
    // Nuevas → addCoverage, una por una, con su propia fecha de alta — este
    // es el único camino que hoy respeta effectiveDate; replaceCoverages
    // sigue completándolo con policy.startDate por compatibilidad vieja.
    const existingLines = lines.filter((l) => l.coverageId)
    const newLines = lines.filter((l) => !l.coverageId)

    const coverages: PolicyCoverageInput[] = existingLines.map((line) => ({
      id: line.coverageId,
      ...buildCoverageInput(line),
    }))

    try {
      await updatePolicyMutation.mutateAsync({
        producerId: form.producerId || undefined,
        insuredName: form.insuranceCompany,
        startDate: form.startDate,
        endDate: form.endDate,
        description: form.description.trim() || undefined,
      })
      if (coverages.length > 0) {
        await replaceCoveragesMutation.mutateAsync(coverages)
      }
      if (newLines.length > 0) {
        setIsAddingCoverages(true)
        await Promise.all(
          newLines.map((line) => policiesApi.addCoverage(id!, { ...buildCoverageInput(line), effectiveDate: line.effectiveDate })),
        )
      }

      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      queryClient.invalidateQueries({ queryKey: policyKeys.detail(id!) })
      queryClient.invalidateQueries({ queryKey: policyKeys.coverages(id!) })
      toast.success('Póliza actualizada correctamente')
      navigate(`/insurance/policies/${id}`)
    } catch {
      // errors are shown via the global axios interceptor toast
    } finally {
      setIsAddingCoverages(false)
    }
  }

  const isSaving = updatePolicyMutation.isPending || replaceCoveragesMutation.isPending || isAddingCoverages

  return (
    <>
      {deactivateTarget && (
        <DeactivateCoverageModal
          policyId={id!}
          policyEndDate={form.endDate}
          coverage={deactivateTarget.coverage}
          onClose={() => setDeactivateTarget(null)}
          onSuccess={handleDeactivated}
        />
      )}
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
            const amount = parseFloat(line.insuredAmount)
            const rate = parseFloat(line.exchangeRate)
            const equivalentAmount =
              !isNaN(amount) && !isNaN(rate) && rate > 0
                ? (line.currency === 'ARS' ? amount / rate : amount * rate)
                : null
            const isAP = line.coverageTypes.length > 0 && line.insuranceType.toLowerCase().includes('personal')
            const showBeneficiaryField = isAP && line.association === 'sin_activo'
            const selectedAsset = activeAssets.find((a) => a.id === line.assetId)
            const isAssetLocked = !!line.coverageId && line.attachmentsCount > 0
            // Baja YA efectiva (no solo programada) — la línea es historial:
            // todos sus campos quedan de solo lectura. Mismo criterio que
            // PolicyDetailPage/PolicyAttachmentsSection (isExpired sobre bajaDate).
            const isEffectivelyDeBaja = !!line.bajaDate && isExpired(line.bajaDate)
            const fieldsDisabled = isAssetLocked || isEffectivelyDeBaja

            return (
              <SectionCard
                key={line.formId}
                title={`Línea ${idx + 1}${selectedAsset ? ` — ${selectedAsset.name}` : ''}`}
                subtitle={line.association === 'sin_activo' ? 'Sin activo asociado' : undefined}
                actions={
                  !line.coverageId ? (
                    // Todavía no existe en el backend — sí se puede sacar del
                    // estado local sin más trámite.
                    <button
                      type="button"
                      onClick={() => removeLine(line.formId)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Quitar esta línea (todavía no guardada)"
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : line.bajaDate ? (
                    // Ya tiene una baja registrada (efectiva o programada) —
                    // no se puede volver a dar de baja, solo se informa.
                    <span
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-400"
                      title="Esta línea ya tiene una baja registrada"
                    >
                      <History size={13} />
                      {isEffectivelyDeBaja ? 'Dada de baja' : 'Baja programada'}
                    </span>
                  ) : (
                    // Persistida y vigente — la única salida es la baja
                    // histórica, nunca un borrado silencioso.
                    <button
                      type="button"
                      onClick={() => requestDeactivate(line)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      title="Dar de baja esta línea de la póliza"
                    >
                      <ShieldOff size={15} />
                    </button>
                  )
                }
              >
                <div className="space-y-5">
                  {/* Línea dada de baja efectiva: historial de solo lectura —
                      se avisa arriba de todo, antes de cualquier campo. */}
                  {isEffectivelyDeBaja && (
                    <div className="flex items-start gap-2.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      <History size={15} className="text-slate-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">
                          Dado de baja — línea de historial, de solo lectura
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Baja: {formatDate(line.bajaDate)}
                          {line.bajaReason && <> · Motivo: {line.bajaReason}</>}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Asociación */}
                  <div>
                    <div className="flex items-center gap-1 mb-3 bg-slate-100 rounded-lg p-1 w-fit">
                      {(['activo', 'sin_activo'] as AssociationType[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          disabled={fieldsDisabled}
                          onClick={() => updateLine(line.formId, {
                            association: opt, assetId: '', companyId: '', costCenterId: '', beneficiaryDescription: '',
                          })}
                          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
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
                          disabled={fieldsDisabled}
                          placeholder="Seleccionar activo…"
                          searchPlaceholder="Buscar por nombre, código, patente, bien de uso…"
                        />
                        {isAssetLocked && !isEffectivelyDeBaja && (
                          <p className="text-xs text-slate-500 mt-1">
                            No se puede cambiar el activo de esta cobertura porque ya tiene adjuntos cargados. Para cambiar el activo, eliminá primero los adjuntos de esta cobertura o creá una nueva línea de cobertura.
                          </p>
                        )}
                      </FormField>
                    ) : (
                      <div className="space-y-4">
                        <FormSection title="">
                          <FormField label="Empresa" required error={err.companyId}>
                            <FormSelect
                              value={line.companyId}
                              onChange={(e) => updateLine(line.formId, { companyId: e.target.value })}
                              disabled={fieldsDisabled}
                              required
                            >
                              <option value="">Seleccionar empresa…</option>
                              {activeCompanies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </FormSelect>
                          </FormField>
                          <FormField label="Centro de Costo" required error={err.costCenterId}>
                            <FormSelect
                              value={line.costCenterId}
                              onChange={(e) => updateLine(line.formId, { costCenterId: e.target.value })}
                              disabled={fieldsDisabled || !line.companyId}
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
                              disabled={fieldsDisabled}
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

                  {/* Fecha de alta en póliza — editable solo en líneas nuevas;
                      una persistida ya tiene la suya y este formulario no
                      tiene forma de modificarla (ver buildCoverageInput). */}
                  <div className="border-t border-slate-100 pt-5">
                    <FormField
                      label="Fecha de Alta en Póliza"
                      required={!line.coverageId}
                      error={err.effectiveDate}
                      helperText={line.coverageId ? 'No se puede modificar una vez guardada la línea' : undefined}
                    >
                      <FormInput
                        type="date"
                        value={line.effectiveDate}
                        min={form.startDate}
                        max={form.endDate}
                        disabled={!!line.coverageId}
                        onChange={(e) => updateLine(line.formId, { effectiveDate: e.target.value })}
                      />
                    </FormField>
                  </div>

                  {/* Tipo de seguro + coberturas */}
                  <div className="border-t border-slate-100 pt-5">
                    <FormField label="Tipo de Seguro" required error={err.insuranceType}>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <FormSelect
                            value={line.insuranceType}
                            onChange={(e) => updateLine(line.formId, { insuranceType: e.target.value, coverageTypes: [] })}
                            disabled={isEffectivelyDeBaja}
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
                        disabled={isEffectivelyDeBaja}
                      />
                    </div>
                  </div>

                  {/* Importes */}
                  <div className="border-t border-slate-100 pt-5">
                    <p className="text-sm font-semibold text-slate-800 mb-3">Suma Asegurada</p>
                    <FormSection title="">
                      <FormField label="Moneda">
                        <FormSelect
                          value={line.currency}
                          onChange={(e) => updateLine(line.formId, { currency: e.target.value as 'ARS' | 'USD' })}
                          disabled={isEffectivelyDeBaja}
                        >
                          {CURRENCY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </FormSelect>
                      </FormField>
                      <FormField label={`Suma Asegurada (${line.currency})`}>
                        <FormInput
                          type="number" placeholder="Ej: 30000000" min="0" step="1"
                          value={line.insuredAmount}
                          onChange={(e) => updateLine(line.formId, { insuredAmount: e.target.value })}
                          disabled={isEffectivelyDeBaja}
                        />
                      </FormField>
                      <FormField label="Tipo de Cambio (ARS/USD)">
                        <FormInput
                          type="number" placeholder="Ej: 970" min="0" step="0.01"
                          value={line.exchangeRate}
                          onChange={(e) => updateLine(line.formId, { exchangeRate: e.target.value })}
                          disabled={isEffectivelyDeBaja}
                        />
                      </FormField>
                      <FormField label={`Suma Asegurada (${equivalentCurrencyLabel})`}>
                        <FormInput
                          value={equivalentAmount != null
                            ? formatCurrencyFull(equivalentAmount, equivalentCurrencyLabel)
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
                      <PolicyAttachmentsSection
                        policyId={policy.id}
                        coverageId={line.coverageId}
                        policyEndDate={form.endDate}
                        readOnly={isEffectivelyDeBaja}
                      />
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
    </>
  )
}
