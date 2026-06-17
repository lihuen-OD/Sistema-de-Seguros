import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ShieldAlert, TriangleAlert, ArrowLeftRight,
  Car, Lock, Package, Flame, CloudRain, Wheat, Waves, Wrench,
  Zap, Settings, Scale, Heart, Activity, HelpCircle,
  CheckCircle2, AlertTriangle, type LucideIcon,
} from 'lucide-react'
import clsx from 'clsx'
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
import { claimRepository } from '../../services/repositories/claim.repository'
import { policyRepository } from '../../services/repositories/policy.repository'
import { mockAssets } from '../../data/mock-assets'
import {
  CLAIM_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
  INSURANCE_COMPANIES,
  INSURANCE_TYPE_CLAIM_COVERAGE,
} from '../../shared/constants'
import type { Claim, ClaimStatus, ClaimType, Currency } from '../../shared/types'

// ─── Claim type card config ───────────────────────────────────────────────────

type ClaimTypeConfig = { key: ClaimType; Icon: LucideIcon }

const CLAIM_TYPE_CONFIG: ClaimTypeConfig[] = [
  { key: 'accidente',           Icon: Car },
  { key: 'robo',                Icon: Lock },
  { key: 'hurto',               Icon: Package },
  { key: 'incendio',            Icon: Flame },
  { key: 'granizo',             Icon: CloudRain },
  { key: 'granizo_cosecha',     Icon: Wheat },
  { key: 'inundacion',          Icon: Waves },
  { key: 'daños',               Icon: Wrench },
  { key: 'daños_electricos',    Icon: Zap },
  { key: 'rotura_mecanica',     Icon: Settings },
  { key: 'responsabilidad_civil', Icon: Scale },
  { key: 'muerte_accidental',   Icon: Heart },
  { key: 'incapacidad',         Icon: Activity },
  { key: 'otro',                Icon: HelpCircle },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormErrors {
  claimType?: string
  occurrenceDate?: string
  reportDate?: string
  description?: string
  insuranceCompany?: string
  claimedAmount?: string
  exchangeRate?: string
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClaimNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const preselectedAssetId = searchParams.get('assetId') ?? ''
  const preselectedPolicyId = searchParams.get('policyId') ?? ''
  const preselectedAsset = preselectedAssetId
    ? mockAssets.find((a) => a.id === preselectedAssetId) ?? null
    : null

  // Identity
  const [assetId, setAssetId] = useState(preselectedAssetId)
  const [policyId, setPolicyId] = useState(preselectedPolicyId)
  const [claimType, setClaimType] = useState<ClaimType | ''>('')
  const [status, setStatus] = useState<ClaimStatus>('denunciado')
  const [occurrenceDate, setOccurrenceDate] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [description, setDescription] = useState('')
  const [insuranceCompany, setInsuranceCompany] = useState('')

  // Amounts + currency
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [exchangeRate, setExchangeRate] = useState('')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [realAmount, setRealAmount] = useState('')
  const [settledAmount, setSettledAmount] = useState('')
  const [deductible, setDeductible] = useState('')

  const [observations, setObservations] = useState('')
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitting, setSubmitting] = useState(false)

  // Derived
  const selectedAsset = assetId ? mockAssets.find((a) => a.id === assetId) ?? null : null
  const availablePolicies = assetId ? policyRepository.findByAsset(assetId) : []
  const selectedPolicy = policyId ? availablePolicies.find((p) => p.id === policyId) ?? null : null

  const tc = parseFloat(exchangeRate) || 0
  const toArs = (val: string) => {
    const n = parseFloat(val) || 0
    return currency === 'USD' && tc > 0 ? n * tc : n
  }

  const claimedAmountArs = toArs(claimedAmount)
  const equivalentClaimedAmount =
    currency === 'ARS' && tc > 0
      ? claimedAmountArs / tc
      : currency === 'USD' && tc > 0
        ? claimedAmountArs / tc
        : 0

  const mainPrefix = currency === 'USD' ? 'US$' : 'AR$'
  const altPrefix = currency === 'USD' ? 'AR$' : 'US$'
  const altAmount = currency === 'USD' ? claimedAmountArs : equivalentClaimedAmount

  // Coverage logic
  const coveredTypes: string[] = selectedPolicy
    ? (INSURANCE_TYPE_CLAIM_COVERAGE[selectedPolicy.insuranceType] ?? [])
    : []
  const selectedTypeCovered = claimType ? coveredTypes.includes(claimType) : null
  const noCoverageWarning = claimType && selectedPolicy && selectedTypeCovered === false

  const handleAssetChange = (id: string) => {
    setAssetId(id)
    setPolicyId('')
    setInsuranceCompany('')
  }

  const handlePolicyChange = (id: string) => {
    setPolicyId(id)
    const pol = availablePolicies.find((p) => p.id === id)
    if (pol) setInsuranceCompany(pol.insuranceCompany)
    else setInsuranceCompany('')
  }

  const validate = (): boolean => {
    const e: FormErrors = {}
    if (!claimType) e.claimType = 'Seleccioná el tipo de siniestro.'
    if (!occurrenceDate) e.occurrenceDate = 'Ingresá la fecha del hecho.'
    if (!reportDate) e.reportDate = 'Ingresá la fecha de denuncia.'
    if (!description.trim()) e.description = 'Ingresá una descripción del hecho.'
    if (!insuranceCompany.trim()) e.insuranceCompany = 'Ingresá la compañía aseguradora.'
    if (!claimedAmount || isNaN(Number(claimedAmount)) || Number(claimedAmount) < 0)
      e.claimedAmount = 'Ingresá un monto reclamado válido.'
    if (currency === 'USD' && (!exchangeRate || parseFloat(exchangeRate) <= 0))
      e.exchangeRate = 'Ingresá el tipo de cambio.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    setSubmitting(true)

    const claim: Claim = {
      id: `claim-${Date.now()}`,
      assetId: assetId || '',
      policyId: policyId || null,
      claimNumber: `SIN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      claimType: claimType as ClaimType,
      occurrenceDate,
      reportDate,
      description: description.trim(),
      insuranceCompany: insuranceCompany.trim(),
      status,
      currency,
      exchangeRate: tc || undefined,
      claimedAmountArs: toArs(claimedAmount),
      realAmountArs: realAmount ? toArs(realAmount) : null,
      settledAmountArs: settledAmount ? toArs(settledAmount) : null,
      deductibleArs: deductible ? toArs(deductible) : null,
      observations: observations.trim() || null,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    }

    claimRepository.create(claim)
    navigate(`/claims/${claim.id}`)
  }

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Siniestro"
        subtitle="Registrá un siniestro asociado a un activo o póliza"
        backTo="/claims"
        backLabel="Volver a siniestros"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Main: 2/3 ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Sección 1: Activo y Póliza */}
          <SectionCard title="Activo y Póliza" subtitle="Asociá el siniestro a un bien asegurado">
            <FormSection title="">
              {/* Activo */}
              <FormField label="Activo asociado">
                {preselectedAsset ? (
                  <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-blue-800">{preselectedAsset.name}</p>
                      <p className="text-xs text-blue-600">{preselectedAsset.internalCode} · {preselectedAsset.assetType}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setAssetId(''); setPolicyId(''); setInsuranceCompany('') }}
                      className="text-xs text-blue-500 hover:text-blue-700 ml-3 flex-shrink-0"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <FormSelect value={assetId} onChange={(e) => handleAssetChange(e.target.value)}>
                    <option value="">Sin activo asociado</option>
                    {mockAssets.map((a) => (
                      <option key={a.id} value={a.id}>{a.internalCode} — {a.name}</option>
                    ))}
                  </FormSelect>
                )}
              </FormField>

              {/* Póliza */}
              <FormField label="Póliza asociada">
                {availablePolicies.length > 0 ? (
                  <>
                    <FormSelect value={policyId} onChange={(e) => handlePolicyChange(e.target.value)}>
                      <option value="">Sin póliza asociada</option>
                      {availablePolicies.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.policyNumber} — {p.insuranceType}
                        </option>
                      ))}
                    </FormSelect>
                    {selectedPolicy && (
                      <p className="text-xs text-slate-500 mt-1">
                        {selectedPolicy.coverageType} · Vigencia: {selectedPolicy.endDate}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <TriangleAlert size={13} className="text-slate-400 flex-shrink-0" />
                    <p className="text-xs text-slate-500">
                      {assetId ? 'Sin pólizas asociadas al activo.' : 'Seleccioná un activo primero.'}
                    </p>
                  </div>
                )}
              </FormField>
            </FormSection>

            {/* Coverage chips when policy selected */}
            {selectedPolicy && coveredTypes.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                  Coberturas de {selectedPolicy.insuranceType}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {coveredTypes.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
                      <CheckCircle2 size={9} />
                      {CLAIM_TYPE_LABELS[t] ?? t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Sección 2: Tipo de siniestro */}
          <SectionCard
            title="Tipo de Siniestro"
            subtitle={
              selectedPolicy
                ? `Tipos cubiertos por ${selectedPolicy.insuranceType} marcados en verde`
                : 'Seleccioná la naturaleza del siniestro'
            }
          >
            {errors.claimType && (
              <p className="text-xs text-red-500 mb-3">{errors.claimType}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {CLAIM_TYPE_CONFIG.map(({ key, Icon }) => {
                const isCovered = selectedPolicy ? coveredTypes.includes(key) : null
                const isSelected = claimType === key
                const label = CLAIM_TYPE_LABELS[key]

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setClaimType(key)
                      if (errors.claimType) setErrors((p) => ({ ...p, claimType: undefined }))
                    }}
                    className={clsx(
                      'relative flex flex-col items-start gap-2 p-3 rounded-xl border text-left transition-all',
                      isSelected
                        ? 'bg-blue-50 border-blue-400 ring-1 ring-blue-300 shadow-sm'
                        : isCovered === false
                          ? 'bg-white border-slate-200 hover:border-slate-300 opacity-60 hover:opacity-80'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div className={clsx(
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                      isSelected ? 'bg-blue-100' : isCovered ? 'bg-emerald-50' : 'bg-slate-100',
                    )}>
                      <Icon
                        size={14}
                        className={isSelected ? 'text-blue-600' : isCovered ? 'text-emerald-600' : 'text-slate-500'}
                      />
                    </div>
                    <span className={clsx(
                      'text-xs font-medium leading-tight',
                      isSelected ? 'text-blue-700' : 'text-slate-700',
                    )}>
                      {label}
                    </span>
                    {isCovered !== null && (
                      <span className={clsx(
                        'text-[10px] font-semibold leading-none',
                        isCovered ? 'text-emerald-600' : 'text-slate-400',
                      )}>
                        {isCovered ? '✓ Cubierto' : '✗ Sin cobertura'}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* No-coverage warning */}
            {noCoverageWarning && (
              <div className="mt-3 flex items-start gap-2.5 px-3.5 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 leading-relaxed">
                  <strong>{CLAIM_TYPE_LABELS[claimType as ClaimType]}</strong> podría no estar cubierto por{' '}
                  <strong>{selectedPolicy?.insuranceType}</strong>. Verificá la cobertura con{' '}
                  {selectedPolicy?.insuranceCompany} antes de continuar.
                </p>
              </div>
            )}
          </SectionCard>

          {/* Sección 3: Datos del hecho */}
          <SectionCard title="Datos del Hecho" subtitle="Fechas y descripción del siniestro">
            <FormSection title="">
              <FormField label="Fecha del hecho" required error={errors.occurrenceDate}>
                <FormInput
                  type="date"
                  value={occurrenceDate}
                  onChange={(e) => { setOccurrenceDate(e.target.value); setErrors((p) => ({ ...p, occurrenceDate: undefined })) }}
                />
              </FormField>

              <FormField label="Fecha de denuncia" required error={errors.reportDate}>
                <FormInput
                  type="date"
                  value={reportDate}
                  onChange={(e) => { setReportDate(e.target.value); setErrors((p) => ({ ...p, reportDate: undefined })) }}
                />
              </FormField>

              <FormField label="Estado inicial">
                <FormSelect value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus)}>
                  {(Object.entries(CLAIM_STATUS_LABELS) as [ClaimStatus, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </FormSelect>
              </FormField>
            </FormSection>

            <div className="mt-4">
              <FormField label="Descripción del hecho" required error={errors.description}>
                <FormTextarea
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })) }}
                  rows={4}
                  placeholder="Describí qué ocurrió, cómo y dónde. Incluí detalles relevantes para el trámite."
                />
              </FormField>
            </div>
          </SectionCard>

          {/* Sección 4: Aseguradora */}
          <SectionCard title="Aseguradora" subtitle="Compañía a la que se reporta el siniestro">
            <FormSection title="">
              <FormField label="Compañía aseguradora" required error={errors.insuranceCompany}>
                <FormSelect
                  value={insuranceCompany}
                  onChange={(e) => { setInsuranceCompany(e.target.value); setErrors((p) => ({ ...p, insuranceCompany: undefined })) }}
                >
                  <option value="">Seleccioná una aseguradora</option>
                  {INSURANCE_COMPANIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </FormSelect>
              </FormField>
            </FormSection>
          </SectionCard>

          {/* Sección 5: Importes */}
          <SectionCard title="Importes" subtitle="Moneda, tipo de cambio y montos del siniestro">
            <FormSection title="">
              <FormField label="Moneda">
                <FormSelect value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                  <option value="ARS">ARS — Pesos Argentinos</option>
                  <option value="USD">USD — Dólares</option>
                </FormSelect>
              </FormField>

              <FormField label="Tipo de Cambio (ARS/USD)" required={currency === 'USD'} error={errors.exchangeRate}>
                <FormInput
                  type="number"
                  placeholder="Ej: 1150"
                  value={exchangeRate}
                  onChange={(e) => { setExchangeRate(e.target.value); setErrors((p) => ({ ...p, exchangeRate: undefined })) }}
                  min="0.01"
                  step="0.01"
                  disabled={currency === 'ARS' && !exchangeRate}
                />
                {currency === 'ARS' && (
                  <p className="text-xs text-slate-400 mt-0.5">Opcional para mostrar equivalente en USD</p>
                )}
              </FormField>

              <FormField label={`Monto reclamado (${mainPrefix})`} required error={errors.claimedAmount}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={claimedAmount}
                  onChange={(e) => { setClaimedAmount(e.target.value); setErrors((p) => ({ ...p, claimedAmount: undefined })) }}
                />
              </FormField>

              <FormField label={`Valor real del siniestro (${mainPrefix})`}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={realAmount}
                  onChange={(e) => setRealAmount(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-0.5">El daño real puede superar el límite cubierto</p>
              </FormField>

              <FormField label={`Monto liquidado (${mainPrefix})`}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={settledAmount}
                  onChange={(e) => setSettledAmount(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-0.5">Completar cuando la aseguradora apruebe</p>
              </FormField>

              <FormField label={`Franquicia (${mainPrefix})`}>
                <FormInput
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={deductible}
                  onChange={(e) => setDeductible(e.target.value)}
                />
              </FormField>
            </FormSection>

            {/* Equivalente */}
            {claimedAmountArs > 0 && tc > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reclamado</span>
                  <span className="text-sm font-bold text-slate-800 tabular-nums">
                    {mainPrefix}{' '}
                    {(parseFloat(claimedAmount) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-blue-500 uppercase tracking-wider">
                    <ArrowLeftRight size={11} />
                    Equivalente
                  </span>
                  <span className="text-sm font-bold text-blue-700 tabular-nums">
                    {altPrefix}{' '}
                    {altAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            )}
          </SectionCard>

          {/* Sección 6: Documentación */}
          <SectionCard title="Documentación Adjunta" subtitle="Denuncias, peritajes, facturas de reparación (PDF, Word)">
            <FileDropzone
              label="Adjuntá documentos del siniestro (denuncia policial, peritaje, presupuestos)"
              accept=".pdf,.doc,.docx,.xls,.xlsx"
              maxFiles={10}
            />
          </SectionCard>

          {/* Sección 7: Fotos y Videos */}
          <SectionCard title="Fotos y Videos" subtitle="Evidencia fotográfica y audiovisual del daño">
            <FileDropzone
              label="Adjuntá fotos y videos del siniestro (JPG, PNG, MP4, MOV)"
              accept=".jpg,.jpeg,.png,.gif,.mp4,.mov,.avi,.webm"
              maxFiles={20}
            />
          </SectionCard>

          {/* Sección 8: Observaciones */}
          <SectionCard title="Observaciones">
            <FormTextarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Notas internas, estado de gestión, contactos en la aseguradora, próximos pasos, etc."
            />
          </SectionCard>
        </div>

        {/* ── Sidebar: 1/3 ──────────────────────────────────────────────────── */}
        <div className="space-y-4">

          {/* Resumen */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow label="Tipo" value={claimType ? (CLAIM_TYPE_LABELS[claimType] ?? claimType) : '—'} />
              <SummaryRow label="Estado" value={CLAIM_STATUS_LABELS[status]} />
              <SummaryRow label="Activo" value={selectedAsset?.internalCode ?? '—'} />
              <SummaryRow label="Póliza" value={selectedPolicy?.policyNumber ?? '—'} />
              <SummaryRow label="Aseguradora" value={insuranceCompany || '—'} />
              <SummaryRow
                label={`Reclamado (${mainPrefix})`}
                value={claimedAmount ? `${mainPrefix} ${(parseFloat(claimedAmount) || 0).toLocaleString('es-AR')}` : '—'}
              />
              {realAmount && (
                <SummaryRow
                  label={`Valor real (${mainPrefix})`}
                  value={`${mainPrefix} ${(parseFloat(realAmount) || 0).toLocaleString('es-AR')}`}
                />
              )}
              {claimedAmountArs > 0 && tc > 0 && (
                <SummaryRow
                  label={`Equiv. ${altPrefix}`}
                  value={`${altPrefix} ${altAmount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`}
                />
              )}
            </div>
          </SectionCard>

          {/* Coverage banner */}
          {selectedPolicy && (
            <div className={clsx(
              'flex items-start gap-3 px-4 py-3.5 rounded-xl border',
              noCoverageWarning
                ? 'bg-amber-50 border-amber-200'
                : selectedTypeCovered
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-slate-50 border-slate-200',
            )}>
              {noCoverageWarning ? (
                <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" />
              ) : selectedTypeCovered ? (
                <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
              ) : (
                <ShieldAlert size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={clsx(
                  'text-xs font-semibold mb-0.5',
                  noCoverageWarning ? 'text-amber-800' : selectedTypeCovered ? 'text-emerald-800' : 'text-slate-700',
                )}>
                  {noCoverageWarning
                    ? 'Posible falta de cobertura'
                    : selectedTypeCovered
                      ? 'Tipo cubierto por la póliza'
                      : `Cobertura: ${selectedPolicy.insuranceType}`}
                </p>
                <p className={clsx(
                  'text-xs leading-relaxed',
                  noCoverageWarning ? 'text-amber-700' : 'text-slate-500',
                )}>
                  {noCoverageWarning
                    ? `Verificá la cobertura antes de continuar el trámite.`
                    : selectedTypeCovered
                      ? `Este tipo está incluido en ${selectedPolicy.insuranceType}.`
                      : 'Seleccioná un tipo de siniestro para ver la cobertura.'}
                </p>
              </div>
            </div>
          )}

          {/* Hint */}
          <div className="flex items-start gap-3 px-4 py-3.5 bg-blue-50 border border-blue-100 rounded-xl">
            <ShieldAlert size={14} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700 leading-relaxed">
              El número de siniestro se genera automáticamente. Podés actualizarlo luego con el número asignado por la aseguradora.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors"
            >
              Registrar siniestro
            </button>
            <button
              type="button"
              onClick={() => navigate('/claims')}
              className="w-full px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </PageContent>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-800 text-right break-words">{value}</span>
    </div>
  )
}
