import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, MessageSquare, CheckCircle2, Plus, Send } from 'lucide-react'
import { SectionCard } from '../cards/SectionCard'
import { Modal } from '../modals/Modal'
import { FormField, FormTextarea } from '../forms/FormSection'
import { SearchableSelect, type SearchableSelectOption } from '../forms/SearchableSelect'

export type AuditCommentSource = 'AUDITOR_NOTE' | 'REVIEW_DECISION' | 'MANUAL'

export interface AuditCommentTarget {
  id: string
  label: string
  sublabel?: string | null
}

export interface AuditCommentItem {
  id: string
  source: AuditCommentSource
  auditStatus: string | null
  body: string
  authorEmail: string
  createdAt: string
  seenAt: string | null
  seenByEmail: string | null
  target: AuditCommentTarget
}

interface AuditCommentsPanelProps {
  comments: AuditCommentItem[]
  /** Activos/matafuegos elegibles, para el buscador de "Agregar comentario". */
  targets: AuditCommentTarget[]
  currentUserEmail: string
  onAddComment: (targetId: string, body: string) => Promise<void>
  onMarkSeen: (commentId: string) => Promise<void>
}

const SOURCE_BADGE: Record<string, { label: string; className: string } | null> = {
  AUDITOR_NOTE: { label: 'Nota del auditor', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  MANUAL: null,
}

const DECISION_BADGE: Record<string, { label: string; className: string }> = {
  APPROVED: { label: 'Aprobada', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  REJECTED: { label: 'Rechazada', className: 'bg-red-50 text-red-700 border-red-200' },
  NEEDS_CORRECTION: { label: 'Solicita corrección', className: 'bg-amber-50 text-amber-700 border-amber-200' },
}

function sourceBadge(comment: AuditCommentItem) {
  if (comment.source === 'REVIEW_DECISION' && comment.auditStatus) return DECISION_BADGE[comment.auditStatus] ?? null
  return SOURCE_BADGE[comment.source] ?? null
}

// Feed de comentarios compartido por las 3 auditorías (Matafuegos, Rodados,
// Seguros) — vive dentro de la pestaña Cobertura, visible para auditor y
// admin. Se alimenta solo (nota del auditor al auditar, decisión del revisor
// al aprobar/rechazar/pedir corrección) y también admite un comentario suelto
// sin auditoría de por medio, vía "Agregar comentario".
export function AuditCommentsPanel({ comments, targets, currentUserEmail, onAddComment, onMarkSeen }: AuditCommentsPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [markingSeenId, setMarkingSeenId] = useState<string | null>(null)

  const sortedComments = useMemo(() => [...comments].sort((a, b) => Number(!!a.seenAt) - Number(!!b.seenAt)), [comments])
  const seenCount = comments.filter((c) => c.seenAt).length
  const unseenCount = comments.length - seenCount

  const targetOptions: SearchableSelectOption[] = useMemo(
    () => targets.map((t) => ({ value: t.id, label: t.label, sublabel: t.sublabel ?? undefined })),
    [targets],
  )

  function closeAddModal() {
    setAddOpen(false)
    setTargetId('')
    setBody('')
  }

  async function handleAddComment() {
    if (!targetId || !body.trim() || submitting) return
    setSubmitting(true)
    try {
      await onAddComment(targetId, body.trim())
      closeAddModal()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMarkSeen(commentId: string) {
    if (markingSeenId) return
    setMarkingSeenId(commentId)
    try {
      await onMarkSeen(commentId)
    } finally {
      setMarkingSeenId(null)
    }
  }

  return (
    <>
      <SectionCard noPadding>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setCollapsed((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((v) => !v) } }}
          className="px-5 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <MessageSquare size={15} className="text-slate-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-800 truncate">Comentarios</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {comments.length > 0 && (
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  {seenCount} visto{seenCount !== 1 ? 's' : ''} · {unseenCount} sin ver
                </span>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setAddOpen(true) }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus size={13} />
                Agregar comentario
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCollapsed((v) => !v) }}
                className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                title={collapsed ? 'Mostrar comentarios' : 'Ocultar comentarios'}
              >
                {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
          </div>
        </div>

        {!collapsed && (
          comments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Todavía no hay comentarios en este período.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedComments.map((item) => {
                const badge = sourceBadge(item)
                const canMarkSeen = !item.seenAt && item.authorEmail !== currentUserEmail
                return (
                  <div key={item.id} className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 px-4 sm:px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 break-words sm:truncate">
                        {item.target.label}
                        {item.target.sublabel && <span className="text-xs text-slate-400 font-mono ml-1.5">{item.target.sublabel}</span>}
                        {badge && (
                          <span className={clsx('ml-2 inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap', badge.className)}>
                            {badge.label}
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5 break-words">{item.body}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {item.authorEmail} · {item.createdAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {item.seenAt ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 whitespace-nowrap">
                          <CheckCircle2 size={12} />
                          Visto
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                          Sin ver
                        </span>
                      )}
                      {canMarkSeen && (
                        <button
                          type="button"
                          onClick={() => handleMarkSeen(item.id)}
                          disabled={markingSeenId === item.id}
                          className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                        >
                          Marcar como visto
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </SectionCard>

      <Modal
        open={addOpen}
        onClose={closeAddModal}
        title="Agregar comentario"
        description="Deja una nota sin necesidad de auditar — la va a ver tanto el auditor como el admin."
        footer={
          <>
            <button
              type="button"
              onClick={closeAddModal}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAddComment}
              disabled={!targetId || !body.trim() || submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <Send size={14} />
              Enviar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Activo / matafuego" required>
            <SearchableSelect
              options={targetOptions}
              value={targetId}
              onChange={setTargetId}
              placeholder="Buscar…"
              emptyOptionLabel="— Seleccionar —"
            />
          </FormField>
          <FormField label="Comentario" required>
            <FormTextarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Escribí el comentario…" maxLength={1000} />
          </FormField>
        </div>
      </Modal>
    </>
  )
}
