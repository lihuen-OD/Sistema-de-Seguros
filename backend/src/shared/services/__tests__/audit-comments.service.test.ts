jest.mock('../../../config/database', () => ({
  prisma: {
    auditComment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

import { prisma } from '../../../config/database'
import {
  listAuditComments,
  createManualComment,
  recordAuditorNote,
  recordReviewDecision,
  markAuditCommentSeen,
} from '../audit-comments.service'

const db = prisma as any

beforeEach(() => {
  jest.clearAllMocks()
})

describe('listAuditComments', () => {
  it('queries by targetType + auditPeriod, most recent first', async () => {
    db.auditComment.findMany.mockResolvedValue([])
    await listAuditComments('ASSET', '2026-08')
    expect(db.auditComment.findMany).toHaveBeenCalledWith({
      where: { targetType: 'ASSET', auditPeriod: '2026-08' },
      orderBy: { createdAt: 'desc' },
    })
  })
})

describe('createManualComment', () => {
  it('creates a MANUAL comment with no auditId', async () => {
    db.auditComment.create.mockResolvedValue({ id: 'c1' })
    await createManualComment('FIRE_EXTINGUISHER', 'fe-1', '2026-08', 'admin@losodwyer.com', 'Aviso puntual')
    expect(db.auditComment.create).toHaveBeenCalledWith({
      data: { targetType: 'FIRE_EXTINGUISHER', targetId: 'fe-1', auditPeriod: '2026-08', source: 'MANUAL', authorEmail: 'admin@losodwyer.com', body: 'Aviso puntual' },
    })
  })
})

describe('recordAuditorNote', () => {
  it('creates a new AUDITOR_NOTE row when none exists yet', async () => {
    db.auditComment.findFirst.mockResolvedValue(null)
    await recordAuditorNote(db, 'ASSET', 'a1', '2026-08', 'audit-1', 'auditor@losodwyer.com', 'Falta la tarjeta')

    expect(db.auditComment.create).toHaveBeenCalledWith({
      data: { targetType: 'ASSET', targetId: 'a1', auditPeriod: '2026-08', auditId: 'audit-1', source: 'AUDITOR_NOTE', authorEmail: 'auditor@losodwyer.com', body: 'Falta la tarjeta' },
    })
  })

  it('updates the existing row and resets seenAt/seenByEmail when the text changes', async () => {
    db.auditComment.findFirst.mockResolvedValue({ id: 'c1', body: 'Falta la tarjeta' })
    await recordAuditorNote(db, 'ASSET', 'a1', '2026-08', 'audit-1', 'auditor@losodwyer.com', 'Ya se avisó')

    expect(db.auditComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ body: 'Ya se avisó', seenAt: null, seenByEmail: null }),
    })
  })

  it('does nothing when the text is unchanged (does not reset an existing "visto")', async () => {
    db.auditComment.findFirst.mockResolvedValue({ id: 'c1', body: 'Falta la tarjeta' })
    await recordAuditorNote(db, 'ASSET', 'a1', '2026-08', 'audit-1', 'auditor@losodwyer.com', 'Falta la tarjeta')

    expect(db.auditComment.update).not.toHaveBeenCalled()
    expect(db.auditComment.create).not.toHaveBeenCalled()
  })

  it('deletes the existing row when the auditor clears the comment text', async () => {
    db.auditComment.findFirst.mockResolvedValue({ id: 'c1', body: 'Falta la tarjeta' })
    await recordAuditorNote(db, 'ASSET', 'a1', '2026-08', 'audit-1', 'auditor@losodwyer.com', '   ')

    expect(db.auditComment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })

  it('does nothing when there is no existing row and the text is blank', async () => {
    db.auditComment.findFirst.mockResolvedValue(null)
    await recordAuditorNote(db, 'ASSET', 'a1', '2026-08', 'audit-1', 'auditor@losodwyer.com', null)

    expect(db.auditComment.create).not.toHaveBeenCalled()
    expect(db.auditComment.delete).not.toHaveBeenCalled()
  })
})

describe('recordReviewDecision', () => {
  it('records REJECTED with a default message when no notes were provided', async () => {
    await recordReviewDecision(db, 'FIRE_EXTINGUISHER', 'fe-1', '2026-08', 'audit-1', 'admin@losodwyer.com', 'REJECTED', null)

    expect(db.auditComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ source: 'REVIEW_DECISION', auditStatus: 'REJECTED', body: 'Auditoría rechazada.' }),
    })
  })

  it('records NEEDS_CORRECTION with the reviewer notes when provided', async () => {
    await recordReviewDecision(db, 'FIRE_EXTINGUISHER', 'fe-1', '2026-08', 'audit-1', 'admin@losodwyer.com', 'NEEDS_CORRECTION', 'Falta una foto del cilindro')

    expect(db.auditComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ auditStatus: 'NEEDS_CORRECTION', body: 'Falta una foto del cilindro' }),
    })
  })

  it('does NOT record anything for a silent APPROVED (no notes)', async () => {
    await recordReviewDecision(db, 'FIRE_EXTINGUISHER', 'fe-1', '2026-08', 'audit-1', 'admin@losodwyer.com', 'APPROVED', null)
    expect(db.auditComment.create).not.toHaveBeenCalled()
  })

  it('DOES record an APPROVED that includes notes', async () => {
    await recordReviewDecision(db, 'FIRE_EXTINGUISHER', 'fe-1', '2026-08', 'audit-1', 'admin@losodwyer.com', 'APPROVED', 'Todo en orden')
    expect(db.auditComment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ auditStatus: 'APPROVED', body: 'Todo en orden' }),
    })
  })
})

describe('markAuditCommentSeen', () => {
  it('throws NOT_FOUND when the comment does not exist', async () => {
    db.auditComment.findUnique.mockResolvedValue(null)
    await expect(markAuditCommentSeen('missing', 'admin@losodwyer.com')).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
  })

  it('throws SELF_SEEN_FORBIDDEN when the author tries to mark their own comment', async () => {
    db.auditComment.findUnique.mockResolvedValue({ id: 'c1', authorEmail: 'admin@losodwyer.com' })
    await expect(markAuditCommentSeen('c1', 'admin@losodwyer.com')).rejects.toMatchObject({ statusCode: 403, code: 'SELF_SEEN_FORBIDDEN' })
  })

  it('marks the comment seen when the caller is not the author', async () => {
    db.auditComment.findUnique.mockResolvedValue({ id: 'c1', authorEmail: 'auditor@losodwyer.com' })
    db.auditComment.update.mockResolvedValue({ id: 'c1', seenByEmail: 'admin@losodwyer.com' })

    await markAuditCommentSeen('c1', 'admin@losodwyer.com')

    expect(db.auditComment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ seenByEmail: 'admin@losodwyer.com' }),
    })
  })
})
