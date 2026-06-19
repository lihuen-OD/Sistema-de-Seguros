import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { claimsApi } from '../../shared/api/claims.api'
import {
  CLAIM_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
  INSURANCE_COMPANIES,
} from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { ClaimStatus, ClaimType, Currency } from '../../shared/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = Object.entries(CLAIM_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))
const TYPE_OPTIONS = Object.entries(CLAIM_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))
const COMPANY_OPTIONS = INSURANCE_COMPANIES.map((c) => ({ value: c, label: c }))
const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'Pesos argentinos (ARS)' },
  { value: 'USD', label: 'Dólares estadounidenses (USD)' },
]

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300 transition-colors'

const selectCls =
  'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors'

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClaimEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: original, isLoading, isError } = useQuery({
    queryKey: ['claims', id],
    queryFn: () => claimsApi.findById(id!),
    enabled: !!id,
  })

  // ── Form state ──────────────────────────────────────────────────────────────

  const [status, setStatus] = useState<ClaimStatus>('denunciado')
  const [claimType, setClaimType] = useState<string>('')
  const [occurrenceDate, setOccurrenceDate] = useState('')
  const [reportDate, setReportDate] = useState('')
  const [insuranceCompany, setInsuranceCompany] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [exchangeRate, setExchangeRate] = useState('')
  const [claimedAmount, setClaimedAmount] = useState('')
  const [realAmount, setRealAmount] = useState('')
  const [settledAmount, setSettledAmount] = useState('')
  const [deductible, setDeductible] = useState('')
  const [observations, setObservations] = useState('')

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Seed form once data loads
  useEffect(() => {
    if (!original) return
    setStatus(original.status)
    setClaimType(original.claimType)
    setOccurrenceDate(original.occurrenceDate)
    setReportDate(original.reportDate)
    setInsuranceCompany(original.insuranceCompany)
    setDescription(original.description)
    setCurrency(original.currency ?? 'ARS')
    setExchangeRate(original.exchangeRate != null ? original.exchangeRate.toString() : '')
    setClaimedAmount(original.claimedAmountArs > 0 ? original.claimedAmountArs.toString() : '')
    setRealAmount(original.realAmountArs != null ? original.realAmountArs.toString() : '')
    setSettledAmount(original.settledAmountArs != null ? original.settledAmountArs.toString() : '')
    setDeductible(original.deductibleArs != null ? original.deductibleArs.toString() : '')
    setObservations(original.observations ?? '')
  }, [original])

  if (isLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-20">
          <p className="text-sm text-slate-400">Cargando siniestro…</p>
        </div>
      </PageContent>
    )
  }

  if (isError || !original) {
    return (
      <PageContent>
        <ErrorState
          title="Siniestro no encontrado"
          description="El siniestro que intentás editar no existe o fue eliminado."
          action={
            <button
              onClick={() => navigate(ROUTES.CLAIMS)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <ArrowLeft size={15} />
              Volver a siniestros
            </button>
          }
        />
      </PageContent>
    )
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const validate = () => {
    const e: Record<string, string> = {}
    if (!occurrenceDate) e.occurrenceDate = 'Requerido'
    if (!reportDate) e.reportDate = 'Requerido'
    if (!claimedAmount || isNaN(parseFloat(claimedAmount))) e.claimedAmount = 'Ingresá un monto válido'
    if (!description.trim()) e.description = 'Requerido'
    if (currency === 'USD' && (!exchangeRate || isNaN(parseFloat(exchangeRate)))) {
      e.exchangeRate = 'Ingresá el tipo de cambio'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)

    try {
      await claimsApi.update(original.id, {
        status,
        claimType: claimType as ClaimType,
        occurrenceDate,
        reportDate,
        insuranceCompany,
        description,
        currency,
        claimedAmountArs: parseFloat(claimedAmount),
      })
      queryClient.invalidateQueries({ queryKey: ['claims'] })
      navigate(ROUTES.CLAIMS_DETAIL(original.id))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageContent>
      <PageHeader
        title={`Editar ${original.claimNumber}`}
        subtitle="Modificar datos del siniestro · Los cambios generan eventos en el historial"
        category="Siniestro"
        backTo={ROUTES.CLAIMS_DETAIL(original.id)}
        backLabel="Volver al siniestro"
      />

      <form onSubmit={handleSubmit} noValidate>
        <div className="space-y-5">

          {/* Estado y tipo */}
          <SectionCard title="Estado y clasificación">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Estado del siniestro" required>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ClaimStatus)}
                  className={selectCls}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Tipo de siniestro" required>
                <select
                  value={claimType}
                  onChange={(e) => setClaimType(e.target.value)}
                  className={selectCls}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Compañía aseguradora" required>
                <select
                  value={insuranceCompany}
                  onChange={(e) => setInsuranceCompany(e.target.value)}
                  className={selectCls}
                >
                  {COMPANY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Fecha del hecho" required>
                <input
                  type="date"
                  value={occurrenceDate}
                  onChange={(e) => setOccurrenceDate(e.target.value)}
                  className={inputCls}
                />
                {errors.occurrenceDate && (
                  <p className="mt-1 text-xs text-red-500">{errors.occurrenceDate}</p>
                )}
              </Field>

              <Field label="Fecha de denuncia" required>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className={inputCls}
                />
                {errors.reportDate && (
                  <p className="mt-1 text-xs text-red-500">{errors.reportDate}</p>
                )}
              </Field>
            </div>
          </SectionCard>

          {/* Montos */}
          <SectionCard title="Montos del siniestro">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <Field label="Moneda">
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                  className={selectCls}
                >
                  {CURRENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              {currency === 'USD' && (
                <Field label="Tipo de cambio (AR$/USD)" required>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    placeholder="Ej: 1250.00"
                    className={inputCls}
                  />
                  {errors.exchangeRate && (
                    <p className="mt-1 text-xs text-red-500">{errors.exchangeRate}</p>
                  )}
                </Field>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Monto reclamado (ARS)" required>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                {errors.claimedAmount && (
                  <p className="mt-1 text-xs text-red-500">{errors.claimedAmount}</p>
                )}
              </Field>

              <Field label="Valor real del daño (ARS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={realAmount}
                    onChange={(e) => setRealAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Si el daño real supera el monto reclamado
                </p>
              </Field>

              <Field label="Monto liquidado (ARS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={settledAmount}
                    onChange={(e) => setSettledAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Indemnización aprobada por la aseguradora
                </p>
              </Field>

              <Field label="Franquicia (ARS)">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 select-none">
                    AR$
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={deductible}
                    onChange={(e) => setDeductible(e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  Deducible a cargo del asegurado
                </p>
              </Field>
            </div>
          </SectionCard>

          {/* Descripción */}
          <SectionCard title="Descripción y observaciones">
            <div className="space-y-4">
              <Field label="Descripción del hecho" required>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Descripción detallada del siniestro…"
                  className={`${inputCls} resize-none`}
                />
                {errors.description && (
                  <p className="mt-1 text-xs text-red-500">{errors.description}</p>
                )}
              </Field>

              <Field label="Observaciones internas">
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                  placeholder="Notas internas, seguimiento, próximos pasos…"
                  className={`${inputCls} resize-none`}
                />
              </Field>
            </div>
          </SectionCard>

          {/* Notice */}
          <div className="flex items-start gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <AlertTriangle size={15} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-blue-700">
              Cada cambio significativo genera un evento automático en el historial del siniestro.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.CLAIMS_DETAIL(original.id))}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Save size={15} />
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>

        </div>
      </form>
    </PageContent>
  )
}
