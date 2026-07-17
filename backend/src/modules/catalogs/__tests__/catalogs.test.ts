import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    catalogItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    fireExtinguisher: { count: jest.fn() },
    claim: { count: jest.fn() },
    accountingDocument: { count: jest.fn() },
    policy: { count: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const ITEM_ID = '90000000-0000-0000-0000-000000000001'

function fakeItem(overrides: Record<string, unknown> = {}) {
  return { id: ITEM_ID, category: 'fire_ext_type', label: 'CO2', sortOrder: 0, isActive: true, ...overrides }
}

describe('Catalogs API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.fireExtinguisher.count.mockResolvedValue(0)
    db.claim.count.mockResolvedValue(0)
    db.accountingDocument.count.mockResolvedValue(0)
    db.policy.count.mockResolvedValue(0)
  })

  // ── POST /:category (create) ──────────────────────────────────────────────

  describe('POST /api/v1/catalogs/:category', () => {
    it('returns 201 on a valid create', async () => {
      db.catalogItem.create.mockResolvedValue(fakeItem())

      const res = await request(app)
        .post('/api/v1/catalogs/fire_ext_type')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ label: 'CO2' })

      expect(res.status).toBe(201)
    })

    it('returns 409 DUPLICATE_CATALOG_ITEM on a unique constraint violation', async () => {
      db.catalogItem.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['category', 'label'] },
        }),
      )

      const res = await request(app)
        .post('/api/v1/catalogs/fire_ext_type')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ label: 'CO2' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_CATALOG_ITEM')
    })

    it('returns 400 when label exceeds 200 characters', async () => {
      const res = await request(app)
        .post('/api/v1/catalogs/fire_ext_type')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ label: 'x'.repeat(201) })

      expect(res.status).toBe(400)
    })

    it('returns 403 for a USER without the module_config module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post('/api/v1/catalogs/fire_ext_type')
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ label: 'CO2' })

      expect(res.status).toBe(403)
    })
  })

  // ── DELETE /:category/:id ──────────────────────────────────────────────────

  describe('DELETE /api/v1/catalogs/:category/:id', () => {
    it('deletes an item with zero usages (category with a registered check)', async () => {
      db.catalogItem.findUnique.mockResolvedValue(fakeItem())
      db.fireExtinguisher.count.mockResolvedValue(0)
      db.catalogItem.delete.mockResolvedValue(fakeItem())

      const res = await request(app)
        .delete(`/api/v1/catalogs/fire_ext_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.catalogItem.delete).toHaveBeenCalledWith({ where: { id: ITEM_ID } })
    })

    it('returns 409 CATALOG_ITEM_IN_USE when a fire_ext_type value is referenced by a fire extinguisher', async () => {
      db.catalogItem.findUnique.mockResolvedValue(fakeItem({ label: 'CO2' }))
      db.fireExtinguisher.count.mockResolvedValue(1)

      const res = await request(app)
        .delete(`/api/v1/catalogs/fire_ext_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CATALOG_ITEM_IN_USE')
      expect(db.catalogItem.delete).not.toHaveBeenCalled()
    })

    it('sums usages across every mapped model/field for insurance_company', async () => {
      db.catalogItem.findUnique.mockResolvedValue(fakeItem({ category: 'insurance_company', label: 'La Segunda' }))
      db.accountingDocument.count.mockResolvedValue(2)
      db.claim.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0) // insuranceCompany, thirdPartyInsuranceCompany

      const res = await request(app)
        .delete(`/api/v1/catalogs/insurance_company/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(409)
      expect(res.body.error.message).toContain('3')
    })

    it('allows deleting an item from a category with NO registered usage check (documented gap, not a regression)', async () => {
      db.catalogItem.findUnique.mockResolvedValue(fakeItem({ category: 'task_type', label: 'Renovar póliza' }))
      db.catalogItem.delete.mockResolvedValue(fakeItem({ category: 'task_type' }))

      const res = await request(app)
        .delete(`/api/v1/catalogs/task_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.catalogItem.delete).toHaveBeenCalled()
    })

    it('returns 403 for a USER without the module_config module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .delete(`/api/v1/catalogs/fire_ext_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── PATCH /:category/:id (deactivate) ─────────────────────────────────────

  describe('PATCH /api/v1/catalogs/:category/:id', () => {
    it('returns 409 CATALOG_ITEM_IN_USE when deactivating a value in use', async () => {
      db.catalogItem.findUnique.mockResolvedValue(fakeItem({ category: 'claim_type', label: 'Incendio' }))
      db.claim.count.mockResolvedValue(4)

      const res = await request(app)
        .patch(`/api/v1/catalogs/claim_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ isActive: false })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CATALOG_ITEM_IN_USE')
      expect(db.catalogItem.update).not.toHaveBeenCalled()
    })

    it('allows renaming a label even when the value is in use (rename does not require the usage check)', async () => {
      db.catalogItem.update.mockResolvedValue(fakeItem({ label: 'CO2 renovado' }))

      const res = await request(app)
        .patch(`/api/v1/catalogs/fire_ext_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ label: 'CO2 renovado' })

      expect(res.status).toBe(200)
      expect(db.catalogItem.findUnique).not.toHaveBeenCalled()
      expect(db.catalogItem.update).toHaveBeenCalled()
    })

    it('returns 409 DUPLICATE_CATALOG_ITEM when renaming into an existing label', async () => {
      db.catalogItem.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['category', 'label'] },
        }),
      )

      const res = await request(app)
        .patch(`/api/v1/catalogs/fire_ext_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ label: 'Agua' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_CATALOG_ITEM')
    })

    it('returns 400 when label exceeds 200 characters', async () => {
      const res = await request(app)
        .patch(`/api/v1/catalogs/fire_ext_type/${ITEM_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ label: 'x'.repeat(201) })

      expect(res.status).toBe(400)
    })
  })
})
