import { AlertCircle, Loader2 } from 'lucide-react'
import { FIELD_VALIDATION_CONFIG } from './AuditStep3FieldValidation'
import { ChecklistReadOnlySummary } from './ChecklistReadOnlySummary'
import type { FieldValidationState } from './ValidatedField'
import type { FireExtinguisher } from '../../../shared/types'

interface AuditStep5SummaryProps {
  extinguisher: FireExtinguisher
  locationConfirmed: boolean | null
  proposedLocation: string
  fieldValidations: Record<string, FieldValidationState>
  checklist: Record<string, string>
  comments: string
  photoCount: number
  submitting: boolean
  submitError: string | null
  onSubmit: () => void
  submitLabel?: string
}

export function AuditStep5Summary({
  extinguisher,
  locationConfirmed,
  proposedLocation,
  fieldValidations,
  checklist,
  comments,
  photoCount,
  submitting,
  submitError,
  onSubmit,
  submitLabel = 'Enviar auditoría',
}: AuditStep5SummaryProps) {
  const proposedChanges = [
    ...(locationConfirmed === false
      ? [
          {
            label: 'Ubicación',
            from: `${extinguisher.establishment ?? '—'}${extinguisher.location ? ' · ' + extinguisher.location : ''}`,
            to: proposedLocation,
          },
        ]
      : []),
    ...FIELD_VALIDATION_CONFIG.filter((f) => fieldValidations[f.key]?.modified).map((f) => ({
      label: f.label,
      from: f.getCurrentValue(extinguisher),
      to: fieldValidations[f.key].newValue,
    })),
  ]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Cambios propuestos</h3>
        {proposedChanges.length === 0 ? (
          <p className="text-sm text-slate-500">Sin cambios propuestos — todo coincide con el maestro.</p>
        ) : (
          <ul className="space-y-2">
            {proposedChanges.map((c) => (
              <li
                key={c.label}
                className="flex items-center justify-between gap-3 text-sm border border-amber-200 bg-amber-50 rounded-lg px-3 py-2"
              >
                <span className="font-medium text-slate-700">{c.label}</span>
                <span className="text-slate-500 truncate">
                  {c.from || '—'} → <span className="font-semibold text-amber-700">{c.to || '—'}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-800 mb-2">Checklist de condición</h3>
        <ChecklistReadOnlySummary checklist={checklist} comments={comments} />
      </div>

      <div className="text-sm text-slate-500">
        {photoCount} foto{photoCount === 1 ? '' : 's'} adjunta{photoCount === 1 ? '' : 's'}
      </div>

      {submitError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={15} />
          {submitError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
