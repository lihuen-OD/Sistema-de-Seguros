import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    asset: {
      findMany:         jest.fn(),
      count:            jest.fn(),
      findUnique:       jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create:           jest.fn(),
      update:           jest.fn(),
      delete:           jest.fn(),
    },
    company: { findMany: jest.fn() },
    costCenter: { findMany: jest.fn() },
    assetAllocation: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    assetValueHistory: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      update:    jest.fn(),
    },
    assetAttachment: {
      findMany:  jest.fn(),
      findFirst: jest.fn(),
      create:    jest.fn(),
      delete:    jest.fn(),
    },
    assetStatusHistory: {
      findMany: jest.fn(),
      create:   jest.fn(),
    },
    producerTask: { updateMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw:    jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary:     jest.fn(),
  deleteFromCloudinary:   jest.fn(),
}))

import { prisma } from '../../../config/database'
import { deleteFromCloudinary } from '../../../config/cloudinary'
const db = prisma as any

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  // hardDelete() usa la forma en array ($transaction([...])) — alcanza con
  // resolver cada operación en paralelo, igual que hace Prisma de verdad
  // (mismo criterio que policies.test.ts).
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[]),
  )
})

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

const fakeCompany = {
  id: COMPANY_ID,
  name: 'Empresa Test',
  cuit: '30-71234567-8',
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

    it('a USER without the assets module gets 403', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))
      db.asset.findMany.mockResolvedValue([])
      db.asset.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })

    it('a USER with the assets module can list assets', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['assets'] }))
      db.asset.findMany.mockResolvedValue([])
      db.asset.count.mockResolvedValue(0)

      const res = await request(app)
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${userToken()}`)

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
      db.company.findMany.mockResolvedValue([fakeCompany])
      db.costCenter.findMany.mockResolvedValue([fakeCostCenter])
      db.$queryRaw.mockResolvedValue([{ nextval: 1n }])
      // create uses a callback-based $transaction(async (tx) => { tx.asset.create, tx.assetAllocation.createMany, tx.assetStatusHistory.create })
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: {
            create: jest.fn().mockResolvedValue(fakeAsset),
          },
          assetAllocation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          assetStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        }),
      )
      db.asset.findUniqueOrThrow.mockResolvedValue(fakeAsset)

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validAssetBody)

      expect(res.status).toBe(201)
      expect(res.body.data.name).toBe('Toyota Hilux')
    })

    it('passes fireExtinguisherAuditable/insuranceAuditable through to asset.create, defaulting to false when omitted', async () => {
      db.company.findMany.mockResolvedValue([fakeCompany])
      db.costCenter.findMany.mockResolvedValue([fakeCostCenter])
      db.$queryRaw.mockResolvedValue([{ nextval: 1n }])
      const createMock = jest.fn().mockResolvedValue(fakeAsset)
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: { create: createMock },
          assetAllocation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          assetStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        }),
      )
      db.asset.findUniqueOrThrow.mockResolvedValue(fakeAsset)

      await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ ...validAssetBody, fireExtinguisherAuditable: true, insuranceAuditable: true })

      expect(createMock.mock.calls[0][0].data.fireExtinguisherAuditable).toBe(true)
      expect(createMock.mock.calls[0][0].data.insuranceAuditable).toBe(true)

      createMock.mockClear()
      await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send(validAssetBody)

      expect(createMock.mock.calls[0][0].data.fireExtinguisherAuditable).toBe(false)
      expect(createMock.mock.calls[0][0].data.insuranceAuditable).toBe(false)
    })

    it('returns 201 when CONTADOR creates an asset', async () => {
      db.company.findMany.mockResolvedValue([fakeCompany])
      db.costCenter.findMany.mockResolvedValue([fakeCostCenter])
      db.$queryRaw.mockResolvedValue([{ nextval: 1n }])
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: {
            create: jest.fn().mockResolvedValue(fakeAsset),
          },
          assetAllocation: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
          assetStatusHistory: { create: jest.fn().mockResolvedValue({}) },
        }),
      )
      db.asset.findUniqueOrThrow.mockResolvedValue(fakeAsset)
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['assets'] }))

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${userToken()}`)
        .send(validAssetBody)

      expect(res.status).toBe(201)
    })

    it('returns 403 when a USER without the assets module tries to create asset', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post('/api/v1/assets')
        .set('Authorization', `Bearer ${userToken()}`)
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
      db.company.findMany.mockResolvedValue([fakeCompany])
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
    // update() ahora corre todo en una única transacción interactiva
    // ($transaction(async (tx) => {...})) — se mockea pasándole un tx de
    // prueba con los mismos jest.fn() que se quieran inspeccionar.
    function mockUpdateTransaction(tx: Record<string, unknown> = {}) {
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: { update: jest.fn().mockResolvedValue({ id: ASSET_ID }) },
          assetStatusHistory: { create: jest.fn().mockResolvedValue({}) },
          assetValueHistory: {
            findFirst: jest.fn().mockResolvedValue(null),
            // findMany resuelve "¿esta fecha es la más reciente del historial?"
            // (syncAssetCurrentValueIfLatest) — vacío por default = nunca lo es,
            // así los tests que no la mockean explícitamente no tocan asset.update.
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
          },
          ...tx,
        }),
      )
    }

    it('returns 200 when ADMIN updates asset fields', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      mockUpdateTransaction()

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

    it('returns 403 when a USER without the assets module tries to update', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)
        .send({ name: 'Updated' })

      expect(res.status).toBe(403)
    })

    it('does not touch value history when neither currentValue nor patrimonialValueNew are in the payload', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      const findFirst = jest.fn()
      mockUpdateTransaction({ assetValueHistory: { findFirst, create: jest.fn(), update: jest.fn() } })

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ name: 'Toyota Hilux Pro' })

      expect(res.status).toBe(200)
      expect(findFirst).not.toHaveBeenCalled()
    })

    it('creates a new value-history entry when currentValue is saved on a valuation date with no existing entry, and syncs it as the asset current value since it is the latest', async () => {
      const valuationDate = new Date('2026-07-29T00:00:00.000Z')
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, purchaseDate: new Date('2026-01-01T00:00:00.000Z') })
      const findFirst = jest.fn().mockResolvedValue(null)
      const historyCreate = jest.fn().mockResolvedValue({ id: 'vh-new-1', date: valuationDate })
      const findMany = jest.fn().mockResolvedValue([{ id: 'vh-new-1', date: valuationDate }])
      const assetUpdate = jest.fn().mockResolvedValue({ id: ASSET_ID })
      mockUpdateTransaction({
        asset: { update: assetUpdate },
        assetValueHistory: { findFirst, findMany, create: historyCreate, update: jest.fn() },
      })

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ currentValue: 45000, currency: 'USD', exchangeRate: 1500, purchaseDate: '2026-07-29' })

      expect(res.status).toBe(200)
      expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ assetId: ASSET_ID, type: 'real' }),
      }))
      expect(historyCreate).toHaveBeenCalledTimes(1)
      const data = historyCreate.mock.calls[0][0].data
      expect(data.value).toBe(45000)
      expect(data.valueUsd).toBe(45000)
      expect(data.valueArs).toBe(67500000)
      expect(data.type).toBe('real')

      // Es la entrada más reciente del historial → se refleja como valor actual del activo.
      expect(assetUpdate).toHaveBeenCalledWith({
        where: { id: ASSET_ID },
        data: { currentValue: 45000, currentValueArs: 67500000, currentValueUsd: 45000 },
      })
    })

    it('updates the existing value-history entry instead of creating a new one when the valuation date is unchanged', async () => {
      const sameDate = new Date('2026-07-29T00:00:00.000Z')
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, purchaseDate: sameDate })
      const findFirst = jest.fn().mockResolvedValue({ id: 'vh-existing-1' })
      const historyUpdate = jest.fn().mockResolvedValue({ id: 'vh-existing-1', date: sameDate })
      const historyCreate = jest.fn()
      const findMany = jest.fn().mockResolvedValue([{ id: 'vh-existing-1', date: sameDate }])
      mockUpdateTransaction({ assetValueHistory: { findFirst, findMany, create: historyCreate, update: historyUpdate } })

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ currentValue: 46000, currency: 'USD', exchangeRate: 1500, purchaseDate: '2026-07-29' })

      expect(res.status).toBe(200)
      expect(historyCreate).not.toHaveBeenCalled()
      expect(historyUpdate).toHaveBeenCalledWith({
        where: { id: 'vh-existing-1' },
        data: expect.objectContaining({ value: 46000, valueUsd: 46000, valueArs: 69000000 }),
      })
    })

    it('does not overwrite the asset current value when the saved valuation date is not the most recent in the history', async () => {
      const oldDate = new Date('2026-01-15T00:00:00.000Z')
      const newerDate = new Date('2026-07-20T00:00:00.000Z')
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, purchaseDate: oldDate })
      const findFirst = jest.fn().mockResolvedValue(null)
      const historyCreate = jest.fn().mockResolvedValue({ id: 'vh-old-1', date: oldDate })
      // Ya existe una entrada más nueva (cargada desde el "+" de Valuaciones) — no debe pisarse.
      const findMany = jest.fn().mockResolvedValue([{ id: 'vh-newer-1', date: newerDate }])
      const assetUpdate = jest.fn().mockResolvedValue({ id: ASSET_ID })
      mockUpdateTransaction({
        asset: { update: assetUpdate },
        assetValueHistory: { findFirst, findMany, create: historyCreate, update: jest.fn() },
      })

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ currentValue: 40000, currency: 'USD', exchangeRate: 1500, purchaseDate: '2026-01-15' })

      expect(res.status).toBe(200)
      expect(historyCreate).toHaveBeenCalledTimes(1)
      // El historial sí registra la carga (fecha vieja) y el update general de
      // campos sí corre, pero ninguno de los dos toca currentValue/currentValueArs/Usd —
      // esos solo se pisan cuando la fecha guardada es la más reciente.
      for (const call of assetUpdate.mock.calls) {
        expect(call[0].data).not.toHaveProperty('currentValue')
        expect(call[0].data).not.toHaveProperty('currentValueArs')
        expect(call[0].data).not.toHaveProperty('currentValueUsd')
      }
    })

    it('syncs the patrimonialValueNew entry independently under type "nuevo"', async () => {
      const valuationDate = new Date('2026-07-29T00:00:00.000Z')
      db.asset.findUnique.mockResolvedValue({ ...fakeAsset, purchaseDate: valuationDate })
      const findFirst = jest.fn().mockResolvedValue(null)
      const historyCreate = jest.fn().mockResolvedValue({ id: 'vh-new-2', date: valuationDate })
      const findMany = jest.fn().mockResolvedValue([{ id: 'vh-new-2', date: valuationDate }])
      mockUpdateTransaction({ assetValueHistory: { findFirst, findMany, create: historyCreate, update: jest.fn() } })

      const res = await request(app)
        .put(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ patrimonialValueNew: 52000, currency: 'USD', exchangeRate: 1500, purchaseDate: '2026-07-29' })

      expect(res.status).toBe(200)
      expect(historyCreate).toHaveBeenCalledTimes(1)
      const data = historyCreate.mock.calls[0][0].data
      expect(data.type).toBe('nuevo')
      expect(data.value).toBe(52000)
    })
  })

  // ── DELETE /api/v1/assets/:id ───────────────────────────────────────────────

  describe('DELETE /api/v1/assets/:id', () => {
    it('permanently deletes the asset and cleans up its Cloudinary attachments (own + cascaded from insurance audits)', async () => {
      db.asset.findUnique.mockResolvedValue({
        id: ASSET_ID,
        attachments: [{ cloudinaryPublicId: 'asset-file-1' }],
        insuranceAudits: [{ attachments: [{ cloudinaryPublicId: 'audit-file-1' }, { cloudinaryPublicId: null }] }],
      })
      db.asset.delete.mockResolvedValue({ id: ASSET_ID })
      ;(deleteFromCloudinary as jest.Mock).mockResolvedValue(undefined)

      const res = await request(app)
        .delete(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(deleteFromCloudinary).toHaveBeenCalledWith('asset-file-1')
      expect(deleteFromCloudinary).toHaveBeenCalledWith('audit-file-1')
      expect(deleteFromCloudinary).toHaveBeenCalledTimes(2)
      expect(db.asset.delete).toHaveBeenCalledWith({ where: { id: ASSET_ID } })
    })

    it('works when the asset has no attachments at all', async () => {
      db.asset.findUnique.mockResolvedValue({ id: ASSET_ID, attachments: [], insuranceAudits: [] })
      db.asset.delete.mockResolvedValue({ id: ASSET_ID })

      const res = await request(app)
        .delete(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(deleteFromCloudinary).not.toHaveBeenCalled()
      expect(db.asset.delete).toHaveBeenCalledWith({ where: { id: ASSET_ID } })
    })

    it('returns 403 when a USER without the assets module tries to delete', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .delete(`/api/v1/assets/${ASSET_ID}`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 when asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .delete(`/api/v1/assets/${OTHER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
      expect(db.asset.delete).not.toHaveBeenCalled()
    })
  })

  // ── POST /api/v1/assets/:id/de-baja ───────────────────────────────────────────

  describe('POST /api/v1/assets/:id/de-baja', () => {
    it('returns 200 when ADMIN gives the asset de baja', async () => {
      // softDelete() no consulta findUnique — llama directo a
      // $transaction([asset.update(...), assetStatusHistory.create(...)]).
      db.asset.update.mockResolvedValue({ ...fakeAsset, isActive: false })
      db.assetStatusHistory.create.mockResolvedValue({})
      db.$transaction.mockImplementation((arr: unknown[]) => Promise.all(arr))

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/de-baja`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(db.asset.update.mock.calls[0][0].data.isActive).toBe(false)
    })

    it('returns 403 when a USER without the assets module tries to give it de baja', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/de-baja`)
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
    })

    it('returns 404 when asset does not exist', async () => {
      // softDelete() detecta "no existe" vía el P2025 que Prisma tira en
      // update() sobre un id inexistente, capturado por handleUpdateNotFound.
      db.asset.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '5.22.0',
        }),
      )
      db.$transaction.mockImplementation((arr: unknown[]) => Promise.all(arr))

      const res = await request(app)
        .post(`/api/v1/assets/${OTHER_ID}/de-baja`)
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
      db.asset.findUnique.mockResolvedValueOnce(fakeAsset) // assertAssetExists
      db.company.findMany.mockResolvedValue([fakeCompany])
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

  // ── POST /api/v1/assets/:id/value-history ───────────────────────────────────

  describe('POST /api/v1/assets/:id/value-history', () => {
    // addValueHistory ahora corre en $transaction (mismo criterio de upsert-por-
    // fecha y sync del valor actual del activo que update()) — se mockea con el
    // mismo patrón que mockUpdateTransaction.
    function mockValueHistoryTransaction(tx: Record<string, unknown> = {}) {
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          asset: { update: jest.fn().mockResolvedValue({ id: ASSET_ID }) },
          assetValueHistory: {
            findFirst: jest.fn().mockResolvedValue(null),
            findMany: jest.fn().mockResolvedValue([]),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
          },
          ...tx,
        }),
      )
    }

    it('closes valueArs/valueUsd from value + exchangeRate (value is always USD)', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset) // currency lookup
      const historyCreate = jest.fn().mockResolvedValue({ id: 'vh-1', date: new Date('2026-07-14T00:00:00.000Z') })
      mockValueHistoryTransaction({ assetValueHistory: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: historyCreate, update: jest.fn() } })

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 1000, exchangeRate: 1200, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(201)
      const createCall = historyCreate.mock.calls[0][0]
      expect(createCall.data.value).toBe(1000)
      expect(createCall.data.valueUsd).toBe(1000)
      expect(createCall.data.valueArs).toBe(1200000)
      // exchangeRate es solo para calcular — nunca se persiste como columna propia.
      expect(createCall.data.exchangeRate).toBeUndefined()
    })

    it('closes valueArs/valueUsd correctly when the entry is loaded in ARS instead of USD', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      const historyCreate = jest.fn().mockResolvedValue({ id: 'vh-ars-1', date: new Date('2026-07-14T00:00:00.000Z') })
      mockValueHistoryTransaction({ assetValueHistory: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: historyCreate, update: jest.fn() } })

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 120000, currency: 'ARS', exchangeRate: 1200, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(201)
      const createCall = historyCreate.mock.calls[0][0]
      // El valor cargado (120000) queda tal cual en la moneda elegida (ARS) —
      // nunca se lo trata como si ya fuera USD.
      expect(createCall.data.value).toBe(120000)
      expect(createCall.data.valueArs).toBe(120000)
      expect(createCall.data.valueUsd).toBe(100)
    })

    it('updates the existing entry in place instead of duplicating it when an entry already exists for that date', async () => {
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      const findFirst = jest.fn().mockResolvedValue({ id: 'vh-existing-9' })
      const historyCreate = jest.fn()
      const historyUpdate = jest.fn().mockResolvedValue({ id: 'vh-existing-9', date: new Date('2026-07-14T00:00:00.000Z') })
      mockValueHistoryTransaction({ assetValueHistory: { findFirst, findMany: jest.fn().mockResolvedValue([]), create: historyCreate, update: historyUpdate } })

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 1000, exchangeRate: 1200, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(201)
      expect(historyCreate).not.toHaveBeenCalled()
      expect(historyUpdate).toHaveBeenCalledWith({
        where: { id: 'vh-existing-9' },
        data: expect.objectContaining({ value: 1000, valueUsd: 1000, valueArs: 1200000 }),
      })
    })

    it('syncs the asset current value when the added entry is the most recent for that type', async () => {
      const date = new Date('2026-07-14T00:00:00.000Z')
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      const historyCreate = jest.fn().mockResolvedValue({ id: 'vh-1', date })
      const assetUpdate = jest.fn().mockResolvedValue({ id: ASSET_ID })
      mockValueHistoryTransaction({
        asset: { update: assetUpdate },
        assetValueHistory: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([{ id: 'vh-1', date }]),
          create: historyCreate,
          update: jest.fn(),
        },
      })

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 1000, exchangeRate: 1200, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(201)
      expect(assetUpdate).toHaveBeenCalledWith({
        where: { id: ASSET_ID },
        data: { currentValue: 1000, currentValueArs: 1200000, currentValueUsd: 1000 },
      })
    })

    it('does not touch the asset current value when a newer entry already exists for that type', async () => {
      const date = new Date('2026-01-01T00:00:00.000Z')
      const newerDate = new Date('2026-07-14T00:00:00.000Z')
      db.asset.findUnique.mockResolvedValue(fakeAsset)
      const assetUpdate = jest.fn()
      mockValueHistoryTransaction({
        asset: { update: assetUpdate },
        assetValueHistory: {
          findFirst: jest.fn().mockResolvedValue(null),
          findMany: jest.fn().mockResolvedValue([{ id: 'vh-newer', date: newerDate }]),
          create: jest.fn().mockResolvedValue({ id: 'vh-1', date }),
          update: jest.fn(),
        },
      })

      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 800, exchangeRate: 1200, date: '2026-01-01', type: 'real' })

      expect(res.status).toBe(201)
      expect(assetUpdate).not.toHaveBeenCalled()
    })

    it('rejects a new value-history entry without exchangeRate', async () => {
      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 1000, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(422)
      expect(db.assetValueHistory.create).not.toHaveBeenCalled()
    })

    it('rejects a negative or zero exchangeRate', async () => {
      const res = await request(app)
        .post(`/api/v1/assets/${ASSET_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 1000, exchangeRate: 0, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(422)
      expect(db.assetValueHistory.create).not.toHaveBeenCalled()
    })

    it('returns 404 when the asset does not exist', async () => {
      db.asset.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .post(`/api/v1/assets/${OTHER_ID}/value-history`)
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ value: 1000, exchangeRate: 1200, date: '2026-07-14', type: 'real' })

      expect(res.status).toBe(404)
    })
  })
})
