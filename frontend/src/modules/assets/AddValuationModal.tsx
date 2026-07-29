import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { TrendingUp } from 'lucide-react'
import { Modal } from '../../shared/components/modals/Modal'
import { FormField, FormInput, FormSelect, FormTextarea } from '../../shared/components/forms/FormSection'
import { CURRENCY_OPTIONS } from '../../shared/constants'
import { assetsApi, assetKeys } from '../../shared/api/assets.api'
import type { Currency } from '../../shared/types'

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

interface AddValuationModalProps {
  assetId: string
  type: 'real' | 'nuevo'
  defaultCurrency: Currency
  defaultExchangeRate: number
  onClose: () => void
}

const TYPE_CONFIG = {
  real: { label: 'Valor Patrimonial Real', iconClassName: 'bg-brand-50 text-brand-600' },
  nuevo: { label: 'Valor Patrimonial a Nuevo', iconClassName: 'bg-purple-50 text-purple-600' },
} as const

export function AddValuationModal({ assetId, type, defaultCurrency, defaultExchangeRate, onClose }: AddValuationModalProps) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayISO())
  const [currency, setCurrency] = useState<Currency>(defaultCurrency)
  const [value, setValue] = useState('')
  const [exchangeRate, setExchangeRate] = useState(defaultExchangeRate > 0 ? String(defaultExchangeRate) : '')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ date?: string; value?: string; exchangeRate?: string }>({})
  const [submitting, setSubmitting] = useState(false)

  const config = TYPE_CONFIG[type]
  const equivalentPrefix = currency === 'ARS' ? 'US$' : 'AR$'
  const equivalent = useMemo(() => {
    const amount = parseFloat(value)
    const rate = parseFloat(exchangeRate)
    if (isNaN(amount) || isNaN(rate) || rate <= 0) return ''
    const result = currency === 'ARS' ? amount / rate : amount * rate
    return result.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }, [value, exchangeRate, currency])

  function validate(): boolean {
    const e: typeof errors = {}
    if (!date) e.date = 'Indicá la fecha de valuación.'
    if (!value || parseFloat(value) <= 0) e.value = 'Indicá un valor mayor a 0.'
    if (!exchangeRate || parseFloat(exchangeRate) <= 0) e.exchangeRate = 'Indicá un tipo de cambio mayor a 0.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      await assetsApi.addValueHistory(assetId, {
        value: parseFloat(value),
        currency,
        exchangeRate: parseFloat(exchangeRate),
        date,
        type,
        note: note.trim() || undefined,
      })
      await queryClient.invalidateQueries({ queryKey: assetKeys.detail(assetId) })
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      icon={TrendingUp}
      iconClassName={config.iconClassName}
      title="Agregar valuación"
      description={`Nueva entrada de historial para "${config.label}".`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Agregar'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Fecha de valuación" required error={errors.date}>
          <FormInput type="date" value={date} onChange={(e) => { setDate(e.target.value); setErrors((p) => ({ ...p, date: undefined })) }} />
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Moneda" required>
            <FormSelect value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </FormSelect>
          </FormField>
          <FormField label={`Valor (${currency})`} required error={errors.value}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">
                {currency === 'ARS' ? 'AR$' : 'US$'}
              </span>
              <FormInput
                type="number" min={0} step="0.01" placeholder="Ej: 92000"
                className="pl-10"
                value={value}
                onChange={(e) => { setValue(e.target.value); setErrors((p) => ({ ...p, value: undefined })) }}
              />
            </div>
          </FormField>
        </div>
        <FormField label="Tipo de cambio (ARS por USD)" required error={errors.exchangeRate}>
          <FormInput
            type="number" min={0} step="0.01" placeholder="Ej: 1150"
            value={exchangeRate}
            onChange={(e) => { setExchangeRate(e.target.value); setErrors((p) => ({ ...p, exchangeRate: undefined })) }}
          />
        </FormField>
        {equivalent && (
          <p className="text-xs text-slate-400 -mt-2">
            Equivalente: {equivalentPrefix} {equivalent}
          </p>
        )}
        <FormField label="Nota (opcional)">
          <FormTextarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej: Tasación actualizada por el productor."
            rows={2}
          />
        </FormField>
      </div>
    </Modal>
  )
}
