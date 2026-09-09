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
      delete: jest.fn(),
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
const END_DATE = new Date('2026-12-31T00:00:00.000Z')

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
  // ── GET /api/v1/policies ────────────────────────────────────────────────────

  describe('GET /api/v1/policies', () => {
    it('selects the coverage lifecycle fields in the list — regression test for the missing effectiveDate that crashed FinancialAnalysis/EconomicAnalysis/RenewalProjection/InsuranceDashboard on the frontend', async () => {
      db.policy.findMany.mockResolvedValueOnce([])
      db.policy.count.mockResolvedValueOnce(0)

      await request(app).get('/api/v1/policies').set('Authorization', `Bearer ${adminToken()}`)

      const findManyCall = db.policy.findMany.mock.calls[0][0]
      expect(findManyCall.include.coverages.select).toMatchObject({
        effectiveDate: true,
        bajaDate: true,
        bajaReason: true,
        deactivatedAt: true,
      })
    })
  })

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
            { insuranceTypeId: TYPE_ID, assetId: ASSET_ID, insuredAmount: 100, exchangeRate: 1000 },
            { insuranceTypeId: TYPE_ID, assetId: ASSET_ID, insuredAmount: 200, exchangeRate: 1000 },
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
        .mockResolvedValueOnce([{ id: COVERAGE_ID, assetId: null, _count: { attachments: 2 } }]) // existing lines for this policy
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
        .mockResolvedValueOnce([
          { id: COVERAGE_ID, assetId: null, _count: { attachments: 0 } },
          { id: REMOVED_COVERAGE_ID, assetId: null, _count: { attachments: 0 } },
        ])
        .mockResolvedValueOnce([])
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.$transaction.mockResolvedValue([])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: COVERAGE_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1000 }] })

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [REMOVED_COVERAGE_ID] } } })
    })

    it('returns 400 when a coverage id does not belong to this policy', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([
        { id: COVERAGE_ID, assetId: null, _count: { attachments: 0 } },
      ])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: OTHER_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1000 }] })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })

    it('returns 409 when an existing line with attachments changes assetId', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([
        { id: COVERAGE_ID, assetId: ASSET_ID, _count: { attachments: 1 } },
      ])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: COVERAGE_ID, assetId: OTHER_ID, insuranceTypeId: TYPE_ID, exchangeRate: 1000 }] })

      expect(res.status).toBe(409)
      expect(res.body.error).toEqual({
        code: 'COVERAGE_ASSET_CHANGE_BLOCKED',
        message: 'No se puede cambiar el activo de esta cobertura porque ya tiene adjuntos cargados. Para cambiar el activo, eliminá primero los adjuntos de esta cobertura o creá una nueva línea de cobertura.',
      })
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('allows editing other fields when an existing line has attachments and assetId is unchanged', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany
        .mockResolvedValueOnce([{ id: COVERAGE_ID, assetId: ASSET_ID, _count: { attachments: 1 } }])
        .mockResolvedValueOnce([])
      db.asset.findFirst.mockResolvedValue({ id: ASSET_ID })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: COVERAGE_ID, assetId: ASSET_ID, insuranceTypeId: TYPE_ID, insuredAmount: 2500, exchangeRate: 1000 }] })

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.update).toHaveBeenCalled()
    })

    it('allows changing assetId when an existing line has no attachments', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany
        .mockResolvedValueOnce([{ id: COVERAGE_ID, assetId: ASSET_ID, _count: { attachments: 0 } }])
        .mockResolvedValueOnce([])
      db.asset.findFirst.mockResolvedValue({ id: OTHER_ID })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ id: COVERAGE_ID, assetId: OTHER_ID, insuranceTypeId: TYPE_ID, exchangeRate: 1000 }] })

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.update).toHaveBeenCalled()
    })

    it('allows a new line to choose an assetId', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      db.asset.findFirst.mockResolvedValue({ id: ASSET_ID })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ assetId: ASSET_ID, insuranceTypeId: TYPE_ID, exchangeRate: 1000 }] })

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.create).toHaveBeenCalled()
    })

    it('returns 409 and does not delete when a line being removed already has attachments', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, startDate: BASE_DATE })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([
        { id: COVERAGE_ID, assetId: null, _count: { attachments: 1, allocations: 0 } },
      ])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1000 }] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('COVERAGE_HAS_HISTORY')
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('returns 409 and does not delete when a line being removed already has allocations', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, startDate: BASE_DATE })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([
        { id: COVERAGE_ID, assetId: null, _count: { attachments: 0, allocations: 1 } },
      ])

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1000 }] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('COVERAGE_HAS_HISTORY')
      expect(db.$transaction).not.toHaveBeenCalled()
    })

    it('returns 409 and does not create when a new line overlaps an existing line with a future bajaDate for the same asset', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, startDate: BASE_DATE })
      db.policyAssetCoverage.findMany.mockResolvedValueOnce([
        {
          id: COVERAGE_ID, assetId: ASSET_ID,
          effectiveDate: BASE_DATE, bajaDate: new Date('2026-12-01T00:00:00.000Z'),
          _count: { attachments: 0, allocations: 0 },
        },
      ])
      db.asset.findFirst.mockResolvedValue({ id: ASSET_ID })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ coverages: [{ assetId: ASSET_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1000 }] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('COVERAGE_OVERLAP')
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(db.policyAssetCoverage.create).not.toHaveBeenCalled()
    })
  })

  // ── POST /api/v1/policies/:id/coverages ──────────────────────────────────────

  describe('POST /api/v1/policies/:id/coverages', () => {
    it('returns 201 when effectiveDate is within the policy validity range', async () => {
      db.policy.findUnique.mockResolvedValue({ startDate: BASE_DATE, endDate: END_DATE })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.policyAssetCoverage.create.mockResolvedValue({
        id: COVERAGE_ID, assetId: null, insuranceTypeId: TYPE_ID, coverageIds: [],
        insuredAmount: 1000, currency: 'ARS', exchangeRate: 1,
        insuredAmountArs: 1000, insuredAmountUsd: 1, companyId: null, costCenterId: null,
        beneficiaryDescription: null, effectiveDate: new Date('2026-03-01T00:00:00.000Z'),
        bajaDate: null, bajaReason: null,
        insuranceType: fakeInsuranceType, company: null, costCenter: null, asset: null,
        attachments: [], _count: { attachments: 0 },
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1, effectiveDate: '2026-03-01' })

      expect(res.status).toBe(201)
      const createCall = db.policyAssetCoverage.create.mock.calls[0][0]
      expect(createCall.data.effectiveDate).toEqual(new Date('2026-03-01T00:00:00.000Z'))
    })

    it('returns 400 when effectiveDate is before policy.startDate', async () => {
      db.policy.findUnique.mockResolvedValue({ startDate: BASE_DATE, endDate: END_DATE })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1, effectiveDate: '2025-12-31' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_DATE_RANGE')
      expect(db.policyAssetCoverage.create).not.toHaveBeenCalled()
    })

    it('returns 400 when effectiveDate is after policy.endDate', async () => {
      db.policy.findUnique.mockResolvedValue({ startDate: BASE_DATE, endDate: END_DATE })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1, effectiveDate: '2027-01-01' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_DATE_RANGE')
      expect(db.policyAssetCoverage.create).not.toHaveBeenCalled()
    })

    it('allows re-alta of the same asset when the previous line already ended before the new effectiveDate', async () => {
      db.policy.findUnique.mockResolvedValue({ startDate: BASE_DATE, endDate: END_DATE })
      db.asset.findFirst.mockResolvedValue({ id: ASSET_ID })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.policyAssetCoverage.findMany.mockResolvedValue([
        { effectiveDate: new Date('2026-01-01T00:00:00.000Z'), bajaDate: new Date('2026-05-01T00:00:00.000Z') },
      ])
      db.policyAssetCoverage.create.mockResolvedValue({
        id: '60000000-0000-0000-0000-000000000003', assetId: ASSET_ID, insuranceTypeId: TYPE_ID, coverageIds: [],
        insuredAmount: 1000, currency: 'ARS', exchangeRate: 1, insuredAmountArs: 1000, insuredAmountUsd: 1,
        companyId: null, costCenterId: null, beneficiaryDescription: null,
        effectiveDate: new Date('2026-06-01T00:00:00.000Z'), bajaDate: null, bajaReason: null,
        insuranceType: fakeInsuranceType, company: null, costCenter: null, asset: { id: ASSET_ID },
        attachments: [], _count: { attachments: 0 },
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetId: ASSET_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1, effectiveDate: '2026-06-01' })

      expect(res.status).toBe(201)
      expect(db.policyAssetCoverage.create).toHaveBeenCalled()
    })

    it('returns 409 when the new line overlaps an existing active line for the same asset', async () => {
      db.policy.findUnique.mockResolvedValue({ startDate: BASE_DATE, endDate: END_DATE })
      db.asset.findFirst.mockResolvedValue({ id: ASSET_ID })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.policyAssetCoverage.findMany.mockResolvedValue([
        { effectiveDate: new Date('2026-01-01T00:00:00.000Z'), bajaDate: null },
      ])

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetId: ASSET_ID, insuranceTypeId: TYPE_ID, insuredAmount: 1000, exchangeRate: 1, effectiveDate: '2026-06-01' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('COVERAGE_OVERLAP')
      expect(db.policyAssetCoverage.create).not.toHaveBeenCalled()
    })
  })

  // ── PUT /api/v1/policies/:id/coverages/:coverageId ───────────────────────────

  describe('PUT /api/v1/policies/:id/coverages/:coverageId', () => {
    it('updates fields of an active line', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, assetId: null, effectiveDate: BASE_DATE, bajaDate: null,
        _count: { attachments: 0 },
      })
      db.insuranceType.findFirst.mockResolvedValue(fakeInsuranceType)
      db.policyAssetCoverage.update.mockResolvedValue({
        id: COVERAGE_ID, assetId: null, insuranceTypeId: TYPE_ID, coverageIds: [],
        insuredAmount: 2000, currency: 'ARS', exchangeRate: 1, insuredAmountArs: 2000, insuredAmountUsd: 2,
        companyId: null, costCenterId: null, beneficiaryDescription: null,
        insuranceType: fakeInsuranceType, company: null, costCenter: null, asset: null,
        attachments: [], _count: { attachments: 0 },
      })

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuranceTypeId: TYPE_ID, insuredAmount: 2000, exchangeRate: 1 })

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.update).toHaveBeenCalled()
    })

    it('returns 409 when trying to edit a line that is already de baja', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, assetId: null, effectiveDate: BASE_DATE,
        bajaDate: new Date('2026-06-01T00:00:00.000Z'),
        _count: { attachments: 0 },
      })

      const res = await request(app)
        .put(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ insuranceTypeId: TYPE_ID, insuredAmount: 2000, exchangeRate: 1 })

      expect(res.status).toBe(409)
      expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    })
  })

  // ── DELETE /api/v1/policies/:id/coverages/:coverageId ────────────────────────

  describe('DELETE /api/v1/policies/:id/coverages/:coverageId', () => {
    it('returns 409 when the coverage has attachments', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({ id: COVERAGE_ID, _count: { attachments: 1, allocations: 0 } })

      const res = await request(app)
        .delete(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('COVERAGE_HAS_ATTACHMENTS')
      expect(db.policyAssetCoverage.delete).not.toHaveBeenCalled()
    })

    it('returns 409 when the coverage has allocations', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({ id: COVERAGE_ID, _count: { attachments: 0, allocations: 1 } })

      const res = await request(app)
        .delete(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('COVERAGE_HAS_ALLOCATIONS')
      expect(db.policyAssetCoverage.delete).not.toHaveBeenCalled()
    })

    it('allows physical deletion when the coverage has no attachments nor allocations', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({ id: COVERAGE_ID, _count: { attachments: 0, allocations: 0 } })
      db.policyAssetCoverage.delete.mockResolvedValue({ id: COVERAGE_ID })

      const res = await request(app)
        .delete(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.policyAssetCoverage.delete).toHaveBeenCalledWith({ where: { id: COVERAGE_ID } })
    })
  })

  // ── POST /api/v1/policies/:id/coverages/:coverageId/de-baja ──────────────────

  describe('POST /api/v1/policies/:id/coverages/:coverageId/de-baja', () => {
    it('returns 200 with a valid bajaDate and bajaReason', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, effectiveDate: BASE_DATE, bajaDate: null, policy: { endDate: END_DATE },
      })
      db.policyAssetCoverage.update.mockResolvedValue({
        id: COVERAGE_ID, assetId: null, insuranceTypeId: TYPE_ID, coverageIds: [],
        insuredAmount: 1000, currency: 'ARS', exchangeRate: 1, insuredAmountArs: 1000, insuredAmountUsd: 1,
        companyId: null, costCenterId: null, beneficiaryDescription: null,
        effectiveDate: BASE_DATE, bajaDate: new Date('2026-06-15T00:00:00.000Z'), bajaReason: 'Venta del activo',
        deactivatedAt: new Date(), deactivatedBy: 'admin@test.com',
        insuranceType: fakeInsuranceType, company: null, costCenter: null, asset: null,
        attachments: [], _count: { attachments: 0 },
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2026-06-15', bajaReason: 'Venta del activo' })

      expect(res.status).toBe(200)
      const updateCall = db.policyAssetCoverage.update.mock.calls[0][0]
      expect(updateCall.data.bajaReason).toBe('Venta del activo')
      expect(updateCall.data.bajaDate).toEqual(new Date('2026-06-15T00:00:00.000Z'))
    })

    it('returns 422 when bajaReason is missing', async () => {
      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2026-06-15' })

      expect(res.status).toBe(422)
      expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    })

    it('returns 400 when bajaDate is before effectiveDate', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, effectiveDate: new Date('2026-06-01T00:00:00.000Z'), bajaDate: null, policy: { endDate: END_DATE },
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2026-05-01', bajaReason: 'Error de carga' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_DATE_RANGE')
      expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    })

    it('returns 400 when bajaDate is after policy.endDate', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, effectiveDate: BASE_DATE, bajaDate: null, policy: { endDate: END_DATE },
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2027-01-15', bajaReason: 'Renovación futura' })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_DATE_RANGE')
      expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    })

    it('returns 409 when the line is already deactivated', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, effectiveDate: BASE_DATE, bajaDate: new Date('2026-05-01T00:00:00.000Z'),
        policy: { endDate: END_DATE },
      })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2026-06-01', bajaReason: 'Intento de doble baja' })

      expect(res.status).toBe(409)
      expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    })

    it('never touches attachments when deactivating', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, effectiveDate: BASE_DATE, bajaDate: null, policy: { endDate: END_DATE },
      })
      db.policyAssetCoverage.update.mockResolvedValue({
        id: COVERAGE_ID, insuranceType: fakeInsuranceType, coverageIds: [], attachments: [], _count: { attachments: 0 },
      })

      await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2026-06-15', bajaReason: 'Venta' })

      expect(db.policyAttachment.delete).not.toHaveBeenCalled()
    })

    it('never touches document allocations when deactivating', async () => {
      db.policyAssetCoverage.findFirst.mockResolvedValue({
        id: COVERAGE_ID, effectiveDate: BASE_DATE, bajaDate: null, policy: { endDate: END_DATE },
      })
      db.policyAssetCoverage.update.mockResolvedValue({
        id: COVERAGE_ID, insuranceType: fakeInsuranceType, coverageIds: [], attachments: [], _count: { attachments: 0 },
      })

      await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/coverages/${COVERAGE_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ bajaDate: '2026-06-15', bajaReason: 'Venta' })

      expect(db.documentPolicyAllocation.deleteMany).not.toHaveBeenCalled()
    })
  })

  // ── POST /api/v1/policies/:id/de-baja ────────────────────────────────────────

  describe('POST /api/v1/policies/:id/de-baja', () => {
    const UPDATED_AT = new Date('2026-07-27T12:00:00.000Z')

    function mockDeBajaUpdate(overrides: Record<string, unknown> = {}) {
      db.policy.update.mockResolvedValue({
        id: POLICY_ID,
        policyNumber: 'POL-TEST-001',
        insuredName: 'La Segunda',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        description: null,
        isActive: true,
        deactivatedAt: UPDATED_AT,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: UPDATED_AT,
        producer: null,
        coverages: [],
        ...overrides,
      })
    }

    it('returns 200 when deactivating a vigente policy', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: null })
      mockDeBajaUpdate()

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('de_baja')
      expect(res.body.data.deactivatedAt).toBeTruthy()
    })

    it('returns 200 when deactivating a proxima_a_vencer policy', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: null })
      mockDeBajaUpdate()

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('de_baja')
    })

    it('returns 200 when deactivating a vencida policy', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: null })
      mockDeBajaUpdate()

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('de_baja')
    })

    it('returns 409 when the policy is already deactivated', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: UPDATED_AT })

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(db.policy.update).not.toHaveBeenCalled()
    })

    it('returns 404 when the policy does not exist', async () => {
      db.policy.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })

    it('sets deactivatedAt on the updated policy', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: null })
      mockDeBajaUpdate()

      await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      const updateCall = db.policy.update.mock.calls[0][0]
      expect(updateCall.data.deactivatedAt).toBeInstanceOf(Date)
    })

    it('does not delete coverages or related data', async () => {
      db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: null })
      mockDeBajaUpdate()

      await request(app)
        .post(`/api/v1/policies/${POLICY_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(db.policyAssetCoverage.deleteMany).not.toHaveBeenCalled()
      expect(db.policyAttachment.delete).not.toHaveBeenCalled()
      expect(db.documentPolicyAllocation.deleteMany).not.toHaveBeenCalled()
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
