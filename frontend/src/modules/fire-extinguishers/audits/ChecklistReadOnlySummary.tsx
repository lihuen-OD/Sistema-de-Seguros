import { CHECKLIST_FIELDS, optionLabel } from './checklistConfig'

interface ChecklistReadOnlySummaryProps {
  checklist: Record<string, string>
  comments?: string | null
}

/** Resumen de solo lectura del checklist de auditoría — usado en el Paso 5 del wizard de alta y en la pantalla de revisión. */
export function ChecklistReadOnlySummary({ checklist, comments }: ChecklistReadOnlySummaryProps) {
  return (
    <div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
        {CHECKLIST_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 text-sm">
            <dt className="text-slate-500">{f.label}</dt>
            <dd className="font-medium text-slate-700">
              {f.type === 'choice' ? optionLabel(f.options, checklist[f.key]) : checklist[f.key] || '—'}
            </dd>
          </div>
        ))}
      </dl>
      {comments && (
        <p className="text-sm text-slate-600 mt-3">
          <span className="font-medium">Observaciones:</span> {comments}
        </p>
      )}
    </div>
  )
}
