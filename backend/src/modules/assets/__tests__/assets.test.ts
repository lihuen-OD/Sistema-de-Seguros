import request from 'supertest'
import { app } from '../../../app'
import { adminToken, contadorToken, viewerToken } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    asset: {
      findMany:   jest.fn(),
      count:      jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
    },
    costCenter: { findMany: jest.fn() },
    assetAllocation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    assetValueHistory: {
      findMany: jest.fn(),
      create:   jest.fn(),
    },
    assetAttachment: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      delete:    jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary:     jest.fn(),
  deleteFromCloudinary:   jest.fn(),
}))

import { prisma } from '../../../config/database'
const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z')

// Proper UUIDs required by Zod .uuid() validation on costCenterId
const ASSET_ID   = '30000000-0000-0000-0000-000000000001'
const CC_ID      = '40000000-0000-0000-0000-000000000001'
const CC_ID2     = '40000000-0000-0000-0000-000000000002'
const COMPANY_ID = '50000000-0000-0000-0000-000000000001'
const OTHER_ID   = '30000000-0000-0000-0000-000000000099'

const fakeCostCenter = {
  id: CC_ID,
  name: 'Producción',
  code: 'PROD',
  isActive: true,
}

const fakeAsset = {
  id: ASSET_ID,
  name: 'Toyota Hilux',
  assetType: 'camioneta',
  brand: 'Toyota',
  model: 'Hilux 4x4',
  serialNumber: null,
  purchaseDate: null,
  purchaseValue: null,
  currentValue: null,
  location: null,
  description: null,
  isActive: true,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  allocations: [
    {
      id: '30000000-0000-0000-0000-000000000002',
      assetId: ASSET_ID,
      companyId: COMPANY_ID,
      costCenterId: CC_ID,
      percentage: 100,
      company: { id: COMPANY_ID, name: 'Empresa Test', cuit: '30-71234567-8' },
      costCenter: { id: CC_ID, name: 'Producción', code: 'PROD' },
    },
  ],
  valueHistory: [],
  attachments: [],
  _count: { attachments: 0, fireExtinguishers: 0 },
}

const validAssetBody = {
  name: 'Toyota Hilux',
  assetType: 'camioneta',
  allocations: [{ companyId: COMPANY_ID, costCenterId: CC_ID, percentage: 100 }],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Assets API', () => {

  // ── GET /api/v1/assets ──────────────────────────────────────────────────────

  describe('GET /api/v1/assets', () => {
    it('returns 200 with paginated list', async () => {
      db.asset.findMany.mockResolvedValue([fakeAsset])
      db.asset.count.mockResolvedValue(1)

      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].name).toBe('Toyota Hilux')
      expect(res.body.pagination.total).toBe(1)
    })

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/assets')
      expect(res.status).toBe(401)
    })

    it('VIEWER can list assets', async () => {
      db.asset.findMany.mockResolvedValue([])
      db.asset.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${viewerToken()}`)

      expect(res.status).toBe(200)
    })
  })

  // ── GET /api/v1/assets/:id ──────────────────────────────────────────────────

  describe('GET /api/v1/assets/:id', () => {
    it('returns 200 with asset detail', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)

      const res = await request(app)
        .get(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(ASSET_ID)
      expect(res.body.data.allocations).toHaveLength(1)
    })

    it('returns 404 when asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/assets/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  // ── POST /api/v1/assets ─────────────────────────────────────────────────────

  describe('POST /api/v1/assets', () => {
    it('returns 201 when ADMIN creates an asset', async () => {
      db.costCenter.findMany.mockResolvedValue([fakeCostCenter])
      // create uses a callback-based $transaction(async (tx) => { tx.asset.create, tx.assetAllocation.createMany, tx.asset.findUniqueOrThrow })
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: {
            create: jest.fn().mockResolvedValue(fakeAsset),
            findUniqueOrThrow: jest.fn().mockResolvedValue(fakeAsset),
          },
          assetAllocation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      )

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validAssetBody)

      expect(res.status).toBe(201)
      expect(res.body.data.name).toBe('Toyota Hilux')
    })

    it('returns 201 when CONTADOR creates an asset', async () => {
      db.costCenter.findMany.mockResolvedValue([fakeCostCenter])
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: {
            create: jest.fn().mockResolvedValue(fakeAsset),
            findUniqueOrThrow: jest.fn().mockResolvedValue(fakeAsset),
          },
          assetAllocation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
        }),
      )

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${contadorToken()}`)
        .send(validAssetBody)

      expect(res.status).toBe(201)
    })

    it('returns 403 when VIEWER tries to create asset', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send(validAssetBody)

      expect(res.status).toBe(403)
    })

    it('returns 422 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ assetType: 'camioneta', allocations: [{ costCenterId: 'cc-uuid-1', percentage: 100 }] })

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })

    it('returns 422 when allocations do not sum to 100%', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          name: 'Toyota Hilux',
          assetType: 'camioneta',
          allocations: [
            { companyId: COMPANY_ID, costCenterId: CC_ID, percentage: 60 },
            { companyId: COMPANY_ID, costCenterId: CC_ID2, percentage: 30 },
            // 90% total — should fail
          ],
        })

      expect(res.status).toBe(422)
      expect(res.body.error.details.some((d: { message: string }) =>
        d.message.includes('100%'),
      )).toBe(true)
    })

    it('returns 422 when allocations array is empty', async () => {
      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Toyota Hilux', assetType: 'camioneta', allocations: [] })

      expect(res.status).toBe(422)
    })

    it('returns 400 when cost center does not exist', async () => {
      db.costCenter.findMany.mockResolvedValue([]) // cost center not found

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validAssetBody)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })
  })

  // ── PUT /api/v1/assets/:id ──────────────────────────────────────────────────

  describe('PUT /api/v1/assets/:id', () => {
    it('returns 200 when ADMIN updates asset fields', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      db.asset.update.mockResolvedValue({ ...fakeAsset, name: 'Toyota Hilux Pro', allocations: fakeAsset.allocations, valueHistory: [], attachments: [], _count: fakeAsset._count })

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Toyota Hilux Pro' })

      expect(res.status).toBe(200)
    })

    it('returns 404 when asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put(`/api/v1/assets/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Updated' })

      expect(res.status).toBe(404)
    })

    it('returns 403 when VIEWER tries to update', async () => {
      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send({ name: 'Updated' })

      expect(res.status).toBe(403)
    })
  })

  // ── DELETE /api/v1/assets/:id ───────────────────────────────────────────────

  describe('DELETE /api/v1/assets/:id', () => {
    it('returns 200 when ADMIN soft-deletes asset', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      db.asset.update.mockResolvedValue({ ...fakeAsset, isActive: false })

      const res = await request(app)
        .delete(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.asset.update.mock.calls[0][0].data.isActive).toBe(false)
    })

    it('returns 403 when CONTADOR tries to delete', async () => {
      const res = await request(app)
        .delete(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${contadorToken()}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 when asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .delete(`/api/v1/assets/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
    })
  })

  // ── PUT /api/v1/assets/:id/allocations ─────────────────────────────────────

  describe('PUT /api/v1/assets/:id/allocations', () => {
    it('returns 422 when new allocations do not sum to 100%', async () => {
      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}/allocations`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({
          allocations: [
            { companyId: COMPANY_ID, costCenterId: CC_ID, percentage: 50 },
            // missing 50% to reach 100
          ],
        })

      expect(res.status).toBe(422)
    })

    it('returns 200 when ADMIN replaces allocations correctly', async () => {
      // replaceAllocations calls assertExists (findUnique) then findById (findUnique) at the end
      db.asset.findUnique
        .mockResolvedValueOnce(fakeAsset) // assertExists
        .mockResolvedValueOnce(fakeAsset) // final findById (for response)
      db.costCenter.findMany.mockResolvedValue([fakeCostCenter])
      // $transaction receives array of Prisma lazy promises — just resolve it
      db.$transaction.mockResolvedValue([])

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}/allocations`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ allocations: [{ companyId: COMPANY_ID, costCenterId: CC_ID, percentage: 100 }] })

      expect(res.status).toBe(200)
    })
  })
})
