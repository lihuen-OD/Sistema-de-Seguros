import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    asset: { findUnique: jest.fn(), findMany: jest.fn() },
    insuranceAudit: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    insuranceAuditAttachment: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
    },
    auditComment: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policyAssetCoverage: { findMany: jest.fn() },
    userAuditScope: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}))

// downloadCirculationCard delega los bytes reales a sendAttachmentDownload
// (que internamente pide un link firmado a Cloudinary y hace un fetch real)
// — se mockea para testear solo que el controller/service le pasan el
// adjunto correcto, sin ejercitar la descarga real contra Cloudinary.
jest.mock('../../../shared/utils/attachment-download', () => ({
  sendAttachmentDownload: jest.fn(async (res: any) => {
    res.status(200).send('fake-file-bytes')
  }),
}))

import { prisma } from '../../../config/database'
import { sendAttachmentDownload } from '../../../shared/utils/attachment-download'
const db = prisma as any

const BASE_DATE = new Date('2026-08-06T00:00:00.000Z')
const ASSET_ID = '60000000-0000-0000-0000-000000000001'
const OTHER_ASSET_ID = '60000000-0000-0000-0000-000000000099'
const AUDIT_ID = '70000000-0000-0000-0000-000000000001'

const FAKE_JPEG_BUFFER = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('fake-image-bytes')])

const fakeAsset = {
  id: ASSET_ID,
  code: 'ROD-001',
  name: 'Camioneta Hilux',
  assetType: 'Camioneta',
  isActive: true,
  insuranceAuditable: true,
  metadata: { plate: 'AB123CD', chassisNumber: 'CHS001', engineNumber: 'MOT001' },
}

const fakeAuditRow = {
  id: AUDIT_ID,
  assetId: ASSET_ID,
  status: 'SUBMITTED',
  auditDate: BASE_DATE,
  auditPeriod: '2026-08',
  auditedBy: 'test@losodwyer.com',
  hasCirculationCard: true,
  comments: null,
  cardUpdateRequested: false,
  cardUpdateRequestedAt: null,
  cardUpdateRequestedBy: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewNotes: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  attachments: [] as unknown[],
}

const validCreateBody = {
  assetId: ASSET_ID,
  checklist: {
    hasCirculationCard: true,
  },
}

describe('Insurance Audits API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.asset.findUnique.mockResolvedValue(fakeAsset)
    db.insuranceAudit.create.mockResolvedValue(fakeAuditRow)
    db.userAuditScope.findMany.mockResolvedValue([])
    db.policyAssetCoverage.findMany.mockResolvedValue([])
    // Soporta tanto $transaction(async (tx) => {...}) — usado por create()/
    // update()/review() — pasando `db` como `tx`, como $transaction([...]) en
    // forma de array (usado por otros services que comparten este mock).
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  // ── POST /api/v1/insurance-audits ────────────────────────────────────────

  describe('POST /api/v1/insurance-audits', () => {
    it('returns 201 for ADMIN', async () => {
      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
      expect(res.body.data.id).toBe(AUDIT_ID)
      expect(res.body.data.checklist.hasCirculationCard).toBe(true)
    })

    it('returns 201 for a USER with insurance_audit_coverage and this asset assigned', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
    })

    it('returns 404 when a USER auditor does not have this asset assigned', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: OTHER_ASSET_ID }]) // no incluye ASSET_ID

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(404)
    })

    it('returns 403 for a USER without the insurance_audit_coverage module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(403)
    })

    it('returns 403 for a USER with only the insurance_audits (review) module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audits'] }))

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(403)
    })

    it('returns 404 when the asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, assetId: OTHER_ASSET_ID })

      expect(res.status).toBe(404)
    })

    it('returns 400 ASSET_NOT_AUDITABLE when the asset is not marked insuranceAuditable', async () => {
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, insuranceAuditable: false })

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('ASSET_NOT_AUDITABLE')
    })

    it('returns 409 DUPLICATE_AUDIT_PERIOD on a unique constraint violation', async () => {
      db.insuranceAudit.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['assetId', 'auditPeriod'] },
        }),
      )

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_AUDIT_PERIOD')
    })

    it('returns 422 when hasCirculationCard is missing', async () => {
      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, checklist: {} })

      expect(res.status).toBe(422)
    })
  })

  // ── GET /api/v1/insurance-audits/:id ─────────────────────────────────────

  describe('GET /api/v1/insurance-audits/:id', () => {
    it('returns 200 with the checklist and vehicle metadata', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue({ ...fakeAuditRow, asset: fakeAsset })

      const res = await request(app)
        .get(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.checklist.hasCirculationCard).toBe(true)
      expect(res.body.data.asset.plate).toBe('AB123CD')
    })

    it('returns 404 when the audit does not exist', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('returns 404 for a USER auditor who does not have this asset assigned', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: OTHER_ASSET_ID }])
      db.insuranceAudit.findUnique.mockResolvedValue({ ...fakeAuditRow, asset: fakeAsset })

      const res = await request(app)
        .get(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(404)
    })
  })

  // ── POST /api/v1/insurance-audits/:id/attachments ────────────────────────

  describe('POST /api/v1/insurance-audits/:id/attachments', () => {
    beforeEach(() => {
      db.insuranceAudit.findUnique.mockResolvedValue({ id: AUDIT_ID, assetId: ASSET_ID, asset: { assetType: 'Camioneta' } })
      db.insuranceAuditAttachment.count.mockResolvedValue(0)
    })

    it('returns 201 for a valid JPEG photo', async () => {
      db.insuranceAuditAttachment.create.mockResolvedValue({
        id: 'att1',
        auditId: AUDIT_ID,
        name: 'photo.jpg',
        fileType: 'image',
        fileSize: '1.0 KB',
        fileUrl: 'local://photo.jpg',
        uploadedAt: BASE_DATE,
        uploadedBy: 'test@losodwyer.com',
      })

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', FAKE_JPEG_BUFFER, { filename: 'photo.jpg', contentType: 'image/jpeg' })

      expect(res.status).toBe(201)
      expect(res.body.data.auditId).toBe(AUDIT_ID)
    })

    it('returns 415 when uploading a non-image file', async () => {
      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'document.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(415)
    })
  })

  // ── GET /api/v1/insurance-audits ──────────────────────────────────────────

  describe('GET /api/v1/insurance-audits', () => {
    it('scopes the list to the assets assigned to the auditor', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])
      db.asset.findMany.mockResolvedValue([
        { id: ASSET_ID, assetType: 'Camioneta' },
        { id: OTHER_ASSET_ID, assetType: 'Tractor' },
      ])
      db.insuranceAudit.findMany.mockResolvedValue([])
      db.insuranceAudit.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(db.insuranceAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { assetId: { in: [ASSET_ID] } } }),
      )
    })

    it('does not scope the list for ADMIN', async () => {
      db.insuranceAudit.findMany.mockResolvedValue([])
      db.insuranceAudit.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.insuranceAudit.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }))
    })
  })

  // ── GET /api/v1/insurance-audits/coverage ─────────────────────────────────

  describe('GET /api/v1/insurance-audits/coverage', () => {
    it('marks assets with an audit this period as audited, filtered by scope', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])
      db.asset.findMany.mockResolvedValue([
        { id: ASSET_ID, code: 'ROD-001', name: 'Hilux', assetType: 'Camioneta', metadata: { plate: 'AB123CD' } },
        { id: OTHER_ASSET_ID, code: 'MAQ-001', name: 'Tractor 1', assetType: 'Tractor', metadata: null },
      ])
      db.insuranceAudit.findMany.mockResolvedValue([
        { id: AUDIT_ID, assetId: ASSET_ID, status: 'APPROVED', auditDate: BASE_DATE, hasCirculationCard: true, cardUpdateRequested: false },
      ])

      const res = await request(app)
        .get('/api/v1/insurance-audits/coverage?period=2026-08')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(db.insuranceAudit.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { auditPeriod: '2026-08' }, orderBy: { createdAt: 'desc' } }),
      )
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].id).toBe(ASSET_ID)
      expect(res.body.data[0].audited).toBe(true)
      expect(res.body.data[0].plate).toBe('AB123CD')
      expect(res.body.data[0].hasCirculationCard).toBe(true)
    })

    it('shows a REJECTED audit as such (not as pending) so it can be re-audited from Cobertura', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])
      db.asset.findMany.mockResolvedValue([
        { id: ASSET_ID, code: 'ROD-001', name: 'Hilux', assetType: 'Camioneta', metadata: { plate: 'AB123CD' } },
      ])
      db.insuranceAudit.findMany.mockResolvedValue([
        { id: AUDIT_ID, assetId: ASSET_ID, status: 'REJECTED', auditDate: BASE_DATE, hasCirculationCard: false, cardUpdateRequested: false },
      ])

      const res = await request(app)
        .get('/api/v1/insurance-audits/coverage?period=2026-08')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data[0].audited).toBe(true)
      expect(res.body.data[0].auditStatus).toBe('REJECTED')
    })

    it('picks the audit created later even when both share the same auditDate (recorrección same-day)', async () => {
      // Reproduce el bug real encontrado en la base: una auditoría
      // NEEDS_CORRECTION y su recorrección APPROVED, ambas con auditDate de
      // "hoy" — el orden que importa es createdAt, no auditDate.
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])
      db.asset.findMany.mockResolvedValue([
        { id: ASSET_ID, code: 'ROD-001', name: 'Hilux', assetType: 'Camioneta', metadata: { plate: 'AB123CD' } },
      ])
      db.insuranceAudit.findMany.mockResolvedValue([
        { id: 'audit-new', assetId: ASSET_ID, status: 'APPROVED', auditDate: BASE_DATE, hasCirculationCard: true, cardUpdateRequested: false }, // recorrección, createdAt más nuevo
        { id: 'audit-old', assetId: ASSET_ID, status: 'NEEDS_CORRECTION', auditDate: BASE_DATE, hasCirculationCard: false, cardUpdateRequested: false }, // vieja, superada
      ])

      const res = await request(app)
        .get('/api/v1/insurance-audits/coverage?period=2026-08')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.body.data[0].auditStatus).toBe('APPROVED')
      expect(res.body.data[0].auditId).toBe('audit-new')
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/insurance-audits/coverage?period=2026-08')
      expect(res.status).toBe(401)
    })
  })

  // ── POST /api/v1/insurance-audits/:id/request-card-update ────────────────

  describe('POST /api/v1/insurance-audits/:id/request-card-update', () => {
    it('returns 200 and flags the audit as pending review, for the auditor', async () => {
      db.insuranceAudit.findUnique
        .mockResolvedValueOnce({ ...fakeAuditRow, hasCirculationCard: false, asset: { assetType: 'Camioneta' } })
        .mockResolvedValueOnce({ ...fakeAuditRow, hasCirculationCard: false, cardUpdateRequested: true, asset: fakeAsset })

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/request-card-update`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.insuranceAudit.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: AUDIT_ID }, data: expect.objectContaining({ cardUpdateRequested: true }) }),
      )
    })

    it('returns 409 CARD_ALREADY_PRESENT when the audit already has the card', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue({ ...fakeAuditRow, hasCirculationCard: true, asset: { assetType: 'Camioneta' } })

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/request-card-update`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CARD_ALREADY_PRESENT')
    })

    it('returns 403 for a USER without the insurance_audit_coverage module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audits'] }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/request-card-update`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── POST /api/v1/insurance-audits/:id/confirm-card-placed ─────────────────

  describe('POST /api/v1/insurance-audits/:id/confirm-card-placed', () => {
    it('returns 200 and marks hasCirculationCard true even when the audit is already APPROVED', async () => {
      db.insuranceAudit.findUnique
        .mockResolvedValueOnce({ ...fakeAuditRow, status: 'APPROVED', hasCirculationCard: false, cardUpdateRequested: true })
        .mockResolvedValueOnce({ ...fakeAuditRow, status: 'APPROVED', hasCirculationCard: true, cardUpdateRequested: false, asset: fakeAsset })

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/confirm-card-placed`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.insuranceAudit.update).toHaveBeenCalledWith({
        where: { id: AUDIT_ID },
        data: { hasCirculationCard: true, cardUpdateRequested: false },
      })
    })

    it('returns 409 NO_PENDING_CARD_REQUEST when there is nothing to confirm', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue({ ...fakeAuditRow, cardUpdateRequested: false })

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/confirm-card-placed`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('NO_PENDING_CARD_REQUEST')
    })

    it('returns 403 for a USER without the insurance_audits module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/confirm-card-placed`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── PUT /api/v1/insurance-audits/:id ──────────────────────────────────────

  describe('PUT /api/v1/insurance-audits/:id', () => {
    it('upserts the AUDITOR_NOTE comment when the comment text changes', async () => {
      db.insuranceAudit.findUnique
        .mockResolvedValueOnce({ ...fakeAuditRow, comments: 'Falta la tarjeta', asset: { assetType: 'Camioneta' } })
        .mockResolvedValueOnce({ ...fakeAuditRow, comments: 'Ya se avisó', asset: fakeAsset })
      db.auditComment.findFirst.mockResolvedValueOnce({ id: 'c1', body: 'Falta la tarjeta' })

      const res = await request(app)
        .put(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ checklist: { hasCirculationCard: false, comments: 'Ya se avisó' } })

      expect(res.status).toBe(200)
      expect(db.auditComment.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ body: 'Ya se avisó', seenAt: null, seenByEmail: null }),
      })
    })

    it('does not touch the comment (or reset seenAt) when the text is unchanged', async () => {
      db.insuranceAudit.findUnique
        .mockResolvedValueOnce({ ...fakeAuditRow, comments: 'Falta la tarjeta', asset: { assetType: 'Camioneta' } })
        .mockResolvedValueOnce({ ...fakeAuditRow, comments: 'Falta la tarjeta', asset: fakeAsset })
      db.auditComment.findFirst.mockResolvedValueOnce({ id: 'c1', body: 'Falta la tarjeta' })

      const res = await request(app)
        .put(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ checklist: { hasCirculationCard: false, comments: 'Falta la tarjeta' } })

      expect(res.status).toBe(200)
      expect(db.auditComment.update).not.toHaveBeenCalled()
      expect(db.auditComment.create).not.toHaveBeenCalled()
    })
  })

  // ── GET /api/v1/insurance-audits/comments ─────────────────────────────────

  describe('GET /api/v1/insurance-audits/comments', () => {
    it('returns only comments for in-scope assets', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])
      db.asset.findMany.mockResolvedValue([
        fakeAsset,
        { ...fakeAsset, id: OTHER_ASSET_ID, assetType: 'Tractor', metadata: {} },
      ])
      db.auditComment.findMany.mockResolvedValue([
        {
          id: 'c1',
          targetType: 'ASSET',
          targetId: ASSET_ID,
          source: 'AUDITOR_NOTE',
          auditStatus: null,
          body: 'Falta la tarjeta',
          authorEmail: 'test@losodwyer.com',
          seenAt: null,
          seenByEmail: null,
          createdAt: BASE_DATE,
        },
        {
          id: 'c2',
          targetType: 'ASSET',
          targetId: OTHER_ASSET_ID,
          source: 'AUDITOR_NOTE',
          auditStatus: null,
          body: 'Tractor con daños',
          authorEmail: 'test@losodwyer.com',
          seenAt: BASE_DATE,
          seenByEmail: 'admin@losodwyer.com',
          createdAt: BASE_DATE,
        },
      ])

      const res = await request(app)
        .get('/api/v1/insurance-audits/comments?period=2026-08')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].id).toBe('c1')
      expect(res.body.data[0].target.plate).toBe('AB123CD')
      expect(res.body.data[0].seenAt).toBeNull()
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/insurance-audits/comments?period=2026-08')
      expect(res.status).toBe(401)
    })
  })

  // ── POST /api/v1/insurance-audits/comments ────────────────────────────────

  describe('POST /api/v1/insurance-audits/comments', () => {
    it('returns 201 and creates a manual comment for an eligible asset', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      db.auditComment.create.mockResolvedValue({ id: 'c1', source: 'MANUAL', body: 'Aviso puntual' })

      const res = await request(app)
        .post('/api/v1/insurance-audits/comments')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetId: ASSET_ID, body: 'Aviso puntual' })

      expect(res.status).toBe(201)
      expect(db.auditComment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ targetType: 'ASSET', targetId: ASSET_ID, source: 'MANUAL', body: 'Aviso puntual' }),
      })
    })

    it('returns 422 when body is empty', async () => {
      const res = await request(app)
        .post('/api/v1/insurance-audits/comments')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetId: ASSET_ID, body: '   ' })

      expect(res.status).toBe(422)
    })

    it('returns 404 when the asset is not eligible for Auditoría de Seguros', async () => {
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, insuranceAuditable: false })

      const res = await request(app)
        .post('/api/v1/insurance-audits/comments')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetId: ASSET_ID, body: 'Aviso puntual' })

      expect(res.status).toBe(404)
    })
  })

  // ── POST /api/v1/insurance-audits/:id/mark-comment-seen ───────────────────

  describe('POST /api/v1/insurance-audits/:id/mark-comment-seen', () => {
    it('returns 200 and marks a comment authored by someone else as seen', async () => {
      db.auditComment.findUnique
        .mockResolvedValueOnce({ id: 'c1', targetType: 'ASSET', targetId: ASSET_ID, authorEmail: 'auditor@losodwyer.com' })
        .mockResolvedValueOnce({ id: 'c1', targetType: 'ASSET', targetId: ASSET_ID, authorEmail: 'auditor@losodwyer.com' })
      db.auditComment.update.mockResolvedValue({ id: 'c1', seenAt: BASE_DATE, seenByEmail: 'test@losodwyer.com' })

      const res = await request(app)
        .post('/api/v1/insurance-audits/c1/mark-comment-seen')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.auditComment.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ seenByEmail: 'test@losodwyer.com' }),
      })
    })

    it('returns 403 SELF_SEEN_FORBIDDEN when marking your own comment', async () => {
      db.auditComment.findUnique.mockResolvedValue({ id: 'c1', targetType: 'ASSET', targetId: ASSET_ID, authorEmail: 'test@losodwyer.com' })

      const res = await request(app)
        .post('/api/v1/insurance-audits/c1/mark-comment-seen')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('SELF_SEEN_FORBIDDEN')
    })

    it('returns 404 for a comment belonging to another audit (Matafuegos/Rodados, targetType FIRE_EXTINGUISHER)', async () => {
      db.auditComment.findUnique.mockResolvedValue({ id: 'c1', targetType: 'FIRE_EXTINGUISHER', targetId: 'fe-1', authorEmail: 'x@losodwyer.com' })

      const res = await request(app)
        .post('/api/v1/insurance-audits/c1/mark-comment-seen')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).post('/api/v1/insurance-audits/c1/mark-comment-seen')
      expect(res.status).toBe(401)
    })
  })

  // ── GET /api/v1/insurance-audits/assets/:assetId/circulation-card ────────

  describe('GET /api/v1/insurance-audits/assets/:assetId/circulation-card', () => {
    it('returns 200 and streams the most recent circulation card, filtered by scope', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: ASSET_ID }])
      db.policyAssetCoverage.findMany.mockResolvedValue([
        {
          assetId: ASSET_ID,
          attachments: [
            { id: 'att-1', fileUrl: 'https://res.cloudinary.com/x/raw/upload/v1/tarjeta.pdf', name: 'tarjeta.pdf', cloudinaryPublicId: 'seguros/tarjeta', uploadedAt: BASE_DATE },
          ],
        },
      ])

      const res = await request(app)
        .get(`/api/v1/insurance-audits/assets/${ASSET_ID}/circulation-card`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(sendAttachmentDownload).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fileUrl: 'https://res.cloudinary.com/x/raw/upload/v1/tarjeta.pdf', name: 'tarjeta.pdf', cloudinaryPublicId: 'seguros/tarjeta' }),
      )
    })

    it('returns 404 when the asset has no circulation card', async () => {
      db.policyAssetCoverage.findMany.mockResolvedValue([])

      const res = await request(app)
        .get(`/api/v1/insurance-audits/assets/${ASSET_ID}/circulation-card`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('returns 404 when the asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/insurance-audits/assets/${OTHER_ASSET_ID}/circulation-card`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('returns 404 for a USER auditor who does not have this asset assigned', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: OTHER_ASSET_ID }])
      db.policyAssetCoverage.findMany.mockResolvedValue([
        { assetId: ASSET_ID, attachments: [{ id: 'att-1', fileUrl: 'https://x/tarjeta.pdf', name: 'tarjeta.pdf', cloudinaryPublicId: 'seguros/tarjeta', uploadedAt: BASE_DATE }] },
      ])

      const res = await request(app)
        .get(`/api/v1/insurance-audits/assets/${ASSET_ID}/circulation-card`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(404)
    })

    it('returns 403 for a USER without insurance_audits or insurance_audit_coverage', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .get(`/api/v1/insurance-audits/assets/${ASSET_ID}/circulation-card`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).get(`/api/v1/insurance-audits/assets/${ASSET_ID}/circulation-card`)
      expect(res.status).toBe(401)
    })
  })

  // ── GET /api/v1/insurance-audits/assignments ──────────────────────────────

  describe('GET /api/v1/insurance-audits/assignments', () => {
    it('returns 200 with auditors and eligible assets for ADMIN', async () => {
      db.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Auditor Uno', email: 'auditor1@losodwyer.com' }])
      db.asset.findMany.mockResolvedValue([fakeAsset])
      db.userAuditScope.findMany.mockResolvedValue([{ userId: 'u1', scopeValue: ASSET_ID }])

      const res = await request(app)
        .get('/api/v1/insurance-audits/assignments')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.auditors).toEqual([
        { userId: 'u1', name: 'Auditor Uno', email: 'auditor1@losodwyer.com', assetIds: [ASSET_ID] },
      ])
      expect(res.body.data.assets[0]).toMatchObject({ id: ASSET_ID, category: 'camioneta' })
    })

    it('returns 403 for a non-ADMIN, even with insurance_audits module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audits'] }))

      const res = await request(app)
        .get('/api/v1/insurance-audits/assignments')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── PUT /api/v1/insurance-audits/assignments/:userId ──────────────────────

  describe('PUT /api/v1/insurance-audits/assignments/:userId', () => {
    it('returns 200 and replaces the scope with the given assetIds', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser())
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      db.asset.findMany.mockResolvedValue([{ id: ASSET_ID, assetType: 'Camioneta' }])

      const res = await request(app)
        .put('/api/v1/insurance-audits/assignments/u1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetIds: [ASSET_ID] })

      expect(res.status).toBe(200)
      expect(db.userAuditScope.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', area: 'INSURANCE_AUDIT' } })
      expect(db.userAuditScope.createMany).toHaveBeenCalledWith({
        data: [{ userId: 'u1', area: 'INSURANCE_AUDIT', scopeValue: ASSET_ID }],
      })
    })

    it('returns 404 when the target user does not exist', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser())
      db.user.findUnique.mockResolvedValueOnce(null)

      const res = await request(app)
        .put('/api/v1/insurance-audits/assignments/u1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetIds: [] })

      expect(res.status).toBe(404)
    })

    it('silently drops an assetId that is not (or no longer) eligible for Auditoría de Seguros, instead of failing the whole save', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser())
      db.user.findUnique.mockResolvedValueOnce({ id: 'u1' })
      db.asset.findMany.mockResolvedValue([]) // ninguno coincide con isActive+insuranceAuditable

      const res = await request(app)
        .put('/api/v1/insurance-audits/assignments/u1')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetIds: [ASSET_ID] })

      expect(res.status).toBe(200)
      expect(db.userAuditScope.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', area: 'INSURANCE_AUDIT' } })
      expect(db.userAuditScope.createMany).not.toHaveBeenCalled()
    })

    it('returns 403 for a non-ADMIN', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audits'] }))

      const res = await request(app)
        .put('/api/v1/insurance-audits/assignments/u1')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ assetIds: [] })

      expect(res.status).toBe(403)
    })
  })
})
