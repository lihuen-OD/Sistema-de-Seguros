import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
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
    userAuditScope: { findMany: jest.fn() },
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}))

import { prisma } from '../../../config/database'
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
  auditable: true,
}

const fakeAuditRow = {
  id: AUDIT_ID,
  assetId: ASSET_ID,
  status: 'SUBMITTED',
  auditDate: BASE_DATE,
  auditPeriod: '2026-08',
  auditedBy: 'test@losodwyer.com',
  policyActiveConfirmed: true,
  insuranceCardPresent: true,
  dataMatchesInsuredAsset: true,
  physicalConditionOk: true,
  odometerOrHoursObserved: '45000',
  comments: null,
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
    policyActiveConfirmed: true,
    insuranceCardPresent: true,
    dataMatchesInsuredAsset: true,
    physicalConditionOk: true,
    odometerOrHoursObserved: '45000',
  },
}

describe('Insurance Audits API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.asset.findUnique.mockResolvedValue(fakeAsset)
    db.insuranceAudit.create.mockResolvedValue(fakeAuditRow)
    db.userAuditScope.findMany.mockResolvedValue([])
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
      expect(res.body.data.checklist.policyActiveConfirmed).toBe(true)
    })

    it('returns 201 for a USER with insurance_audit_coverage and "camioneta" in scope', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: 'camioneta' }])

      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
    })

    it('returns 404 when a USER auditor has no matching category in scope', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: 'tractor' }]) // no incluye camioneta

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

    it('returns 400 ASSET_NOT_AUDITABLE when the asset is not marked auditable', async () => {
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, auditable: false })

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

    it('returns 422 when a checklist boolean field is missing', async () => {
      const { physicalConditionOk, ...checklist } = validCreateBody.checklist
      const res = await request(app)
        .post('/api/v1/insurance-audits')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, checklist })

      expect(res.status).toBe(422)
    })
  })

  // ── GET /api/v1/insurance-audits/:id ─────────────────────────────────────

  describe('GET /api/v1/insurance-audits/:id', () => {
    it('returns 200 with the checklist', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue({ ...fakeAuditRow, asset: { assetType: 'Camioneta' } })

      const res = await request(app)
        .get(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.checklist.insuranceCardPresent).toBe(true)
    })

    it('returns 404 when the audit does not exist', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/insurance-audits/${AUDIT_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('returns 404 for a USER auditor whose scope does not cover this asset category', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: 'tractor' }])
      db.insuranceAudit.findUnique.mockResolvedValue({ ...fakeAuditRow, asset: { assetType: 'Camioneta' } })

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
    it('scopes the list to the assets in the auditor category scope', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: 'camioneta' }])
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
    it('marks assets with a non-rejected audit this period as audited, filtered by scope', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))
      db.userAuditScope.findMany.mockResolvedValueOnce([{ scopeValue: 'camioneta' }])
      db.asset.findMany.mockResolvedValue([
        { id: ASSET_ID, code: 'ROD-001', name: 'Hilux', assetType: 'Camioneta' },
        { id: OTHER_ASSET_ID, code: 'MAQ-001', name: 'Tractor 1', assetType: 'Tractor' },
      ])
      db.insuranceAudit.findMany.mockResolvedValue([{ id: AUDIT_ID, assetId: ASSET_ID, status: 'APPROVED', auditDate: BASE_DATE }])

      const res = await request(app)
        .get('/api/v1/insurance-audits/coverage?period=2026-08')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].id).toBe(ASSET_ID)
      expect(res.body.data[0].audited).toBe(true)
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).get('/api/v1/insurance-audits/coverage?period=2026-08')
      expect(res.status).toBe(401)
    })
  })
})
