import fs from 'fs'
import path from 'path'
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
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    exchangeRateLog: { findFirst: jest.fn() },
    $transaction: jest.fn(),
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
    netOverrideUsd: null,
    vatOverrideUsd: null,
    otherOverrideUsd: null,
    growthPercentUsdOverride: null,
    cycleLengthMonthsOverride: null,
    installmentsCountOverride: null,
    startMonthOverride: null,
    legacyConvertedRate: null,
    legacyConvertedAt: null,
    legacyConvertedBy: null,
    ...overrides,
  }
}

const SEED_RATE_ID = 'a0000000-0000-4000-8000-000000000001'

function fakeRate(rate: number, id = 'rate-real-1') {
  return { id, rate, updatedBy: 'admin@test.com', createdAt: new Date('2026-11-01T12:00:00Z') }
}

describe('Renewal Projections API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    // reset/convertLegacy usan la forma interactiva ($transaction(async tx => …))
    // — el mock le pasa el mismo cliente mockeado como `tx`.
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db))
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
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ netOverrideUsd: 100 }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: 100 })

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.upsert).toHaveBeenCalledWith({
        where: { assetId_mode: { assetId: ASSET_ID, mode: 'FINANCIAL' } },
        create: { assetId: ASSET_ID, mode: 'FINANCIAL', netOverrideUsd: 100 },
        update: { netOverrideUsd: 100 },
      })
    })

    it('the same assetId in FINANCIAL and ECONOMIC upserts two independent rows — no se pisan', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ mode: 'ECONOMIC', netOverrideUsd: 999 }))

      await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: 100 })
      await request(app)
        .put(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: 999 })

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

    it('accepts a negative growthPercentUsdOverride — the whole point of this schema', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ growthPercentUsdOverride: -5 }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ growthPercentUsdOverride: -5 })

      expect(res.status).toBe(200)
      expect(res.body.data.growthPercentUsdOverride).toBe(-5)
    })

    it('accepts the USD base fields (net/vat/other) and null to clear one', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })
      db.assetRenewalProjectionOverride.upsert.mockResolvedValue(fakeOverride({ vatOverrideUsd: 210.5 }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ vatOverrideUsd: 210.5, otherOverrideUsd: null })

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.upsert.mock.calls[0][0].update).toEqual({ vatOverrideUsd: 210.5, otherOverrideUsd: null })
    })

    it('returns 422 for a negative USD amount', async () => {
      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: -1 })

      expect(res.status).toBe(422)
      expect(db.assetRenewalProjectionOverride.upsert).not.toHaveBeenCalled()
    })

    // Preservación del histórico: los campos legados (ARS / % pensado en
    // pesos) y la trazabilidad de conversión son de solo lectura. Un cliente
    // (ej. frontend viejo cacheado) que intente escribirlos recibe un error
    // de validación y NADA se escribe.
    it.each([
      ['netOverride', 100],
      ['vatOverride', 21],
      ['otherOverride', 3],
      ['growthPercentOverride', 50],
      ['legacyConvertedRate', 1000],
      ['legacyConvertedAt', '2026-11-10T00:00:00.000Z'],
      ['legacyConvertedBy', 'x@y.com'],
    ])('returns 422 and writes nothing when the body includes the protected field %s', async (field, value) => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID })

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: 10, [field]: value })

      expect(res.status).toBe(422)
      expect(db.assetRenewalProjectionOverride.upsert).not.toHaveBeenCalled()
    })

    it('returns 404 when the asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: 100 })

      expect(res.status).toBe(404)
      expect(db.assetRenewalProjectionOverride.upsert).not.toHaveBeenCalled()
    })

    it('returns 422 when growthPercentUsdOverride is below the -100 floor', async () => {
      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ growthPercentUsdOverride: -150 })

      expect(res.status).toBe(422)
      expect(db.asset.findUnique).not.toHaveBeenCalled()
    })

    it('returns 400 INVALID_MODE for a mode outside FINANCIAL/ECONOMIC', async () => {
      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/BOGUS/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ netOverrideUsd: 100 })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_MODE')
    })

    it('returns 403 for a USER without either module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .put(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ netOverrideUsd: 100 })

      expect(res.status).toBe(403)
    })
  })

  // ── DELETE /overrides/:mode/:assetId ────────────────────────────────────────

  describe('DELETE /api/v1/renewal-projections/overrides/:mode/:assetId', () => {
    it('returns 200 and is idempotent when there is no row', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.findUnique).toHaveBeenCalledWith({
        where: { assetId_mode: { assetId: ASSET_ID, mode: 'ECONOMIC' } },
      })
      expect(db.assetRenewalProjectionOverride.deleteMany).not.toHaveBeenCalled()
      expect(db.assetRenewalProjectionOverride.update).not.toHaveBeenCalled()
    })

    it('deletes a row WITHOUT protected data — guarded so it only deletes while all protected fields stay null', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(fakeOverride({ netOverrideUsd: 500, growthPercentUsdOverride: 3, cycleLengthMonthsOverride: 6 }))
      db.assetRenewalProjectionOverride.deleteMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.deleteMany).toHaveBeenCalledWith({
        where: {
          id: 'override-1',
          netOverride: null,
          vatOverride: null,
          otherOverride: null,
          growthPercentOverride: null,
          legacyConvertedRate: null,
          legacyConvertedAt: null,
          legacyConvertedBy: null,
        },
      })
      expect(db.assetRenewalProjectionOverride.update).not.toHaveBeenCalled()
    })

    // "Volver al automático" NUNCA borra información histórica: con
    // cualquier campo protegido presente, solo limpia los campos vigentes.
    it.each([
      ['netOverride (ARS legado)', { netOverride: 1_500_000 }],
      ['vatOverride (ARS legado)', { vatOverride: 315_000 }],
      ['otherOverride (ARS legado)', { otherOverride: 12_000 }],
      ['growthPercentOverride (% legado)', { growthPercentOverride: 85 }],
      ['legacyConvertedAt (solo trazabilidad)', { legacyConvertedAt: new Date('2026-11-01T00:00:00Z') }],
    ])('with %s present: updates only the current fields and never deletes', async (_label, protectedData) => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(
        fakeOverride({ ...protectedData, netOverrideUsd: 900, growthPercentUsdOverride: 5, startMonthOverride: '2027-01' }),
      )
      db.assetRenewalProjectionOverride.update.mockResolvedValue({})

      const res = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.delete).not.toHaveBeenCalled()
      expect(db.assetRenewalProjectionOverride.deleteMany).not.toHaveBeenCalled()
      expect(db.assetRenewalProjectionOverride.update).toHaveBeenCalledTimes(1)
      const { where, data } = db.assetRenewalProjectionOverride.update.mock.calls[0][0]
      expect(where).toEqual({ id: 'override-1' })
      expect(data).toEqual({
        netOverrideUsd: null,
        vatOverrideUsd: null,
        otherOverrideUsd: null,
        growthPercentUsdOverride: null,
        cycleLengthMonthsOverride: null,
        installmentsCountOverride: null,
        startMonthOverride: null,
      })
      // Ningún campo protegido aparece en la escritura.
      for (const field of ['netOverride', 'vatOverride', 'otherOverride', 'growthPercentOverride', 'legacyConvertedRate', 'legacyConvertedAt', 'legacyConvertedBy']) {
        expect(data).not.toHaveProperty(field)
      }
    })

    it('returns 403 for a USER without either module', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/FINANCIAL/${ASSET_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── POST /overrides/:mode/:assetId/convert-legacy ──────────────────────────

  describe('POST /api/v1/renewal-projections/overrides/:mode/:assetId/convert-legacy', () => {
    const url = (mode = 'FINANCIAL') => `/api/v1/renewal-projections/overrides/${mode}/${ASSET_ID}/convert-legacy`

    function legacyRow(overrides: Record<string, unknown> = {}) {
      return fakeOverride({ netOverride: 1_234_567, vatOverride: 259_259, otherOverride: null, ...overrides })
    }

    it('converts exactly the previewed fields with the server-side current rate, keeps ARS intact and records rate/date/user', async () => {
      db.assetRenewalProjectionOverride.findUnique
        .mockResolvedValueOnce(legacyRow())
        .mockResolvedValueOnce(legacyRow({ netOverrideUsd: 1028.81, vatOverrideUsd: 216.05, legacyConvertedRate: 1200 }))
      db.exchangeRateLog.findFirst.mockResolvedValue(fakeRate(1200))
      db.assetRenewalProjectionOverride.updateMany.mockResolvedValue({ count: 1 })

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['vat', 'net'] })

      expect(res.status).toBe(200)
      expect(db.assetRenewalProjectionOverride.updateMany).toHaveBeenCalledTimes(1)
      const { where, data } = db.assetRenewalProjectionOverride.updateMany.mock.calls[0][0]
      // Compare-and-set: no pisa un USD cargado en paralelo ni una conversión previa.
      expect(where).toEqual({ id: 'override-1', legacyConvertedAt: null, netOverrideUsd: null, vatOverrideUsd: null })
      // 1.234.567 / 1200 = 1028.8058… → 1028.81 ; 259.259 / 1200 = 216.0491… → 216.05
      expect(data.netOverrideUsd).toBe(1028.81)
      expect(data.vatOverrideUsd).toBe(216.05)
      expect(data).not.toHaveProperty('otherOverrideUsd')
      expect(data.legacyConvertedRate).toBe(1200)
      expect(data.legacyConvertedAt).toBeInstanceOf(Date)
      expect(data.legacyConvertedBy).toEqual(expect.any(String))
      // Los importes ARS originales y el % legado nunca se escriben.
      for (const field of ['netOverride', 'vatOverride', 'otherOverride', 'growthPercentOverride', 'growthPercentUsdOverride']) {
        expect(data).not.toHaveProperty(field)
      }
      expect(db.assetRenewalProjectionOverride.update).not.toHaveBeenCalled()
      expect(db.assetRenewalProjectionOverride.deleteMany).not.toHaveBeenCalled()
    })

    it('never overwrites a USD value already entered — that field is not convertible', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(legacyRow({ netOverrideUsd: 999 }))
      db.exchangeRateLog.findFirst.mockResolvedValue(fakeRate(1200))

      // La vista previa correcta solo incluye 'vat': pedir 'net' es una vista previa vieja.
      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['net', 'vat'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('PREVIEW_OUTDATED')
      expect(db.assetRenewalProjectionOverride.updateMany).not.toHaveBeenCalled()
    })

    it('returns 409 PREVIEW_OUTDATED (and nothing is kept) when the compare-and-set matched no row', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(legacyRow())
      db.exchangeRateLog.findFirst.mockResolvedValue(fakeRate(1200))
      db.assetRenewalProjectionOverride.updateMany.mockResolvedValue({ count: 0 })

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['net', 'vat'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('PREVIEW_OUTDATED')
    })

    it('returns 409 RATE_CHANGED when the current rate differs from the previewed one', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(legacyRow())
      db.exchangeRateLog.findFirst.mockResolvedValue(fakeRate(1250))

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['net', 'vat'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('RATE_CHANGED')
      expect(db.assetRenewalProjectionOverride.updateMany).not.toHaveBeenCalled()
    })

    it('returns 409 PLACEHOLDER_RATE when the only rate is the migration seed', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(legacyRow())
      db.exchangeRateLog.findFirst.mockResolvedValue(fakeRate(1000, SEED_RATE_ID))

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1000, fields: ['net', 'vat'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('PLACEHOLDER_RATE')
      expect(db.assetRenewalProjectionOverride.updateMany).not.toHaveBeenCalled()
    })

    it.each([
      ['no rate configured', null],
      ['rate = 1 (column default)', fakeRate(1)],
    ])('returns 409 NO_VALID_CURRENT_RATE with %s', async (_label, rateRow) => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(legacyRow())
      db.exchangeRateLog.findFirst.mockResolvedValue(rateRow)

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1, fields: ['net', 'vat'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('NO_VALID_CURRENT_RATE')
      expect(db.assetRenewalProjectionOverride.updateMany).not.toHaveBeenCalled()
    })

    it('returns 409 ALREADY_CONVERTED on a second conversion, writing nothing', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(legacyRow({ legacyConvertedAt: new Date('2026-11-05T00:00:00Z'), legacyConvertedRate: 1100 }))

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['net', 'vat'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_CONVERTED')
      expect(db.exchangeRateLog.findFirst).not.toHaveBeenCalled()
      expect(db.assetRenewalProjectionOverride.updateMany).not.toHaveBeenCalled()
    })

    it('returns 409 NOTHING_TO_CONVERT when only the legacy % exists (the % is never converted)', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(fakeOverride({ growthPercentOverride: 85 }))

      const res = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['net'] })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('NOTHING_TO_CONVERT')
      expect(db.assetRenewalProjectionOverride.updateMany).not.toHaveBeenCalled()
    })

    it('returns 404 when there is no override row for that asset+mode', async () => {
      db.assetRenewalProjectionOverride.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post(url('ECONOMIC'))
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ expectedRate: 1200, fields: ['net'] })

      expect(res.status).toBe(404)
      expect(db.assetRenewalProjectionOverride.findUnique).toHaveBeenCalledWith({
        where: { assetId_mode: { assetId: ASSET_ID, mode: 'ECONOMIC' } },
      })
    })

    it.each([
      ['empty fields', { expectedRate: 1200, fields: [] }],
      ['unknown field', { expectedRate: 1200, fields: ['pct'] }],
      ['non-positive rate', { expectedRate: 0, fields: ['net'] }],
      ['extra key', { expectedRate: 1200, fields: ['net'], netOverrideUsd: 5 }],
    ])('returns 422 for an invalid body (%s)', async (_label, body) => {
      const res = await request(app).post(url()).set('Authorization', `Bearer ${adminToken()}`).send(body)

      expect(res.status).toBe(422)
      expect(db.assetRenewalProjectionOverride.findUnique).not.toHaveBeenCalled()
    })

    it('returns 401 without a token and 403 for a USER without either module', async () => {
      const unauth = await request(app).post(url()).send({ expectedRate: 1200, fields: ['net'] })
      expect(unauth.status).toBe(401)

      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))
      const forbidden = await request(app)
        .post(url())
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ expectedRate: 1200, fields: ['net'] })
      expect(forbidden.status).toBe(403)
    })
  })

  // ── GET /exchange-rate/current — detección del placeholder ──────────────────

  describe('GET /api/v1/exchange-rate/current isPlaceholder', () => {
    it('is true for the migration seed row and false for a real one', async () => {
      db.exchangeRateLog.findFirst.mockResolvedValueOnce(fakeRate(1000, SEED_RATE_ID))
      const seed = await request(app).get('/api/v1/exchange-rate/current').set('Authorization', `Bearer ${adminToken()}`)
      expect(seed.status).toBe(200)
      expect(seed.body.data).toMatchObject({ rate: 1000, isPlaceholder: true })

      db.exchangeRateLog.findFirst.mockResolvedValueOnce(fakeRate(1435.5))
      const real = await request(app).get('/api/v1/exchange-rate/current').set('Authorization', `Bearer ${adminToken()}`)
      expect(real.body.data).toMatchObject({ rate: 1435.5, isPlaceholder: false })
    })

    it('is false (and rate null) when no rate was ever configured', async () => {
      db.exchangeRateLog.findFirst.mockResolvedValueOnce(null)
      const res = await request(app).get('/api/v1/exchange-rate/current').set('Authorization', `Bearer ${adminToken()}`)
      expect(res.body.data).toMatchObject({ rate: null, isPlaceholder: false })
    })
  })

  // ── Migración add_usd_base_to_renewal_projection_overrides ─────────────────
  // Última línea de defensa del histórico: si alguien la regenera con un
  // UPDATE/DELETE/DROP o toca otra tabla, falla antes de llegar a una base real.

  describe('migration add_usd_base_to_renewal_projection_overrides', () => {
    const migrationsDir = path.resolve(__dirname, '../../../../prisma/migrations')
    const dir = fs.readdirSync(migrationsDir).find((name) => name.endsWith('_add_usd_base_to_renewal_projection_overrides'))
    const sql = dir ? fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8') : ''
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')

    it('exists', () => {
      expect(dir).toBeDefined()
    })

    it('is purely additive: only nullable ADD COLUMN on the overrides table', () => {
      expect(statements).not.toMatch(/^\s*(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/im)
      expect(statements).not.toMatch(/DROP COLUMN|ALTER COLUMN|RENAME|NOT NULL|DEFAULT/i)
      const alteredTables = [...statements.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1])
      expect(new Set(alteredTables)).toEqual(new Set(['asset_renewal_projection_overrides']))
      const added = [...statements.matchAll(/ADD COLUMN\s+"([^"]+)"/g)].map((m) => m[1]).sort()
      expect(added).toEqual([
        'growthPercentUsdOverride',
        'legacyConvertedAt',
        'legacyConvertedBy',
        'legacyConvertedRate',
        'netOverrideUsd',
        'otherOverrideUsd',
        'vatOverrideUsd',
      ])
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
