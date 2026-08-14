import { SectionCard } from '../cards/SectionCard'
import { StatusPill } from '../badges/StatusPill'
import { ChoiceGroup } from '../forms/ChoiceGroup'
import { FormField, FormTextarea } from '../forms/FormSection'

export type AuditReviewDecision = 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'

const AUDIT_DECISION_OPTIONS = [
  { value: 'APPROVED', label: 'Aprobar auditoría' },
  { value: 'REJECTED', label: 'Rechazar' },
  { value: 'NEEDS_CORRECTION', label: 'Solicitar corrección' },
]

interface AuditFinalDecisionCardProps {
  isReviewable: boolean
  status: string
  auditDecision: AuditReviewDecision | null
  onAuditDecisionChange: (decision: AuditReviewDecision) => void
  // Solo matafuegos/rodados tienen "cambios propuestos" pendientes de decidir
  // antes de poder aprobar — seguros no pasa esta prop.
  pendingChangesWarning?: string
  draftNotes: string
  onDraftNotesChange: (notes: string) => void
  canSubmit: boolean
  onSubmitClick: () => void
  savedReviewNotes?: string | null
  reviewedBy?: string | null
  reviewedAt?: string | null
}

export function AuditFinalDecisionCard({
  isReviewable,
  status,
  auditDecision,
  onAuditDecisionChange,
  pendingChangesWarning,
  draftNotes,
  onDraftNotesChange,
  canSubmit,
  onSubmitClick,
  savedReviewNotes,
  reviewedBy,
  reviewedAt,
}: AuditFinalDecisionCardProps) {
  return (
    <SectionCard title="Decisión final">
      {isReviewable ? (
        <div className="space-y-4">
          <FormField label="Decisión" required>
            <ChoiceGroup
              options={AUDIT_DECISION_OPTIONS}
              value={auditDecision ?? ''}
              onChange={(v) => onAuditDecisionChange(v as AuditReviewDecision)}
            />
          </FormField>
          {pendingChangesWarning && <p className="text-xs text-amber-600">{pendingChangesWarning}</p>}
          <FormField label="Notas de revisión (opcional)">
            <FormTextarea value={draftNotes} onChange={(e) => onDraftNotesChange(e.target.value)} rows={3} placeholder="Comentarios para el auditor…" />
          </FormField>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onSubmitClick}
              disabled={!canSubmit}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              Guardar revisión
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <StatusPill status={status} />
          {savedReviewNotes && (
            <p className="text-sm text-slate-600">
              <span className="font-medium">Notas:</span> {savedReviewNotes}
            </p>
          )}
          {reviewedBy && (
            <p className="text-xs text-slate-500">
              Revisado por {reviewedBy}
              {reviewedAt ? ` el ${new Date(reviewedAt).toLocaleString('es-AR')}` : ''}
            </p>
          )}
        </div>
      )}
    </SectionCard>
  )
}
