import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    producer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    producerTask: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policy: { count: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

beforeEach(() => {
  jest.clearAllMocks()
  db.user.findUnique.mockResolvedValue(mockDbUser())
})

const PRODUCER_ID = '80000000-0000-0000-0000-000000000001'
const TASK_ID = '81000000-0000-0000-0000-000000000001'
const POLICY_ID = '82000000-0000-0000-0000-000000000001'

// Mismo cálculo que shared/utils/dates.ts#todayDate() — medianoche UTC de hoy.
function todayUtcMidnight(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function fakeOverdueTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    title: 'Renovar póliza',
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    priority: 'alta',
    status: 'pendiente',
    producerId: PRODUCER_ID,
    policyId: POLICY_ID,
    assetId: null,
    ...overrides,
  }
}

describe('Producers API', () => {
  // ── GET /api/v1/producers/search ─────────────────────────────────────────────

  describe('GET /api/v1/producers/search', () => {
    const searchProducer = {
      id: PRODUCER_ID,
      name: 'Juan Pérez',
      matricula: 'MAT-001',
      email: 'juan@example.com',
      phone: '+54 9 11 1234-5678',
      isActive: true,
    }

    it('returns a lightweight list matching the query', async () => {
      db.producer.findMany.mockResolvedValue([searchProducer])

      const res = await request(app)
        .get('/api/v1/producers/search?q=juan')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toEqual([{
        id: PRODUCER_ID,
        name: 'Juan Pérez',
        registrationNumber: 'MAT-001',
        email: 'juan@example.com',
        phone: '+54 9 11 1234-5678',
        isActive: true,
      }])
      expect(db.producer.findMany).toHaveBeenCalledWith(expect.objectContaining({
        take: 20,
        orderBy: { name: 'asc' },
        where: expect.objectContaining({
          OR: [
            { name: { contains: 'juan', mode: 'insensitive' } },
            { matricula: { contains: 'juan', mode: 'insensitive' } },
            { email: { contains: 'juan', mode: 'insensitive' } },
            { phone: { contains: 'juan', mode: 'insensitive' } },
          ],
        }),
      }))
    })

    it('applies isActive:true only when activeOnly=true is requested', async () => {
      db.producer.findMany.mockResolvedValue([])

      await request(app)
        .get('/api/v1/producers/search?activeOnly=true')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(db.producer.findMany.mock.calls[0][0].where).toEqual({ isActive: true })

      await request(app)
        .get('/api/v1/producers/search')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(db.producer.findMany.mock.calls[1][0].where).toEqual({})
    })

    it('rejects limits greater than 50 through query validation', async () => {
      const res = await request(app)
        .get('/api/v1/producers/search?limit=51')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(422)
      expect(db.producer.findMany).not.toHaveBeenCalled()
    })

    it('keeps a selected producer even when it is outside the search results', async () => {
      db.producer.findMany.mockResolvedValue([])
      db.producer.findFirst.mockResolvedValue(searchProducer)

      const res = await request(app)
        .get(`/api/v1/producers/search?q=inexistente&selectedId=${PRODUCER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data[0].id).toBe(PRODUCER_ID)
      expect(db.producer.findFirst).toHaveBeenCalledWith({
        where: { id: PRODUCER_ID },
        select: { id: true, name: true, matricula: true, email: true, phone: true, isActive: true },
      })
    })

    it('does not re-fetch the selected producer when it is already within the results', async () => {
      db.producer.findMany.mockResolvedValue([searchProducer])

      const res = await request(app)
        .get(`/api/v1/producers/search?selectedId=${PRODUCER_ID}`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
      expect(db.producer.findFirst).not.toHaveBeenCalled()
    })

    it('returns 403 for a USER without producers/tasks/dashboard/policies modules', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .get('/api/v1/producers/search')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
      expect(db.producer.findMany).not.toHaveBeenCalled()
    })

    it('allows a USER with only the policies module (same OR-of-modules criteria as the list)', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['policies'] }))
      db.producer.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/producers/search')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
    })
  })

  // ── GET /api/v1/producers/tasks/overdue ──────────────────────────────────────

  describe('GET /api/v1/producers/tasks/overdue', () => {
    it('returns total and items for overdue tasks', async () => {
      db.producerTask.count.mockResolvedValue(3)
      db.producerTask.findMany.mockResolvedValue([fakeOverdueTaskRow()])

      const res = await request(app)
        .get('/api/v1/producers/tasks/overdue')
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(3)
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.items[0]).toMatchObject({
        id: TASK_ID,
        title: 'Renovar póliza',
        dueDate: '2026-01-01',
        priority: 'alta',
        status: 'pendiente',
        producerId: PRODUCER_ID,
        policyId: POLICY_ID,
        assetId: null,
      })
    })

    it('filters by status pendiente and dueDate before today, ordered by dueDate ascending', async () => {
      db.producerTask.count.mockResolvedValue(0)
      db.producerTask.findMany.mockResolvedValue([])

      await request(app)
        .get('/api/v1/producers/tasks/overdue')
        .set('Authorization', `Bearer ${adminToken()}`)

      const expectedWhere = { status: 'pendiente', dueDate: { lt: todayUtcMidnight() } }
      expect(db.producerTask.count).toHaveBeenCalledWith({ where: expectedWhere })
      const findManyCall = db.producerTask.findMany.mock.calls[0][0]
      expect(findManyCall.where).toEqual(expectedWhere)
      expect(findManyCall.orderBy).toEqual({ dueDate: 'asc' })
      // Sin `limit` en la query, no debe mandarse `take` — el Dashboard
      // necesita el set completo para poder aplicar su propio filtro de
      // alcance sin perder precisión.
      expect(findManyCall.take).toBeUndefined()
    })

    it('never returns tasks that are not pendiente or not yet due — same status/date filter proves both, since dueDate < hoy already excludes future tasks and status: pendiente already excludes en_progreso/completada/cancelada', async () => {
      db.producerTask.count.mockResolvedValue(0)
      db.producerTask.findMany.mockResolvedValue([])

      await request(app)
        .get('/api/v1/producers/tasks/overdue')
        .set('Authorization', `Bearer ${adminToken()}`)

      const findManyCall = db.producerTask.findMany.mock.calls[0][0]
      expect(findManyCall.where.status).toBe('pendiente')
      expect(findManyCall.where.dueDate.lt.getTime()).toBe(todayUtcMidnight().getTime())
    })

    it('respects an explicit limit', async () => {
      db.producerTask.count.mockResolvedValue(10)
      db.producerTask.findMany.mockResolvedValue([])

      await request(app)
        .get('/api/v1/producers/tasks/overdue')
        .query({ limit: 5 })
        .set('Authorization', `Bearer ${adminToken()}`)

      const findManyCall = db.producerTask.findMany.mock.calls[0][0]
      expect(findManyCall.take).toBe(5)
    })

    it('returns 403 for a USER without producers/tasks/dashboard modules', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

      const res = await request(app)
        .get('/api/v1/producers/tasks/overdue')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(403)
      expect(db.producerTask.findMany).not.toHaveBeenCalled()
    })

    it('allows a USER with the dashboard module (same OR-of-modules criteria as /:id/tasks)', async () => {
      db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['dashboard'] }))
      db.producerTask.count.mockResolvedValue(0)
      db.producerTask.findMany.mockResolvedValue([])

      const res = await request(app)
        .get('/api/v1/producers/tasks/overdue')
        .set('Authorization', `Bearer ${userToken()}`)

      expect(res.status).toBe(200)
    })
  })

  // ── GET /api/v1/producers/:id/tasks (regresión) ──────────────────────────────

  describe('GET /api/v1/producers/:id/tasks', () => {
    it('still returns the tasks of that producer', async () => {
      db.producer.findUnique.mockResolvedValue({ id: PRODUCER_ID })
      db.producerTask.findMany.mockResolvedValue([fakeOverdueTaskRow()])

      const res = await request(app)
        .get(`/api/v1/producers/${PRODUCER_ID}/tasks`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toHaveLength(1)
    })

    it('validates existence with a light select instead of the full findById include (no more double-fetch of tasks)', async () => {
      db.producer.findUnique.mockResolvedValue({ id: PRODUCER_ID })
      db.producerTask.findMany.mockResolvedValue([])

      await request(app)
        .get(`/api/v1/producers/${PRODUCER_ID}/tasks`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(db.producer.findUnique).toHaveBeenCalledWith({
        where: { id: PRODUCER_ID },
        select: { id: true },
      })
    })

    it('returns 404 when the producer does not exist', async () => {
      db.producer.findUnique.mockResolvedValue(null)

      const res = await request(app)
        .get(`/api/v1/producers/${PRODUCER_ID}/tasks`)
        .set('Authorization', `Bearer ${adminToken()}`)

      expect(res.status).toBe(404)
      expect(db.producerTask.findMany).not.toHaveBeenCalled()
    })
  })
})
