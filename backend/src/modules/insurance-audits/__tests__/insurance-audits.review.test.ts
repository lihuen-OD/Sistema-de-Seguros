import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn(), findMany: jest.fn() },
    insuranceAudit: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
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
    userAuditScope: { findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const BASE_DATE = new Date('2026-08-06T00:00:00.000Z')
const ASSET_ID = '60000000-0000-0000-0000-000000000001'
const AUDIT_ID = '70000000-0000-0000-0000-000000000001'

function makeAuditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: AUDIT_ID,
    assetId: ASSET_ID,
    status: 'SUBMITTED',
    auditDate: BASE_DATE,
    auditPeriod: '2026-08',
    auditedBy: 'auditor@losodwyer.com',
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
    asset: { assetType: 'Camioneta' },
    ...overrides,
  }
}

describe('Insurance Audits — Review API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.insuranceAudit.update.mockResolvedValue({})
    db.userAuditScope.findMany.mockResolvedValue([])
    db.policyAssetCoverage.findMany.mockResolvedValue([])
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  describe('POST /api/v1/insurance-audits/:id/review', () => {
    it('approves a SUBMITTED audit', async () => {
      db.insuranceAudit.findUnique
        .mockResolvedValueOnce(makeAuditRow())
        .mockResolvedValueOnce(makeAuditRow({ status: 'APPROVED', reviewedBy: 'test@losodwyer.com', reviewedAt: BASE_DATE }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ auditDecision: 'APPROVED' })

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('APPROVED')
      expect(db.insuranceAudit.update).toHaveBeenCalledWith({
        where: { id: AUDIT_ID },
        data: expect.objectContaining({ status: 'APPROVED', reviewedBy: 'test@losodwyer.com' }),
      })
    })

    it('returns 409 ALREADY_REVIEWED when the audit was already decided', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue(makeAuditRow({ status: 'APPROVED' }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ auditDecision: 'APPROVED' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_REVIEWED')
    })

    it('returns 403 SELF_REVIEW_FORBIDDEN when a non-ADMIN reviewer is the same person who audited it', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audits'] }))
      db.insuranceAudit.findUnique.mockResolvedValue(makeAuditRow({ auditedBy: 'test@losodwyer.com' }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ auditDecision: 'APPROVED' })

      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('SELF_REVIEW_FORBIDDEN')
    })

    it('allows an ADMIN to review an audit they themselves audited', async () => {
      db.insuranceAudit.findUnique.mockResolvedValue(makeAuditRow({ auditedBy: 'test@losodwyer.com' }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ auditDecision: 'APPROVED' })

      expect(res.status).toBe(200)
    })

    it('returns 403 for a USER without the insurance_audits module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['insurance_audit_coverage'] }))

      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ auditDecision: 'APPROVED' })

      expect(res.status).toBe(403)
    })

    it('returns 422 for an invalid auditDecision', async () => {
      const res = await request(app)
        .post(`/api/v1/insurance-audits/${AUDIT_ID}/review`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ auditDecision: 'NO_EXISTE' })

      expect(res.status).toBe(422)
    })
  })

  describe('POST /api/v1/insurance-audits/bulk-approve', () => {
    const AUDIT_A = '70000000-0000-0000-0000-00000000000a'
    const AUDIT_B = '70000000-0000-0000-0000-00000000000b'

    const rowA = makeAuditRow({ id: AUDIT_A, asset: { assetType: 'Camioneta', code: 'ROD-001', name: 'Hilux' } })
    const rowB = makeAuditRow({ id: AUDIT_B, status: 'APPROVED', asset: { assetType: 'Tractor', code: 'MAQ-001', name: 'Tractor 1' } })

    beforeEach(() => {
      db.insuranceAudit.findMany.mockResolvedValue([rowA, rowB])
      db.insuranceAudit.findUnique.mockImplementation(({ where: { id } }: { where: { id: string } }) => {
        if (id === AUDIT_A) return Promise.resolve(rowA)
        if (id === AUDIT_B) return Promise.resolve(rowB)
        return Promise.resolve(null)
      })
    })

    it('approves each SUBMITTED audit independently and reports the ones that fail', async () => {
      const res = await request(app)
        .post('/api/v1/insurance-audits/bulk-approve')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ids: [AUDIT_A, AUDIT_B] })

      expect(res.status).toBe(200)
      expect(res.body.data.approved).toEqual([AUDIT_A])
      expect(res.body.data.failed).toEqual([{ id: AUDIT_B, code: 'MAQ-001', message: 'Esta auditoría ya fue revisada' }])
    })

    it('returns 422 when ids is empty', async () => {
      const res = await request(app)
        .post('/api/v1/insurance-audits/bulk-approve')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ids: [] })

      expect(res.status).toBe(422)
    })
  })
})
