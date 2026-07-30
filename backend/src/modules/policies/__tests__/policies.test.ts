import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policyAssetCoverage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    policyAttachment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    documentPolicyAllocation: { deleteMany: jest.fn() },
    producer: { findFirst: jest.fn() },
    insuranceType: { findFirst: jest.fn() },
    asset: { findFirst: jest.fn() },
    company: { findFirst: jest.fn() },
    costCenter: { findFirst: jest.fn() },
    producerTask: { findMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}))

import { prisma } from '../../../config/database'
import { deleteFromCloudinary } from '../../../config/cloudinary'
const db = prisma as any

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  // hardDelete() usa la forma en array ($transaction([...])) — alcanza con
  // resolver cada operación en paralelo, igual que hace Prisma de verdad.
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[]),
  )
})

const POLICY_ID = '30000000-0000-0000-0000-000000000001'
const OTHER_ID = '30000000-0000-0000-0000-000000000099'
const ASSET_ID = '40000000-0000-0000-0000-000000000001'
const TYPE_ID = '50000000-0000-0000-0000-000000000001'
const COVERAGE_ID = '60000000-0000-0000-0000-000000000001'
const BASE_DATE = new Date('2026-01-01T00:00:00.000Z')

const fakeInsuranceType = { id: TYPE_ID, name: 'Automotor', isActive: true, coverages: [] }

const validPolicyBody = {
  policyNumber: 'POL-TEST-001',
  insuredName: 'La Segunda',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  coverages: [
    { insuranceTypeId: TYPE_ID, insuredAmount: 10000, currency: 'USD', exchangeRate: 1000 },
  ],
}

describe('Policies API', () => {
  // ── POST /api/v1/policies ────────────────────────────────────────────────────

  describe('POST /api/v1/policies', () => {
    it('returns 201 when ADMIN creates a policy with a coverage line', async () => {
      db.policy.findUnique.mockResolvedValue(null) // no duplicate policyNumber
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.policy.create.mockResolvedValue({
        id: POLICY_ID,
        ...validPolicyBody,
        startDate: BASE_DATE,
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        isActive: true,
        deactivatedAt: null,
        producer: null,
        coverages: [
          {
            id: COVERAGE_ID,
            assetId: null,
            insuranceTypeId: TYPE_ID,
            coverageIds: [],
            insuredAmount: 10000,
            currency: 'USD',
            exchangeRate: 1000,
            insuredAmountArs: 10000000,
            insuredAmountUsd: 10000,
            companyId: null,
            costCenterId: null,
            beneficiaryDescription: null,
            insuranceType: fakeInsuranceType,
            company: null,
            costCenter: null,
            asset: null,
            attachments: [],
            _count: { attachments: 0 },
          },
        ],
      })

      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validPolicyBody)

      expect(res.status).toBe(201)
      expect(res.body.data.coverages).toHaveLength(1)
      const createCall = db.policy.create.mock.calls[0][0]
      expect(createCall.data.coverages.create[0].insuredAmountUsd).toBe(10000)
      expect(createCall.data.coverages.create[0].insuredAmountArs).toBe(10000000)
    })

    it('returns 409 when the policyNumber already exists', async () => {
      db.policy.findUnique.mockResolvedValue({ id: 'existing' })

      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validPolicyBody)

      expect(res.status).toBe(409)
      expect(db.policy.create).not.toHaveBeenCalled()
    })

    it('returns 400 when a coverage references an inactive or missing insurance type', async () => {
      db.policy.findUnique.mockResolvedValue(null)
      db.insuranceType.findFirst.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validPolicyBody)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })

    it('returns 400 when the same asset appears twice in the coverages array', async () => {
      db.policy.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          ...validPolicyBody,
          coverages: [
            { insuranceTypeId: TYPE_ID, assetId: ASSET_ID, insuredAmount: 100 },
            { insuranceTypeId: TYPE_ID, assetId: ASSET_ID, insuredAmount: 200 },
          ],
        })

      expect(res.status).toBe(400)
      expect(db.insuranceType.findFirst).not.toHaveBeenCalled()
    })

    it('returns 422 when no coverage line is provided', async () => {
      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validPolicyBody, coverages: [] })

      expect(res.status).toBe(422)
    })

    it('returns 403 when a USER without the policies module tries to create', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post('/api/v1/policies')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validPolicyBody)

      expect(res.status).toBe(403)
    })
  })

  // ── PUT /api/v1/policies/:id ─────────────────────────────────────────────────

  describe('PUT /api/v1/policies/:id', () => {
    it('updates only policy-level fields, never touching coverages', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policy.update.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'POL-TEST-001',
        insuredName: 'Zurich Argentina',
        producerId: null,
        producer: null,
        startDate: BASE_DATE,
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        description: null,
        isActive: true,
        deactivatedAt: null,
        coverages: [],
      })

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuredName: 'Zurich Argentina' })

      expect(res.status).toBe(200)
      const updateCall = db.policy.update.mock.calls[0][0]
      expect(updateCall.data).not.toHaveProperty('coverages')
      expect(updateCall.data.insuredName).toBe('Zurich Argentina')
    })

    it('returns 404 when the policy does not exist', async () => {
      db.policy.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put(`/api/v1/policies/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuredName: 'Zurich' })

      expect(res.status).toBe(404)
    })
  })

  // ── DELETE /api/v1/policies/:id ──────────────────────────────────────────────

  describe('DELETE /api/v1/policies/:id', () => {
    it('deletes the policy, drops allocations on its coverages, unlinks tasks, and cleans up Cloudinary', async () => {
      db.policy.findUnique.mockResolvedValue({
        id: POLICY_ID,
        coverages: [
          { id: COVERAGE_ID, attachments: [{ cloudinaryPublicId: 'circ-card-123' }] },
        ],
      })
      db.documentPolicyAllocation.deleteMany.mockResolvedValue({ count: 2 })
      db.producerTask.updateMany.mockResolvedValue({ count: 1 })
      db.policy.delete.mockResolvedValue({ id: POLICY_ID })
      ;(deleteFromCloudinary as jest.Mock).mockResolvedValue(undefined)

      const res = await request(app)
        .delete(`/api/v1/policies/${POLICY_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(deleteFromCloudinary).toHaveBeenCalledWith('circ-card-123')
      expect(db.documentPolicyAllocation.deleteMany).toHaveBeenCalledWith({
        where: { policyAssetCoverageId: { in: [COVERAGE_ID] } },
      })
      expect(db.producerTask.updateMany).toHaveBeenCalledWith({
        where: { policyId: POLICY_ID },
        data: { policyId: null },
      })
      expect(db.policy.delete).toHaveBeenCalledWith({ where: { id: POLICY_ID } })
    })

    it('works when the policy has no coverage lines at all', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, coverages: [] })
      db.documentPolicyAllocation.deleteMany.mockResolvedValue({ count: 0 })
      db.producerTask.updateMany.mockResolvedValue({ count: 0 })
      db.policy.delete.mockResolvedValue({ id: POLICY_ID })

      const res = await request(app)
        .delete(`/api/v1/policies/${POLICY_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(deleteFromCloudinary).not.toHaveBeenCalled()
      expect(db.documentPolicyAllocation.deleteMany).toHaveBeenCalledWith({
        where: { policyAssetCoverageId: { in: [] } },
      })
    })

    it('returns 404 when the policy does not exist', async () => {
      db.policy.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .delete(`/api/v1/policies/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
      expect(db.policy.delete).not.toHaveBeenCalled()
    })
  })

  // ── PUT /api/v1/policies/:id/coverages ───────────────────────────────────────

  describe('PUT /api/v1/policies/:id/coverages', () => {
    it('updates an existing line in place when it comes with an id (preserves its attachments)', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany
        .mockResolvedValueOnce([{ id: COVERAGE_ID }]) // existing lines for this policy
        .mockResolvedValueOnce([ // findCoverages() re-read at the end
          {
            id: COVERAGE_ID, assetId: null, insuranceTypeId: TYPE_ID, coverageIds: [],
            insuredAmount: 5000, currency: 'USD', exchangeRate: 1000,
            insuredAmountArs: 5000000, insuredAmountUsd: 5000,
            companyId: null, costCenterId: null, beneficiaryDescription: null,
            insuranceType: fakeInsuranceType, company: null, costCenter: null, asset: null,
            attachments: [], _count: { attachments: 2 },
          },
        ])
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.$transaction.mockResolvedValue([])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: COVERAGE_ID, insuranceTypeId: TYPE_ID, insuredAmount: 5000, currency: 'USD', exchangeRate: 1000 }] })

      expect(res.status).toBe(200)
      expect(res.body.data[0]._count.attachments).toBe(2)
      // Solo se ejecuta el update de la línea existente — nunca un delete (no
      // sacaron ninguna línea) ni un create (no es una línea nueva).
      const txCalls = db.$transaction.mock.calls[0][0]
      expect(txCalls).toHaveLength(1)
    })

    it('deletes lines that are no longer present in the incoming array (cascades their attachments)', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      const REMOVED_COVERAGE_ID = '60000000-0000-0000-0000-000000000002'
      db.policyAssetCoverage.findMany
        .mockResolvedValueOnce([{ id: COVERAGE_ID }, { id: REMOVED_COVERAGE_ID }])
        .mockResolvedValueOnce([])
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.$transaction.mockResolvedValue([])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: COVERAGE_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000 }] })

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [REMOVED_COVERAGE_ID] } } })
    })

    it('returns 400 when a coverage id does not belong to this policy', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([{ id: COVERAGE_ID }])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: OTHER_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000 }] })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })
  })

  // ── Attachments (por línea de cobertura) ─────────────────────────────────────

  describe('POST /api/v1/policies/:id/coverages/:coverageId/attachments', () => {
    it('returns 201 and scopes the attachment to the coverage line', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({ id: COVERAGE_ID })
      db.policyAttachment.create.mockResolvedValue({
        id: 'att-1', policyAssetCoverageId: COVERAGE_ID, name: 'poliza.pdf',
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), { filename: 'poliza.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(201)
      const createCall = db.policyAttachment.create.mock.calls[0][0]
      expect(createCall.data.policyAssetCoverageId).toBe(COVERAGE_ID)
    })

    it('returns 404 when the coverage line does not belong to the policy', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue(null)

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), { filename: 'poliza.pdf', contentType: 'application/pdf' })

      expect(res.status).toBe(404)
      expect(db.policyAttachment.create).not.toHaveBeenCalled()
    })
  })

  describe('GET /api/v1/policies/:id/coverages/:coverageId/attachments', () => {
    it('lists only the attachments of that specific coverage line', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({ id: COVERAGE_ID })
      db.policyAttachment.findMany.mockResolvedValue([{ id: 'att-1', policyAssetCoverageId: COVERAGE_ID }])

      const res = await request(app)
        .get(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/attachments`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.policyAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { policyAssetCoverageId: COVERAGE_ID } }),
      )
    })
  })
})
