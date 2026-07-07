import request from 'supertest'
import { app } from '../../../app'
import { adminToken, contadorToken, viewerToken } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    fireExtinguisher: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    fireExtinguisherHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ID_1 = '60000000-0000-0000-0000-000000000001'
const ID_2 = '60000000-0000-0000-0000-000000000002'
const ID_3 = '60000000-0000-0000-0000-000000000003'
const MISSING_ID = '60000000-0000-0000-0000-000000000099'

function fakeFireExt(id: string) {
  return { id, expirationDate: new Date('2026-08-01T00:00:00.000Z'), isActive: true }
}

const validBody = {
  ids: [ID_1, ID_2, ID_3],
  chargeDate: '2026-07-07',
  expirationDate: '2027-07-07',
  technician: 'Técnico SRL',
}

describe('POST /api/v1/fire-extinguishers/bulk-recharge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.fireExtinguisherHistory.create.mockResolvedValue({})
    db.fireExtinguisher.update.mockImplementation((args: any) =>
      Promise.resolve({ ...fakeFireExt(args.where.id), ...args.data }),
    )
    // Transacción interactiva: pasa `db` como `tx`, igual que el resto del módulo.
    db.$transaction.mockImplementation(async (arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(db),
    )
  })

  it('recharges all units atomically, writing one history entry per unit', async () => {
    db.fireExtinguisher.findUnique.mockImplementation((args: any) => Promise.resolve(fakeFireExt(args.where.id)))

    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(3)
    expect(db.fireExtinguisher.update).toHaveBeenCalledTimes(3)
    expect(db.fireExtinguisherHistory.create).toHaveBeenCalledTimes(3)
    for (const id of [ID_1, ID_2, ID_3]) {
      expect(db.fireExtinguisher.update).toHaveBeenCalledWith({
        where: { id },
        data: { lastRechargeDate: new Date('2026-07-07T00:00:00.000Z'), expirationDate: new Date('2027-07-07T00:00:00.000Z'), isActive: true },
      })
    }
  })

  it('rolls back entirely (404) when one id in the batch does not exist, without recharging units after it', async () => {
    db.fireExtinguisher.findUnique.mockImplementation((args: any) =>
      Promise.resolve(args.where.id === ID_2 ? null : fakeFireExt(args.where.id)),
    )

    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validBody, ids: [ID_1, ID_2, ID_3] })

    expect(res.status).toBe(404)
    // ID_1 se procesa antes de llegar al ID_2 que falla; ID_3 (después del que falla) nunca se toca.
    expect(db.fireExtinguisher.update).toHaveBeenCalledTimes(1)
    expect(db.fireExtinguisher.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ID_1 } }))
    expect(db.fireExtinguisherHistory.create).toHaveBeenCalledTimes(1)
  })

  it('returns 404 when the missing id is the only one in the batch', async () => {
    db.fireExtinguisher.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validBody, ids: [MISSING_ID] })

    expect(res.status).toBe(404)
    expect(db.fireExtinguisher.update).not.toHaveBeenCalled()
  })

  it('returns 422 when ids is empty', async () => {
    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validBody, ids: [] })

    expect(res.status).toBe(422)
  })

  it('returns 422 when ids contains an invalid uuid', async () => {
    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validBody, ids: ['not-a-uuid'] })

    expect(res.status).toBe(422)
  })

  it('returns 403 for VIEWER', async () => {
    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${viewerToken()}`)
      .send(validBody)

    expect(res.status).toBe(403)
  })

  it('returns 200 for CONTADOR', async () => {
    db.fireExtinguisher.findUnique.mockImplementation((args: any) => Promise.resolve(fakeFireExt(args.where.id)))

    const res = await request(app)
      .post('/api/v1/fire-extinguishers/bulk-recharge')
      .set('Authorization', `Bearer ${contadorToken()}`)
      .send(validBody)

    expect(res.status).toBe(200)
  })
})
