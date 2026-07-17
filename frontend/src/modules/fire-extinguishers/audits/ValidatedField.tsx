import { useState } from 'react'
import clsx from 'clsx'
import { CheckCircle2 } from 'lucide-react'
import { FormField, FormInput, FormSelect } from '../../../shared/components/forms/FormSection'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import type { ChoiceOption } from '../../../shared/components/forms/ChoiceGroup'

export interface FieldValidationState {
  modified: boolean
  newValue: string
  reason: string
}

export function emptyFieldValidationState(): FieldValidationState {
  return { modified: false, newValue: '', reason: '' }
}

interface ValidatedFieldProps {
  label: string
  currentValue: string
  inputType: 'text' | 'date' | 'select'
  options?: ChoiceOption[]
  state: FieldValidationState
  onChange: (next: FieldValidationState) => void
}

/** "Valor actual: X [Confirmar] [Modificar]" — usado en el Paso 3 para cada campo maestro validable. */
export function ValidatedField({ label, currentValue, inputType, options, state, onChange }: ValidatedFieldProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  function handleNoChangesClick() {
    // Si ya había un cambio propuesto con algo escrito, tocar "Sin cambios" lo
    // descartaría en silencio — Modificar y Sin cambios están uno al lado del
    // otro y es fácil tocar el que no se quería.
    if (state.modified && (state.newValue.trim() || state.reason.trim())) {
      setConfirmDiscard(true)
      return
    }
    onChange({ modified: false, newValue: '', reason: '' })
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
          <p className="text-sm font-semibold text-slate-800 truncate">{currentValue || '—'}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleNoChangesClick}
            className={clsx(
              'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
              !state.modified
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            Sin cambios
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...state, modified: true })}
            className={clsx(
              'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
              state.modified
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
            )}
          >
            Modificar
          </button>
        </div>
      </div>

      {state.modified && (
        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Nuevo valor" required>
            {inputType === 'select' ? (
              <FormSelect value={state.newValue} onChange={(e) => onChange({ ...state, newValue: e.target.value })}>
                <option value="">Seleccionar…</option>
                {options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </FormSelect>
            ) : (
              <FormInput
                type={inputType}
                value={state.newValue}
                onChange={(e) => onChange({ ...state, newValue: e.target.value })}
              />
            )}
          </FormField>
          <FormField label="Motivo (opcional)">
            <FormInput
              type="text"
              value={state.reason}
              onChange={(e) => onChange({ ...state, reason: e.target.value })}
              placeholder="Ej: se reemplazó el cilindro"
            />
          </FormField>

          {state.newValue.trim() && (
            <div className="sm:col-span-2 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <CheckCircle2 size={14} className="flex-shrink-0" />
              <span>
                Este cambio se va a guardar al enviar la auditoría: {currentValue || '—'} → <strong>{state.newValue}</strong>
              </span>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title="Descartar cambio propuesto"
        description={`¿Descartar el cambio propuesto para "${label}"? El valor y el motivo que escribiste se van a borrar.`}
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        danger
        onConfirm={() => {
          onChange({ modified: false, newValue: '', reason: '' })
          setConfirmDiscard(false)
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  )
}
