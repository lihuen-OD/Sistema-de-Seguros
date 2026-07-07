import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, contadorToken, viewerToken } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    fireExtinguisher: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    fireExtinguisherHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    asset: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_DATE = new Date('2026-01-01T00:00:00.000Z')
const FE_ID = '60000000-0000-0000-0000-000000000001'
const OTHER_ID = '60000000-0000-0000-0000-000000000099'
const ASSET_ID = '30000000-0000-0000-0000-000000000001'

const fakeFireExt = {
  id: FE_ID,
  code: 'MAT-EDI001-A',
  internalNumber: 'INT-100',
  assetId: null,
  locationType: 'Edificio',
  location: 'Planta baja',
  establishment: 'PLANTA',
  type: 'Polvo seco ABC',
  capacity: '10 kg',
  brand: 'Cesa',
  cylinderNumber: 'CIL-001',
  manufacturingYear: 2020,
  expirationDate: new Date('2027-01-01T00:00:00.000Z'),
  lastRechargeDate: null,
  observations: null,
  isActive: true,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
}

const validCreateBody = {
  type: 'Polvo seco ABC',
  capacity: '10 kg',
  expirationDate: '2027-01-01',
  associatedLocationType: 'Vehículo',
  internalNumber: 'INT-100',
  establishment: 'PLANTA',
  cylinderNumber: 'CIL-001',
  manufacturingYear: 2020,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Fire Extinguishers API', () => {
  beforeEach(() => {
    db.$queryRaw.mockResolvedValue([{ nextval: BigInt(1) }])
    db.fireExtinguisherHistory.create.mockResolvedValue({})
    // Genérico: soporta tanto $transaction(async (tx) => {...}) — usado por create(),
    // pasando `db` como `tx` — como $transaction([...]) — usado por update/softDelete/recharge.
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  // ── GET /api/v1/fire-extinguishers ────────────────────────────────────────

  describe('GET /api/v1/fire-extinguishers', () => {
    it('returns 200 with paginated list', async () => {
      db.fireExtinguisher.findMany.mockResolvedValue([fakeFireExt])
      db.fireExtinguisher.count.mockResolvedValue(1)

      const res = await request(app)
        .get('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(res.body.data[0].internalNumber).toBe('INT-100')
      expect(res.body.data[0].location).toBe('Planta baja')
      expect(res.body.data[0].cylinderNumber).toBe('CIL-001')
    })

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/fire-extinguishers')
      expect(res.status).toBe(401)
    })

    it('VIEWER can list', async () => {
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.fireExtinguisher.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${viewerToken()}`)

      expect(res.status).toBe(200)
    })

    it('filters by unassigned=true', async () => {
      db.fireExtinguisher.findMany.mockResolvedValue([])
      db.fireExtinguisher.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/fire-extinguishers?unassigned=true')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.fireExtinguisher.findMany.mock.calls[0][0].where.assetId).toBeNull()
    })
  })

  // ── GET /api/v1/fire-extinguishers/:id ────────────────────────────────────

  describe('GET /api/v1/fire-extinguishers/:id', () => {
    it('returns status vencido when only manufacturing life is expired', async () => {
      const currentYear = new Date().getUTCFullYear()
      db.fireExtinguisher.findUnique.mockResolvedValue({
        ...fakeFireExt,
        manufacturingYear: currentYear - 21,
        expirationDate: new Date('2099-01-01T00:00:00.000Z'),
        history: [],
        asset: null,
      })

      const res = await request(app)
        .get(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe('vencido')
      expect(res.body.data.chargeStatus).toBe('vigente')
      expect(res.body.data.manufacturingLifeStatus).toBe('vencido')
    })
  })

  // ── POST /api/v1/fire-extinguishers ───────────────────────────────────────

  describe('POST /api/v1/fire-extinguishers', () => {
    it('returns 201 with all new fields round-tripped as ADMIN', async () => {
      db.fireExtinguisher.create.mockResolvedValue(fakeFireExt)

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
      expect(res.body.data.internalNumber).toBe('INT-100')
      expect(res.body.data.location).toBe('Planta baja')
      expect(res.body.data.establishment).toBe('PLANTA')
      expect(res.body.data.cylinderNumber).toBe('CIL-001')
      expect(res.body.data.manufacturingYear).toBe(2020)
      expect(res.body.data.manufacturingExpirationYear).toBe(2040)
    })

    it('returns 201 as CONTADOR', async () => {
      db.fireExtinguisher.create.mockResolvedValue(fakeFireExt)

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${contadorToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
    })

    it('returns 403 as VIEWER', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(403)
    })

    it('writes an "Alta" history entry with the created fields as newData', async () => {
      db.fireExtinguisher.create.mockResolvedValue(fakeFireExt)

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(201)
      expect(db.fireExtinguisherHistory.create).toHaveBeenCalledTimes(1)
      const historyArgs = db.fireExtinguisherHistory.create.mock.calls[0][0]
      expect(historyArgs.data.action).toBe('Alta')
      expect(historyArgs.data.newData.internalNumber).toBe('INT-100')
      expect(historyArgs.data.newData.establishment).toBe('PLANTA')
      expect(historyArgs.data.performedBy).toBe('test@losodwyer.com')
    })

    it('returns 422 when cylinderNumber is missing', async () => {
      const { cylinderNumber, ...body } = validCreateBody
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)

      expect(res.status).toBe(422)
    })

    it('returns 422 when manufacturingYear is missing', async () => {
      const { manufacturingYear, ...body } = validCreateBody
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)

      expect(res.status).toBe(422)
    })

    it('returns 422 when manufacturingYear is in the future', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, manufacturingYear: new Date().getFullYear() + 1 })

      expect(res.status).toBe(422)
    })

    it('returns 422 when manufacturingYear is below the 1950 floor', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, manufacturingYear: 1949 })

      expect(res.status).toBe(422)
    })

    it('accepts manufacturingYear at the 1950 floor', async () => {
      db.fireExtinguisher.create.mockResolvedValue({ ...fakeFireExt, manufacturingYear: 1950 })

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, manufacturingYear: 1950 })

      expect(res.status).toBe(201)
    })

    it('returns 422 when internalNumber is missing', async () => {
      const { internalNumber, ...body } = validCreateBody
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(body)

      expect(res.status).toBe(422)
    })

    it('returns 422 when establishment is not one of the allowed values', async () => {
      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, establishment: 'SEDE INEXISTENTE' })

      expect(res.status).toBe(422)
    })

    it('returns 400 when associatedAssetId does not exist or is inactive', async () => {
      db.asset.findFirst.mockResolvedValue(null)

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, associatedAssetId: ASSET_ID })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('INVALID_REFERENCE')
    })

    it('returns 409 DUPLICATE_INTERNAL_NUMBER on a unique constraint violation', async () => {
      db.fireExtinguisher.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['internalNumber'] },
        }),
      )

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validCreateBody)

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_INTERNAL_NUMBER')
      // No debe exponer detalles crudos de Prisma/SQL al cliente
      expect(JSON.stringify(res.body)).not.toMatch(/PrismaClientKnownRequestError|constraint failed/i)
    })

    it('generates a code with the correct prefix end-to-end for a real catalog location type', async () => {
      db.fireExtinguisher.create.mockImplementation(async ({ data }: any) => ({
        ...fakeFireExt,
        code: data.code,
      }))

      const res = await request(app)
        .post('/api/v1/fire-extinguishers')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validCreateBody, associatedLocationType: 'Vehículo' })

      expect(res.status).toBe(201)
      expect(res.body.data.code).toMatch(/^MAT-VEH/)
    })
  })

  // ── PUT /api/v1/fire-extinguishers/:id ────────────────────────────────────

  describe('PUT /api/v1/fire-extinguishers/:id', () => {
    it('updates only the provided field, leaving the rest untouched', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockResolvedValue({ ...fakeFireExt, location: 'Nueva ubicación' })

      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ location: 'Nueva ubicación' })

      expect(res.status).toBe(200)
      expect(res.body.data.location).toBe('Nueva ubicación')
      const updateArgs = db.fireExtinguisher.update.mock.calls[0][0]
      expect(Object.keys(updateArgs.data)).toEqual(['location'])
    })

    it('writes an "Actualización" history entry containing only the changed field', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockResolvedValue({ ...fakeFireExt, location: 'Nueva ubicación' })

      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ location: 'Nueva ubicación' })

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherHistory.create).toHaveBeenCalledTimes(1)
      const historyArgs = db.fireExtinguisherHistory.create.mock.calls[0][0]
      expect(historyArgs.data.action).toBe('Actualización')
      expect(historyArgs.data.previousData).toEqual({ location: 'Planta baja' })
      expect(historyArgs.data.newData).toEqual({ location: 'Nueva ubicación' })
    })

    it('does NOT write a history entry when only observations changed', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockResolvedValue({ ...fakeFireExt, observations: 'nota nueva' })

      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ observations: 'nota nueva' })

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherHistory.create).not.toHaveBeenCalled()
    })

    it('does NOT write a history entry when the sent value equals the current value', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockResolvedValue(fakeFireExt)

      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ location: fakeFireExt.location })

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherHistory.create).not.toHaveBeenCalled()
    })

    it('returns 404 when the fire extinguisher does not exist', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ location: 'x' })

      expect(res.status).toBe(404)
    })

    it('returns 403 as VIEWER', async () => {
      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${viewerToken()}`)
        .send({ location: 'x' })

      expect(res.status).toBe(403)
    })

    it('returns 409 DUPLICATE_INTERNAL_NUMBER on a unique constraint violation', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '5.22.0',
          meta: { target: ['internalNumber'] },
        }),
      )

      const res = await request(app)
        .put(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ internalNumber: 'INT-999' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('DUPLICATE_INTERNAL_NUMBER')
    })
  })

  // ── DELETE /api/v1/fire-extinguishers/:id ─────────────────────────────────

  describe('DELETE /api/v1/fire-extinguishers/:id', () => {
    it('returns 200 as ADMIN (soft delete) and writes a "Baja" history entry', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockResolvedValue({ ...fakeFireExt, isActive: false })

      const res = await request(app)
        .delete(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherHistory.create).toHaveBeenCalledTimes(1)
      expect(db.fireExtinguisherHistory.create.mock.calls[0][0].data.action).toBe('Baja')
    })

    it('returns 403 as CONTADOR', async () => {
      const res = await request(app)
        .delete(`/api/v1/fire-extinguishers/${FE_ID}`)
        .set('Authorization', `Bearer ${contadorToken()}`)

      expect(res.status).toBe(403)
    })
  })

  // ── POST /api/v1/fire-extinguishers/:id/recharge ──────────────────────────

  describe('POST /api/v1/fire-extinguishers/:id/recharge', () => {
    it('updates the expiration date and writes a "Recarga" history entry (unaffected by the audit changes)', async () => {
      db.fireExtinguisher.findUnique.mockResolvedValue(fakeFireExt)
      db.fireExtinguisher.update.mockResolvedValue({
        ...fakeFireExt,
        lastRechargeDate: new Date('2026-07-01T00:00:00.000Z'),
        expirationDate: new Date('2027-07-01T00:00:00.000Z'),
      })

      const res = await request(app)
        .post(`/api/v1/fire-extinguishers/${FE_ID}/recharge`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ chargeDate: '2026-07-01', expirationDate: '2027-07-01', technician: 'Tecnico SRL' })

      expect(res.status).toBe(200)
      expect(db.fireExtinguisherHistory.create).toHaveBeenCalledTimes(1)
      const historyArgs = db.fireExtinguisherHistory.create.mock.calls[0][0]
      expect(historyArgs.data.action).toBe('Recarga')
      expect(historyArgs.data.performedBy).toBe('Tecnico SRL')
      expect(historyArgs.data.previousExpirationDate).toEqual(fakeFireExt.expirationDate)
    })
  })
})
