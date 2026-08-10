import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../errors/AppError'

export type AuditCommentTargetType = 'FIRE_EXTINGUISHER' | 'ASSET'
export type AuditCommentSource = 'AUDITOR_NOTE' | 'REVIEW_DECISION' | 'MANUAL'

export interface AuditCommentRow {
  id: string
  targetType: string
  targetId: string
  auditPeriod: string
  auditId: string | null
  source: string
  auditStatus: string | null
  body: string
  authorEmail: string
  seenAt: Date | null
  seenByEmail: string | null
  createdAt: Date
}

type Db = typeof prisma | Prisma.TransactionClient

const REVIEW_DECISION_DEFAULT_TEXT: Record<string, string> = {
  REJECTED: 'Auditoría rechazada.',
  NEEDS_CORRECTION: 'Se solicitó una corrección.',
  APPROVED: 'Auditoría aprobada.',
}

// Feed de comentarios compartido por las 3 auditorías (Matafuegos, Rodados,
// Seguros — ver AuditComment en schema.prisma). Esta capa es CRUD puro, SIN
// alcance ni aislamiento de población: cada motor (fire-extinguisher-audits.
// service.ts, insurance-audits.service.ts) resuelve su propio alcance y
// población ANTES de llamar acá — mismo criterio que replaceUserAuditScope en
// audit-scope.service.ts, que tampoco valida nada por su cuenta.

export async function listAuditComments(targetType: AuditCommentTargetType, period: string): Promise<AuditCommentRow[]> {
  return prisma.auditComment.findMany({
    where: { targetType, auditPeriod: period },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createManualComment(
  targetType: AuditCommentTargetType,
  targetId: string,
  period: string,
  authorEmail: string,
  body: string,
): Promise<AuditCommentRow> {
  return prisma.auditComment.create({
    data: { targetType, targetId, auditPeriod: period, source: 'MANUAL', authorEmail, body },
  })
}

// Upsert por (auditId, source: AUDITOR_NOTE) — mientras la auditoría sigue
// SUBMITTED el auditor puede editar el mismo comentario varias veces (ver
// update()); un insert por cada guardado ensuciaría el feed con duplicados.
// Si el auditor borra el texto, se borra la fila — no queda un comentario
// vacío colgando en el feed.
export async function recordAuditorNote(
  tx: Db,
  targetType: AuditCommentTargetType,
  targetId: string,
  period: string,
  auditId: string,
  authorEmail: string,
  body: string | null,
): Promise<void> {
  const existing = await tx.auditComment.findFirst({ where: { auditId, source: 'AUDITOR_NOTE' } })
  const trimmed = body?.trim() ?? ''

  if (!trimmed) {
    if (existing) await tx.auditComment.delete({ where: { id: existing.id } })
    return
  }

  if (existing) {
    // Sin cambio real de texto: no resetear "visto" en cada guardado (ej. el
    // auditor guarda el checklist de nuevo sin haber tocado el comentario).
    if (existing.body === trimmed) return
    await tx.auditComment.update({
      where: { id: existing.id },
      data: { body: trimmed, targetId, auditPeriod: period, authorEmail, seenAt: null, seenByEmail: null },
    })
  } else {
    await tx.auditComment.create({
      data: { targetType, targetId, auditPeriod: period, auditId, source: 'AUDITOR_NOTE', authorEmail, body: trimmed },
    })
  }
}

// Insert simple, nunca upsert — review() corre una sola vez por auditoría
// (bloqueado por ALREADY_REVIEWED). Para REJECTED/NEEDS_CORRECTION siempre
// queda un comentario — con un texto por defecto si no vino nota — para que
// el auditor encuentre confirmación de la decisión en Cobertura. Para
// APPROVED solo si el revisor efectivamente escribió algo: una aprobación
// silenciosa no necesita ocupar el feed.
export async function recordReviewDecision(
  tx: Db,
  targetType: AuditCommentTargetType,
  targetId: string,
  period: string,
  auditId: string,
  authorEmail: string,
  decision: string,
  notes: string | null,
): Promise<void> {
  const trimmed = notes?.trim() ?? ''
  if (decision === 'APPROVED' && !trimmed) return

  await tx.auditComment.create({
    data: {
      targetType,
      targetId,
      auditPeriod: period,
      auditId,
      source: 'REVIEW_DECISION',
      auditStatus: decision,
      authorEmail,
      body: trimmed || REVIEW_DECISION_DEFAULT_TEXT[decision] || 'La auditoría fue revisada.',
    },
  })
}

// Cualquiera de las dos partes puede marcar como visto un comentario de la
// OTRA — mismo criterio de "no autoacción" que SELF_REVIEW_FORBIDDEN en
// review(). Sin `scope`: igual que review()/markCommentSeen (versión vieja),
// un revisor nunca queda restringido por alcance, y el autor original ya
// sabe lo que escribió.
export async function markAuditCommentSeen(commentId: string, seenByEmail: string): Promise<AuditCommentRow> {
  const comment = await prisma.auditComment.findUnique({ where: { id: commentId } })
  if (!comment) throw new AppError(404, 'Comentario no encontrado', 'NOT_FOUND')
  if (comment.authorEmail === seenByEmail) {
    throw new AppError(403, 'No podés marcar como visto tu propio comentario', 'SELF_SEEN_FORBIDDEN')
  }
  return prisma.auditComment.update({ where: { id: commentId }, data: { seenAt: new Date(), seenByEmail } })
}
