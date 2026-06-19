import { useState, useEffect } from 'react'
import { RefreshCw, X, CheckCircle2 } from 'lucide-react'
import {
  FormField,
  FormInput,
  FormTextarea,
} from '../../shared/components/forms/FormSection'
import type { FireExtinguisher } from '../../shared/types'
import type { RechargeInput } from '../../shared/api/fire-extinguishers.api'

function todayISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function addOneYear(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

interface RechargeModalProps {
  extinguishers: FireExtinguisher[]
  onConfirm: (data: RechargeInput) => void
  onClose: () => void
}

export function RechargeModal({ extinguishers, onConfirm, onClose }: RechargeModalProps) {
  const today = todayISO()
  const [chargeDate, setChargeDate] = useState(today)
  const [expirationDate, setExpirationDate] = useState(addOneYear(today))
  const [manualExpDate, setManualExpDate] = useState(false)
  const [technician, setTechnician] = useState('')
  const [observations, setObservations] = useState('')

  useEffect(() => {
    if (!manualExpDate && chargeDate) {
      setExpirationDate(addOneYear(chargeDate))
    }
  }, [chargeDate, manualExpDate])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm({ chargeDate, expirationDate, observations, technician })
  }

  const isMultiple = extinguishers.length > 1

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
              <RefreshCw size={15} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800 leading-snug">
                Registrar Recarga
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {isMultiple
                  ? `${extinguishers.length} matafuegos seleccionados`
                  : extinguishers[0]?.code}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Selected extinguishers chips (only for bulk) */}
        {isMultiple && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
            <div className="flex flex-wrap gap-1.5">
              {extinguishers.map((fe) => (
                <span
                  key={fe.id}
                  className="inline-flex items-center gap-1 text-xs font-mono bg-white border border-slate-200 text-slate-700 px-2 py-0.5 rounded-md"
                >
                  <CheckCircle2 size={10} className="text-emerald-500 flex-shrink-0" />
                  {fe.code}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <FormField label="Fecha de recarga" required>
              <FormInput
                type="date"
                value={chargeDate}
                onChange={(e) => setChargeDate(e.target.value)}
              />
            </FormField>
            <FormField
              label={`Nueva fecha de venc.${!manualExpDate ? ' (auto)' : ''}`}
              required
            >
              <FormInput
                type="date"
                value={expirationDate}
                onChange={(e) => {
                  setManualExpDate(true)
                  setExpirationDate(e.target.value)
                }}
              />
            </FormField>
          </div>

          {!manualExpDate && (
            <p className="text-xs text-slate-400 -mt-1 mb-4">
              Se calcula como +1 año desde la fecha de recarga.{' '}
              <button
                type="button"
                className="text-blue-500 hover:underline"
                onClick={() => setManualExpDate(true)}
              >
                Cambiar manualmente
              </button>
            </p>
          )}

          <div className="space-y-4">
            <FormField label="Responsable / Técnico">
              <FormInput
                value={technician}
                onChange={(e) => setTechnician(e.target.value)}
                placeholder="Ej: Luis Rodríguez — Servicios Técnicos S.A."
              />
            </FormField>
            <FormField label="Observaciones">
              <FormTextarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Ej: Recarga anual preventiva pre-campaña."
                rows={2}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2.5 pt-5 border-t border-slate-100 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <RefreshCw size={14} />
              Confirmar Recarga
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
