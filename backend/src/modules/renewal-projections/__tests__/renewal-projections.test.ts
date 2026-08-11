import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    policy: { findMany: jest.fn(), count: jest.fn() },
    accountingDocument: { findMany: jest.fn() },
    assetRenewalProjectionOverride: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const ASSET_ID = '90000000-0000-0000-0000-000000000010'

function fakeOverride(overrides: Record<string, unknown> = {}) {
  return {
    id: 'override-1',
    assetId: ASSET_ID,
    mode: 'FINANCIAL',
    netOverride: null,
    vatOverride: null,
    otherOverride: null,
    growthPercentOverride: null,
    ...overrides,
  }
}

describe('Renewal Projections API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
  })

  // ── GET /overrides/:mode ────────────────────────────────────────────────────

  describe('GET /api/v1/renewal-projections/overrides/:mode', () => {
    it('returns 200 with the override list filtered by mode', async () => {
      db.assetRenewalProjectionOverride.findMany.mockResolvedValue([fakeOverride()])

      const res = await request(app)
        .get('/api/v1/renewal-projections/overrides/FINANCIAL')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(db.assetRenewalProjectionOverride.findMany).toHaveBeenCalledWith({ where: { mode: 'FINANCIAL' } })
    })

    it('returns 400 INVALID_MODE for a mode outside FINANCIAL/ECONOMIC', async () => {
      const res = await request(app)
        .get('/api/v1/renewal-projections/overrides/BOGUS')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_MODE')
    })

    it('returns 403 for a USER without either module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .get('/api/v1/renewal-projections/overrides/FINANCIAL')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })

    it('returns 200 for a USER with only renewal_projections_economic', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['renewal_projections_economic'] }))
      db.assetRenewalProjectionOverride.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/renewal-projections/overrides/ECONOMIC')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
    })
  })

  // ── PUT /overrides/:mode/:assetId ───────────────────────────────────────────

  describe('PUT /api/v1/renewal-projections/overrides/:mode/:assetId', () => {
    it('upserts keyed by assetId+mode and returns 200 on a valid body', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ netOverride: 100 }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverride: 100 })

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.upsert).toHaveBeenCalledWith({
        where: { assetId_mode: { assetId: ASSET_ID, mode: 'FINANCIAL' } },
        create: { assetId: ASSET_ID, mode: 'FINANCIAL', netOverride: 100 },
        update: { netOverride: 100 },
      })
    })

    it('the same assetId in FINANCIAL and ECONOMIC upserts two independent rows — no se pisan', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ mode: 'ECONOMIC', netOverride: 999 }))

      await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverride: 100 })
      await request(app)
        .put(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverride: 999 })

      expect(db.assetRenewalProjectionOverride.upsert).toHaveBeenNthCalledWith(1, expect.objectContaining({
        where: { assetId_mode: { assetId: ASSET_ID, mode: 'FINANCIAL' } },
      }))
      expect(db.assetRenewalProjectionOverride.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
        where: { assetId_mode: { assetId: ASSET_ID, mode: 'ECONOMIC' } },
      }))
    })

    it('accepts cycleLengthMonthsOverride and installmentsCountOverride', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ cycleLengthMonthsOverride: 6, installmentsCountOverride: 2 }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ cycleLengthMonthsOverride: 6, installmentsCountOverride: 2 })

      expect(res.status).toBe(200)
      expect(res.body.data.cycleLengthMonthsOverride).toBe(6)
      expect(res.body.data.installmentsCountOverride).toBe(2)
    })

    it('returns 422 for cycleLengthMonthsOverride below 1 or non-integer', async () => {
      const res1 = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ cycleLengthMonthsOverride: 0 })
      expect(res1.status).toBe(422)

      const res2 = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ installmentsCountOverride: 2.5 })
      expect(res2.status).toBe(422)
    })

    it('accepts a valid startMonthOverride (YYYY-MM)', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ startMonthOverride: '2026-12' }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ startMonthOverride: '2026-12' })

      expect(res.status).toBe(200)
      expect(res.body.data.startMonthOverride).toBe('2026-12')
    })

    it('returns 422 for a malformed startMonthOverride', async () => {
      const res1 = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ startMonthOverride: '2026-13' })
      expect(res1.status).toBe(422)

      const res2 = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ startMonthOverride: 'diciembre' })
      expect(res2.status).toBe(422)
    })

    it('accepts a negative growthPercentOverride — the whole point of this schema', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ growthPercentOverride: -5 }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ growthPercentOverride: -5 })

      expect(res.status).toBe(200)
      expect(res.body.data.growthPercentOverride).toBe(-5)
    })

    it('returns 404 when the asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverride: 100 })

      expect(res.status).toBe(404)
      expect(db.assetRenewalProjectionOverride.upsert).not.toHaveBeenCalled()
    })

    it('returns 422 when growthPercentOverride is below the -100 floor', async () => {
      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ growthPercentOverride: -150 })

      expect(res.status).toBe(422)
      expect(db.asset.findUnique).not.toHaveBeenCalled()
    })

    it('returns 400 INVALID_MODE for a mode outside FINANCIAL/ECONOMIC', async () => {
      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/BOGUS/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverride: 100 })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_MODE')
    })

    it('returns 403 for a USER without either module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ netOverride: 100 })

      expect(res.status).toBe(403)
    })
  })

  // ── DELETE /overrides/:mode/:assetId ────────────────────────────────────────

  describe('DELETE /api/v1/renewal-projections/overrides/:mode/:assetId', () => {
    it('returns 200 and is idempotent even when nothing matched', async () => {
      db.assetRenewalProjectionOverride.deleteMany.mockResolvedValue({ count: 0 })

      const res = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.deleteMany).toHaveBeenCalledWith({ where: { assetId: ASSET_ID, mode: 'ECONOMIC' } })
    })

    it('returns 403 for a USER without either module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── Ampliación de accesos (§1.2 del plan) ──────────────────────────────────
  // Un perfil con SOLO uno de los dos módulos de renovaciones (sin
  // assets/policies/financial_analysis) debe poder seguir leyendo estos 3
  // endpoints — si alguien "simplifica" el OR-list de requireModule más
  // adelante, este test lo detecta.

  describe('un perfil con solo un módulo de renovaciones puede leer assets/policies/documents financial', () => {
    it('GET /api/v1/assets → 200 con solo renewal_projections', async () => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: ['renewal_projections'] }))
      db.asset.findMany.mockResolvedValue([])
      db.asset.count.mockResolvedValue(0)

      const res = await request(app).get('/api/v1/assets').set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
    })

    it('GET /api/v1/policies → 200 con solo renewal_projections_economic', async () => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: ['renewal_projections_economic'] }))
      db.policy.findMany.mockResolvedValue([])
      db.policy.count.mockResolvedValue(0)

      const res = await request(app).get('/api/v1/policies').set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
    })

    it('GET /api/v1/documents/financial → 200 con solo renewal_projections_economic', async () => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: ['renewal_projections_economic'] }))
      db.accountingDocument.findMany.mockResolvedValue([])

      const res = await request(app).get('/api/v1/documents/financial').set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
    })
  })
})
