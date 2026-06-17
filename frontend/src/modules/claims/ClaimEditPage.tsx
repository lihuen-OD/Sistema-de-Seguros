import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, AlertTriangle } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { claimRepository } from '../../services/repositories/claim.repository'
import {
  CLAIM_TYPE_LABELS,
  CLAIM_STATUS_LABELS,
  INSURANCE_COMPANIES,
} from '../../shared/constants'
import { ROUTES } from '../../app/routes'
import type { ClaimStatus, ClaimType, ClaimEvent, Currency } from '../../shared/types'

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

  const original = claimRepository.findById(id ?? '')

  if (!original) {
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

  // ── Form state ──────────────────────────────────────────────────────────────

  const [status, setStatus] = useState<ClaimStatus>(original.status)
  const [claimType, setClaimType] = useState<string>(original.claimType)
  const [occurrenceDate, setOccurrenceDate] = useState(original.occurrenceDate)
  const [reportDate, setReportDate] = useState(original.reportDate)
  const [insuranceCompany, setInsuranceCompany] = useState(original.insuranceCompany)
  const [description, setDescription] = useState(original.description)
  const [currency, setCurrency] = useState<Currency>(original.currency ?? 'ARS')
  const [exchangeRate, setExchangeRate] = useState(
    original.exchangeRate != null ? original.exchangeRate.toString() : '',
  )
  const [claimedAmount, setClaimedAmount] = useState(
    original.claimedAmountArs > 0 ? original.claimedAmountArs.toString() : '',
  )
  const [realAmount, setRealAmount] = useState(
    original.realAmountArs != null ? original.realAmountArs.toString() : '',
  )
  const [settledAmount, setSettledAmount] = useState(
    original.settledAmountArs != null ? original.settledAmountArs.toString() : '',
  )
  const [deductible, setDeductible] = useState(
    original.deductibleArs != null ? original.deductibleArs.toString() : '',
  )
  const [observations, setObservations] = useState(original.observations ?? '')

  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)

    const today = new Date().toISOString().split('T')[0]
    const generatedEvents: ClaimEvent[] = []
    const ts = Date.now()

    const newClaimed = parseFloat(claimedAmount)
    const newSettled = settledAmount ? parseFloat(settledAmount) : null
    const newDeductible = deductible ? parseFloat(deductible) : null
    const newReal = realAmount ? parseFloat(realAmount) : null

    // Status change
    if (status !== original.status) {
      generatedEvents.push({
        id: `evt-edit-${ts}-status`,
        claimId: original.id,
        date: today,
        type: 'estado_cambiado',
        description: `Estado actualizado: "${CLAIM_STATUS_LABELS[original.status]}" → "${CLAIM_STATUS_LABELS[status]}".`,
        previousStatus: original.status,
        newStatus: status,
        author: 'Lihuen Segovia',
      })
    }

    // Settled amount (prioritized as liquidacion_registrada when status = liquidado)
    if (newSettled !== original.settledAmountArs && newSettled != null) {
      generatedEvents.push({
        id: `evt-edit-${ts}-settled`,
        claimId: original.id,
        date: today,
        type: status === 'liquidado' ? 'liquidacion_registrada' : 'monto_actualizado',
        description:
          status === 'liquidado'
            ? `Monto liquidado registrado: AR$ ${newSettled.toLocaleString('es-AR')}.`
            : `Monto liquidado actualizado a AR$ ${newSettled.toLocaleString('es-AR')}.`,
        amountLabel: 'Monto liquidado',
        previousAmount: original.settledAmountArs ?? undefined,
        newAmount: newSettled,
        author: 'Lihuen Segovia',
      })
    }

    // Claimed amount change
    if (newClaimed !== original.claimedAmountArs) {
      generatedEvents.push({
        id: `evt-edit-${ts}-claimed`,
        claimId: original.id,
        date: today,
        type: 'monto_actualizado',
        description: `Monto reclamado actualizado de AR$ ${original.claimedAmountArs.toLocaleString('es-AR')} a AR$ ${newClaimed.toLocaleString('es-AR')}.`,
        amountLabel: 'Monto reclamado',
        previousAmount: original.claimedAmountArs,
        newAmount: newClaimed,
        author: 'Lihuen Segovia',
      })
    }

    // Franquicia change
    if (newDeductible !== original.deductibleArs && newDeductible != null) {
      generatedEvents.push({
        id: `evt-edit-${ts}-deductible`,
        claimId: original.id,
        date: today,
        type: 'franquicia_aplicada',
        description: `Franquicia registrada: AR$ ${newDeductible.toLocaleString('es-AR')}.`,
        amountLabel: 'Franquicia',
        previousAmount: original.deductibleArs ?? undefined,
        newAmount: newDeductible,
        author: 'Lihuen Segovia',
      })
    }

    // General field changes
    const otherChanged =
      claimType !== original.claimType ||
      occurrenceDate !== original.occurrenceDate ||
      reportDate !== original.reportDate ||
      insuranceCompany !== original.insuranceCompany ||
      description !== original.description ||
      observations !== (original.observations ?? '') ||
      currency !== (original.currency ?? 'ARS') ||
      (newReal !== original.realAmountArs)

    if (otherChanged) {
      generatedEvents.push({
        id: `evt-edit-${ts}-general`,
        claimId: original.id,
        date: today,
        type: 'siniestro_editado',
        description: 'Datos del siniestro actualizados.',
        author: 'Lihuen Segovia',
      })
    }

    // Save to repository
    claimRepository.update(original.id, {
      status,
      claimType: claimType as ClaimType,
      occurrenceDate,
      reportDate,
      insuranceCompany,
      description,
      currency,
      exchangeRate: exchangeRate ? parseFloat(exchangeRate) : undefined,
      claimedAmountArs: newClaimed,
      realAmountArs: newReal,
      settledAmountArs: newSettled,
      deductibleArs: newDeductible,
      observations: observations.trim() || null,
    })

    for (const event of generatedEvents) {
      claimRepository.addEvent(event)
    }

    navigate(ROUTES.CLAIMS_DETAIL(original.id))
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
