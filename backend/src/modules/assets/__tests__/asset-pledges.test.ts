import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn() },
    assetPledge: {
      findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(),
      updateMany: jest.fn(), findUniqueOrThrow: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const ASSET_ID = '10000000-0000-0000-0000-000000000001'
const OTHER_ASSET_ID = '10000000-0000-0000-0000-000000000002'
const PLEDGE_ID = '20000000-0000-0000-0000-000000000001'
const NOW = new Date('2026-09-04T12:00:00.000Z')

const activePledge = {
  id: PLEDGE_ID,
  assetId: ASSET_ID,
  creditorName: 'Banco Test',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: null,
  notes: null,
  cancelledAt: null,
  cancellationReason: null,
  createdBy: 'test@losodwyer.com',
  cancelledBy: null,
  createdAt: NOW,
  updatedAt: NOW,
}

describe('Asset pledges API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.asset.findUnique.mockResolvedValue({ id: ASSET_ID, assetType: 'Vehículo' })
    db.assetPledge.findMany.mockResolvedValue([activePledge])
    db.assetPledge.findFirst.mockResolvedValue(null)
    db.assetPledge.create.mockResolvedValue(activePledge)
    db.assetPledge.updateMany.mockResolvedValue({ count: 1 })
    db.assetPledge.findUniqueOrThrow.mockResolvedValue({
      ...activePledge,
      cancelledAt: NOW,
      cancellationReason: 'Crédito cancelado',
      cancelledBy: 'test@losodwyer.com',
    })
    db.$transaction.mockImplementation((callback: (tx: typeof db) => unknown) => callback(db))
  })

  it('lista el historial del activo en orden descendente', async () => {
    const res = await request(app).get(`/api/v1/assets/${ASSET_ID}/pledges`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).toEqual(expect.objectContaining({ id: PLEDGE_ID, status: 'ACTIVE' }))
    expect(db.assetPledge.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { assetId: ASSET_ID }, orderBy: { createdAt: 'desc' }, select: expect.any(Object),
    }))
  })

  it('crea una prenda en un activo elegible', async () => {
    const res = await request(app).post(`/api/v1/assets/${ASSET_ID}/pledges`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ creditorName: 'Banco Test', startDate: '2026-01-01' })

    expect(res.status).toBe(201)
    expect(res.body.data.status).toBe('ACTIVE')
    expect(db.assetPledge.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      assetId: ASSET_ID, creditorName: 'Banco Test', createdBy: 'test@losodwyer.com',
    }) })
  })

  it('rechaza activos no elegibles', async () => {
    db.asset.findUnique.mockResolvedValue({ id: ASSET_ID, assetType: 'Inmueble' })
    const res = await request(app).post(`/api/v1/assets/${ASSET_ID}/pledges`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ creditorName: 'Banco Test', startDate: '2026-01-01' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe('Este tipo de activo no admite gestión de prendas.')
    expect(db.assetPledge.create).not.toHaveBeenCalled()
  })

  it('rechaza una segunda prenda activa', async () => {
    db.assetPledge.findFirst.mockResolvedValue({ id: PLEDGE_ID })
    const res = await request(app).post(`/api/v1/assets/${ASSET_ID}/pledges`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ creditorName: 'Otro banco', startDate: '2026-01-01' })

    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('El activo ya tiene una prenda activa.')
  })

  it('valida que la fecha de fin no sea anterior al inicio', async () => {
    const res = await request(app).post(`/api/v1/assets/${ASSET_ID}/pledges`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ creditorName: 'Banco Test', startDate: '2026-02-01', endDate: '2026-01-31' })

    expect(res.status).toBe(422)
    expect(db.asset.findUnique).not.toHaveBeenCalled()
  })

  it('da de baja una prenda del activo', async () => {
    db.assetPledge.findFirst.mockResolvedValue(activePledge)
    const res = await request(app).patch(`/api/v1/assets/${ASSET_ID}/pledges/${PLEDGE_ID}/cancel`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ cancellationReason: 'Crédito cancelado' })

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('CANCELLED')
    expect(db.assetPledge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: PLEDGE_ID, assetId: ASSET_ID, cancelledAt: null },
    }))
  })

  it('rechaza una baja duplicada', async () => {
    db.assetPledge.findFirst.mockResolvedValue({ ...activePledge, cancelledAt: NOW })
    const res = await request(app).patch(`/api/v1/assets/${ASSET_ID}/pledges/${PLEDGE_ID}/cancel`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ cancellationReason: 'Duplicada' })

    expect(res.status).toBe(409)
    expect(res.body.error.message).toBe('La prenda ya fue dada de baja.')
  })

  it('no permite operar una prenda de otro activo', async () => {
    db.assetPledge.findFirst.mockResolvedValue(null)
    const res = await request(app).patch(`/api/v1/assets/${OTHER_ASSET_ID}/pledges/${PLEDGE_ID}/cancel`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ cancellationReason: 'No corresponde' })

    expect(res.status).toBe(404)
  })

  it('requiere motivo para dar de baja', async () => {
    const res = await request(app).patch(`/api/v1/assets/${ASSET_ID}/pledges/${PLEDGE_ID}/cancel`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ cancellationReason: ' ' })

    expect(res.status).toBe(422)
  })

  it('rechaza usuarios sin el módulo assets', async () => {
    db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: [] }))
    const res = await request(app).get(`/api/v1/assets/${ASSET_ID}/pledges`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
    expect(db.asset.findUnique).not.toHaveBeenCalled()
  })
})
