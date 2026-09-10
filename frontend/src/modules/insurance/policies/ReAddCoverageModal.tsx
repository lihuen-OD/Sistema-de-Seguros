import { useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusCircle, Loader2 } from 'lucide-react'
import { Modal } from '../../../shared/components/modals/Modal'
import { FormField, FormInput, FormSelect, FormTextarea } from '../../../shared/components/forms/FormSection'
import { CoverageSelector } from './components/CoverageSelector'
import { policiesApi, policyKeys } from '../../../shared/api/policies.api'
import { insuranceTypeQueries } from '../../../shared/api/insurance-types.api'
import { buildAssetLabel } from '../../../shared/utils/assetMetadata'
import { formatDate } from '../../../shared/utils/format'
import { CURRENCY_OPTIONS } from '../../../shared/constants'
import type { PolicyCoverage, Currency } from '../../../shared/types'

function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

interface ReAddCoverageModalProps {
  policyId: string
  policyStartDate: string
  policyEndDate: string
  /** La línea dada de baja que se va a reincorporar — sirve de plantilla, nunca se modifica. */
  coverage: PolicyCoverage
  onClose: () => void
  onSuccess: (created: PolicyCoverage) => void
}

interface FormState {
  effectiveDate: string
  insuranceType: string
  coverageTypes: string[]
  currency: Currency
  insuredAmount: string
  exchangeRate: string
  beneficiaryDescription: string
}

type FormErrors = Partial<Record<keyof FormState, string>>

// Reincorpora a cobertura un activo dado de baja — crea una línea NUEVA
// (mismo POST /coverages que cualquier alta, ver policies.api.ts#addCoverage)
// precargada desde la línea vieja como plantilla. La línea vieja nunca se
// toca: no se limpia bajaDate/bajaReason/deactivatedAt/deactivatedBy, y no
// existe ningún endpoint "reactivate" — sería conceptualmente incorrecto,
// implicaría modificar la misma fila histórica. assetId queda fijo: la idea
// es reincorporar ESE activo, no elegir otro. Mismo patrón de modal chico +
// mutación + invalidation que DeactivateCoverageModal.tsx.
export function ReAddCoverageModal({
  policyId, policyStartDate, policyEndDate, coverage, onClose, onSuccess,
}: ReAddCoverageModalProps) {
  const queryClient = useQueryClient()
  const { data: insuranceTypes = [] } = useQuery(insuranceTypeQueries.list())

  // Sugerencia de fecha: el día siguiente a la baja anterior (nunca antes del
  // inicio de la póliza) — el backend sigue siendo la fuente de verdad sobre
  // solapamiento, esto es solo una ayuda visual (min del input + valor inicial).
  const suggestedStart = coverage.bajaDate ? addOneDay(coverage.bajaDate) : policyStartDate
  const minDate = suggestedStart > policyStartDate ? suggestedStart : policyStartDate

  const [form, setForm] = useState<FormState>({
    effectiveDate: suggestedStart,
    insuranceType: coverage.insuranceType,
    coverageTypes: coverage.coverageIds ?? [],
    currency: coverage.currency,
    insuredAmount: String(coverage.currency === 'USD' ? coverage.insuredAmountUsd : coverage.insuredAmountArs),
    exchangeRate: String(coverage.exchangeRate),
    beneficiaryDescription: coverage.beneficiaryDescription ?? '',
  })
  const [errors, setErrors] = useState<FormErrors>({})

  const assetLabel = coverage.asset ? buildAssetLabel(coverage.asset) : 'Sin activo asociado'

  // Errores de backend (400/409, ej. solapamiento con otro período de este
  // activo) ya se muestran solos vía el interceptor global de axios — no
  // hace falta un onError acá, y al no cerrar el modal en error, el usuario
  // no pierde lo ya cargado (mismo criterio que DeactivateCoverageModal).
  const mutation = useMutation({
    mutationFn: () => {
      const insuranceTypeObj = insuranceTypes.find((t) => t.label === form.insuranceType)
      return policiesApi.addCoverage(policyId, {
        assetId: coverage.assetId,
        insuranceTypeId: insuranceTypeObj?.id ?? '',
        coverageIds: form.coverageTypes,
        insuredAmount: parseFloat(form.insuredAmount) || 0,
        currency: form.currency,
        exchangeRate: parseFloat(form.exchangeRate) || 0,
        companyId: coverage.companyId ?? null,
        costCenterId: coverage.costCenterId ?? null,
        beneficiaryDescription: form.beneficiaryDescription.trim() || null,
        effectiveDate: form.effectiveDate,
      })
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: policyKeys.all })
      queryClient.invalidateQueries({ queryKey: policyKeys.detail(policyId) })
      queryClient.invalidateQueries({ queryKey: policyKeys.coverages(policyId) })
      toast.success('Activo reincorporado a la cobertura')
      onSuccess(created)
    },
  })

  const handleConfirm = () => {
    const next: FormErrors = {}
    if (!form.effectiveDate) next.effectiveDate = 'Requerido'
    else if (form.effectiveDate < policyStartDate) next.effectiveDate = 'No puede ser anterior al inicio de la póliza'
    else if (form.effectiveDate > policyEndDate) next.effectiveDate = 'No puede ser posterior al vencimiento de la póliza'
    if (!form.insuranceType) next.insuranceType = 'Requerido'
    if (form.coverageTypes.length === 0) next.coverageTypes = 'Seleccioná al menos una cobertura'
    if (!form.exchangeRate || parseFloat(form.exchangeRate) <= 0) next.exchangeRate = 'Requerido'
    if (form.insuredAmount === '' || isNaN(parseFloat(form.insuredAmount)) || parseFloat(form.insuredAmount) < 0) {
      next.insuredAmount = 'Requerido'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return
    mutation.mutate()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={PlusCircle}
      iconClassName="bg-emerald-50 text-emerald-600"
      title="Reincorporar a cobertura"
      description="Se creará un nuevo período de cobertura para este activo. El período anterior quedará guardado como historial."
      closeOnBackdropClick={!mutation.isPending}
      closeOnEscape={!mutation.isPending}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            Reincorporar
          </button>
        </>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto -mx-1 px-1 space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Activo (no editable)</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5">{assetLabel}</p>
          <p className="text-xs text-slate-400 mt-1">
            Período anterior: {formatDate(coverage.effectiveDate)} — {coverage.bajaDate ? formatDate(coverage.bajaDate) : '—'}
          </p>
        </div>

        <FormField label="Nueva fecha de alta" required error={errors.effectiveDate}>
          <FormInput
            type="date"
            value={form.effectiveDate}
            min={minDate}
            max={policyEndDate}
            onChange={(e) => setForm((p) => ({ ...p, effectiveDate: e.target.value }))}
          />
        </FormField>

        <FormField label="Tipo de Seguro" required error={errors.insuranceType}>
          <FormSelect
            value={form.insuranceType}
            onChange={(e) => setForm((p) => ({ ...p, insuranceType: e.target.value, coverageTypes: [] }))}
          >
            <option value="">Seleccionar tipo…</option>
            {insuranceTypes.map((t) => <option key={t.id} value={t.label}>{t.label}</option>)}
          </FormSelect>
        </FormField>

        <FormField label="Coberturas" required error={errors.coverageTypes}>
          <CoverageSelector
            insuranceType={form.insuranceType}
            insuranceTypes={insuranceTypes}
            selected={form.coverageTypes}
            onChange={(v) => setForm((p) => ({ ...p, coverageTypes: v }))}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Moneda">
            <FormSelect
              value={form.currency}
              onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value as Currency }))}
            >
              {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </FormSelect>
          </FormField>
          <FormField label="Tipo de Cambio" required error={errors.exchangeRate}>
            <FormInput
              type="number"
              min="0.01"
              step="0.01"
              value={form.exchangeRate}
              onChange={(e) => setForm((p) => ({ ...p, exchangeRate: e.target.value }))}
            />
          </FormField>
        </div>

        <FormField label="Suma Asegurada" required error={errors.insuredAmount}>
          <FormInput
            type="number"
            min="0"
            step="0.01"
            value={form.insuredAmount}
            onChange={(e) => setForm((p) => ({ ...p, insuredAmount: e.target.value }))}
          />
        </FormField>

        <FormField label="Descripción / Beneficiario">
          <FormTextarea
            rows={2}
            value={form.beneficiaryDescription}
            onChange={(e) => setForm((p) => ({ ...p, beneficiaryDescription: e.target.value }))}
            placeholder="Opcional"
          />
        </FormField>
      </div>
    </Modal>
  )
}
