import clsx from 'clsx'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { PROPOSED_CHANGE_FIELD_LABELS } from './proposedChangeFieldLabels'
import type { FireExtinguisherAuditProposedChange } from '../../../shared/api/fire-extinguisher-audits.api'

interface ProposedChangeDecisionRowProps {
  change: FireExtinguisherAuditProposedChange
  decision: 'APPROVED' | 'REJECTED' | null
  onDecide: (decision: 'APPROVED' | 'REJECTED') => void
  readOnly: boolean
}

/** Fila de un cambio propuesto — de solo lectura (con StatusPill) o con controles Aprobar/Rechazar. */
export function ProposedChangeDecisionRow({ change, decision, onDecide, readOnly }: ProposedChangeDecisionRowProps) {
  const label = PROPOSED_CHANGE_FIELD_LABELS[change.fieldName] ?? change.fieldName

  return (
    <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="font-medium text-slate-700 text-sm">{label}</span>
          <div className="text-sm text-slate-500 truncate">
            {change.currentValue || '—'} → <span className="font-semibold text-amber-700">{change.proposedValue || '—'}</span>
          </div>
          {change.reason && <p className="text-xs text-slate-500 mt-0.5">Motivo: {change.reason}</p>}
        </div>

        {readOnly ? (
          <StatusPill status={change.status} size="sm" />
        ) : (
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => onDecide('APPROVED')}
              className={clsx(
                'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                decision === 'APPROVED'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              Aprobar
            </button>
            <button
              type="button"
              onClick={() => onDecide('REJECTED')}
              className={clsx(
                'px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors',
                decision === 'REJECTED'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50',
              )}
            >
              Rechazar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
