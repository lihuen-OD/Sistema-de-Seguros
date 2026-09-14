import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    producer: { findUnique: jest.fn() },
    producerTask: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    policy: { findMany: jest.fn(), findUnique: jest.fn() },
    asset: { findMany: jest.fn(), findUnique: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

beforeEach(() => {
  jest.clearAllMocks()
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.producer.findUnique.mockResolvedValue({ id: PRODUCER_ID })
  db.producerTask.count.mockResolvedValue(0)
  db.policy.findMany.mockResolvedValue([])
  db.asset.findMany.mockResolvedValue([])
})

const PRODUCER_ID = '80000000-0000-0000-0000-000000000001'
const OTHER_PRODUCER_ID = '80000000-0000-0000-0000-000000000002'
const TASK_ID = '81000000-0000-0000-0000-000000000001'
const POLICY_ID = '82000000-0000-0000-0000-000000000001'
const ASSET_ID = '83000000-0000-0000-0000-000000000001'
const BASE_DATE = new Date('2026-01-15T00:00:00.000Z')

function todayUtcMidnight(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function fakeTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
    producerId: PRODUCER_ID,
    producer: { name: 'Juan Pérez' },
    title: 'Renovar póliza',
    description: 'Contactar al cliente',
    dueDate: BASE_DATE,
    status: 'pendiente',
    priority: 'alta',
    assignedTo: 'Responsable de Seguros',
    policyId: null,
    assetId: null,
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    ...overrides,
  }
}

describe('GET /api/v1/tasks', () => {
  it('returns 200 with a lightweight, paginated payload including producerName', async () => {
    db.producerTask.findMany.mockResolvedValue([fakeTaskRow()])
    db.producerTask.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual([{
      id: TASK_ID,
      producerId: PRODUCER_ID,
      producerName: 'Juan Pérez',
      title: 'Renovar póliza',
      description: 'Contactar al cliente',
      dueDate: '2026-01-15',
      status: 'pendiente',
      priority: 'alta',
      assignedTo: 'Responsable de Seguros',
      policyId: null,
      policyNumber: null,
      assetId: null,
      assetName: null,
      createdAt: BASE_DATE.toISOString(),
      updatedAt: BASE_DATE.toISOString(),
    }])
    expect(res.body.pagination).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 })
  })

  it('applies default page=1 and limit=20', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)

    const call = db.producerTask.findMany.mock.calls[0][0]
    expect(call.skip).toBe(0)
    expect(call.take).toBe(20)
  })

  it('paginates with an explicit page/limit', async () => {
    db.producerTask.findMany.mockResolvedValue([])
    db.producerTask.count.mockResolvedValue(45)

    const res = await request(app)
      .get('/api/v1/tasks?page=2&limit=10')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.producerTask.findMany.mock.calls[0][0].skip).toBe(10)
    expect(db.producerTask.findMany.mock.calls[0][0].take).toBe(10)
    expect(res.body.pagination).toEqual({ total: 45, page: 2, limit: 10, totalPages: 5 })
  })

  it('rejects a limit greater than 500 (same PaginationSchema cap as other list endpoints)', async () => {
    const res = await request(app)
      .get('/api/v1/tasks?limit=501')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(422)
    expect(db.producerTask.findMany).not.toHaveBeenCalled()
  })

  it('searches by title, description, assignedTo or producer name', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/tasks?search=mapfre')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.producerTask.findMany.mock.calls[0][0].where.AND).toContainEqual({
      OR: [
        { title: { contains: 'mapfre', mode: 'insensitive' } },
        { description: { contains: 'mapfre', mode: 'insensitive' } },
        { assignedTo: { contains: 'mapfre', mode: 'insensitive' } },
        { producer: { name: { contains: 'mapfre', mode: 'insensitive' } } },
      ],
    })
  })

  it('filters by a real backend status', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/tasks?status=en_progreso')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.producerTask.findMany.mock.calls[0][0].where.AND).toContainEqual({ status: 'en_progreso' })
  })

  it('rejects "vencida" as a status value — it is a derived frontend state, not a real one', async () => {
    const res = await request(app)
      .get('/api/v1/tasks?status=vencida')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(422)
    expect(db.producerTask.findMany).not.toHaveBeenCalled()
  })

  it('filters by priority', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/tasks?priority=alta')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.producerTask.findMany.mock.calls[0][0].where.AND).toContainEqual({ priority: 'alta' })
  })

  it('rejects an invalid priority', async () => {
    const res = await request(app)
      .get('/api/v1/tasks?priority=urgente')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(422)
    expect(db.producerTask.findMany).not.toHaveBeenCalled()
  })

  it('filters by producerId', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get(`/api/v1/tasks?producerId=${PRODUCER_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.producerTask.findMany.mock.calls[0][0].where.AND).toContainEqual({ producerId: PRODUCER_ID })
  })

  it('rejects a producerId that is not a valid UUID', async () => {
    const res = await request(app)
      .get('/api/v1/tasks?producerId=not-a-uuid')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(422)
    expect(db.producerTask.findMany).not.toHaveBeenCalled()
  })

  it('filters by dueFrom/dueTo', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/tasks?dueFrom=2026-01-01&dueTo=2026-01-31')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.producerTask.findMany.mock.calls[0][0].where.AND).toContainEqual({
      dueDate: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-01-31T00:00:00.000Z'),
      },
    })
  })

  it('applies overdueOnly with the same criterion as /producers/tasks/overdue: status pendiente + dueDate < hoy', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get('/api/v1/tasks?overdueOnly=true')
      .set('Authorization', `Bearer ${adminToken()}`)

    const conditions = db.producerTask.findMany.mock.calls[0][0].where.AND
    expect(conditions).toContainEqual({ status: 'pendiente', dueDate: { lt: todayUtcMidnight() } })
  })

  it('combines multiple filters in the same query', async () => {
    db.producerTask.findMany.mockResolvedValue([])

    await request(app)
      .get(`/api/v1/tasks?status=pendiente&priority=alta&producerId=${PRODUCER_ID}&search=renovar`)
      .set('Authorization', `Bearer ${adminToken()}`)

    const conditions = db.producerTask.findMany.mock.calls[0][0].where.AND
    expect(conditions).toContainEqual({ status: 'pendiente' })
    expect(conditions).toContainEqual({ priority: 'alta' })
    expect(conditions).toContainEqual({ producerId: PRODUCER_ID })
    expect(conditions).toContainEqual({
      OR: [
        { title: { contains: 'renovar', mode: 'insensitive' } },
        { description: { contains: 'renovar', mode: 'insensitive' } },
        { assignedTo: { contains: 'renovar', mode: 'insensitive' } },
        { producer: { name: { contains: 'renovar', mode: 'insensitive' } } },
      ],
    })
  })

  it('resolves policyNumber and assetName in bulk (one findMany each), not per row', async () => {
    db.producerTask.findMany.mockResolvedValue([
      fakeTaskRow({ id: TASK_ID, policyId: POLICY_ID, assetId: ASSET_ID }),
      fakeTaskRow({ id: '81000000-0000-0000-0000-000000000002', policyId: POLICY_ID, assetId: null }),
    ])
    db.policy.findMany.mockResolvedValue([{ id: POLICY_ID, policyNumber: 'POL-0001' }])
    db.asset.findMany.mockResolvedValue([{ id: ASSET_ID, name: 'Toyota Hilux' }])

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data[0].policyNumber).toBe('POL-0001')
    expect(res.body.data[0].assetName).toBe('Toyota Hilux')
    expect(res.body.data[1].policyNumber).toBe('POL-0001')
    expect(res.body.data[1].assetName).toBeNull()
    // Una sola consulta por entidad para toda la página, no una por fila.
    expect(db.policy.findMany).toHaveBeenCalledTimes(1)
    expect(db.asset.findMany).toHaveBeenCalledTimes(1)
    expect(db.policy.findMany).toHaveBeenCalledWith({ where: { id: { in: [POLICY_ID] } }, select: { id: true, policyNumber: true } })
  })

  it('does not query policy/asset when no task in the page references one', async () => {
    db.producerTask.findMany.mockResolvedValue([fakeTaskRow({ policyId: null, assetId: null })])

    await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.policy.findMany).not.toHaveBeenCalled()
    expect(db.asset.findMany).not.toHaveBeenCalled()
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/v1/tasks')
    expect(res.status).toBe(401)
  })

  it('returns 403 for a USER without producers/tasks/dashboard modules', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
    expect(db.producerTask.findMany).not.toHaveBeenCalled()
  })

  it('allows a USER with only the producers module (same OR-of-modules criteria as /producers/:id/tasks)', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['producers'] }))
    db.producerTask.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('allows a USER with only the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['tasks'] }))
    db.producerTask.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('allows a USER with only the dashboard module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['dashboard'] }))
    db.producerTask.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })
})

// ── GET /api/v1/tasks/:id (Fase 2B) ─────────────────────────────────────────
// Reemplaza, en TaskDetailPage, el fan-out de productores + tareas por
// productor + listados completos de pólizas/activos solo para resolver 2
// nombres y encontrar 1 tarea por id en memoria.

describe('GET /api/v1/tasks/:id', () => {
  it('returns 200 with the task detail, including producerName', async () => {
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toEqual({
      id: TASK_ID,
      producerId: PRODUCER_ID,
      producerName: 'Juan Pérez',
      title: 'Renovar póliza',
      description: 'Contactar al cliente',
      dueDate: '2026-01-15',
      status: 'pendiente',
      priority: 'alta',
      assignedTo: 'Responsable de Seguros',
      policyId: null,
      policyNumber: null,
      assetId: null,
      assetName: null,
      createdAt: BASE_DATE.toISOString(),
      updatedAt: BASE_DATE.toISOString(),
    })
  })

  it('returns 404 when the task does not exist', async () => {
    db.producerTask.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(404)
  })

  it('includes policyNumber when the task has a policyId (single findUnique, not a full list)', async () => {
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow({ policyId: POLICY_ID }))
    db.policy.findUnique.mockResolvedValue({ policyNumber: 'POL-0001' })

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.policyNumber).toBe('POL-0001')
    expect(db.policy.findUnique).toHaveBeenCalledWith({ where: { id: POLICY_ID }, select: { policyNumber: true } })
    expect(db.policy.findMany).not.toHaveBeenCalled()
  })

  it('includes assetName when the task has an assetId (single findUnique, not a full list)', async () => {
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow({ assetId: ASSET_ID }))
    db.asset.findUnique.mockResolvedValue({ name: 'Toyota Hilux' })

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.assetName).toBe('Toyota Hilux')
    expect(db.asset.findUnique).toHaveBeenCalledWith({ where: { id: ASSET_ID }, select: { name: true } })
    expect(db.asset.findMany).not.toHaveBeenCalled()
  })

  it('does not query policy/asset when the task has neither', async () => {
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow({ policyId: null, assetId: null }))

    await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.policy.findUnique).not.toHaveBeenCalled()
    expect(db.asset.findUnique).not.toHaveBeenCalled()
  })

  it('does not return heavy relations (allocations/installments/history) — only the flat fields', async () => {
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(Object.keys(res.body.data).sort()).toEqual([
      'assetId', 'assetName', 'assignedTo', 'createdAt', 'description', 'dueDate',
      'id', 'policyId', 'policyNumber', 'priority', 'producerId', 'producerName',
      'status', 'title', 'updatedAt',
    ].sort())
  })

  it('returns 401 without token', async () => {
    const res = await request(app).get(`/api/v1/tasks/${TASK_ID}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a USER without producers/tasks/dashboard modules', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
    expect(db.producerTask.findUnique).not.toHaveBeenCalled()
  })

  it('allows a USER with only the producers module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['producers'] }))
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('allows a USER with only the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['tasks'] }))
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('allows a USER with only the dashboard module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['dashboard'] }))
    db.producerTask.findUnique.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .get(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('does not break GET /tasks (paginated list) — /:id is registered after /', async () => {
    db.producerTask.findMany.mockResolvedValue([fakeTaskRow()])
    db.producerTask.count.mockResolvedValue(1)

    const res = await request(app)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.pagination).toBeDefined()
    expect(db.producerTask.findUnique).not.toHaveBeenCalled()
  })
})

// ── POST /api/v1/tasks (Fase 2C) ────────────────────────────────────────────

describe('POST /api/v1/tasks', () => {
  const validBody = {
    producerId: PRODUCER_ID,
    title: 'Renovar póliza',
    priority: 'alta',
  }

  it('creates a task with the given producerId and returns 201 with the mapTaskRow shape', async () => {
    db.producerTask.create.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validBody)

    expect(res.status).toBe(201)
    expect(res.body.data).toEqual({
      id: TASK_ID,
      producerId: PRODUCER_ID,
      producerName: 'Juan Pérez',
      title: 'Renovar póliza',
      description: 'Contactar al cliente',
      dueDate: '2026-01-15',
      status: 'pendiente',
      priority: 'alta',
      assignedTo: 'Responsable de Seguros',
      policyId: null,
      policyNumber: null,
      assetId: null,
      assetName: null,
      createdAt: BASE_DATE.toISOString(),
      updatedAt: BASE_DATE.toISOString(),
    })
    expect(db.producer.findUnique).toHaveBeenCalledWith({ where: { id: PRODUCER_ID }, select: { id: true } })
  })

  it('rejects a producerId that does not exist', async () => {
    db.producer.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(validBody)

    expect(res.status).toBe(400)
    expect(db.producerTask.create).not.toHaveBeenCalled()
  })

  it('rejects a producerId that is not a valid UUID', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validBody, producerId: 'not-a-uuid' })

    expect(res.status).toBe(422)
    expect(db.producerTask.create).not.toHaveBeenCalled()
  })

  it('rejects a request without producerId', async () => {
    const { producerId, ...bodyWithoutProducer } = validBody

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send(bodyWithoutProducer)

    expect(res.status).toBe(422)
    expect(db.producerTask.create).not.toHaveBeenCalled()
  })

  it('rejects a request without title', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ producerId: PRODUCER_ID })

    expect(res.status).toBe(422)
    expect(db.producerTask.create).not.toHaveBeenCalled()
  })

  it('rejects an invalid priority — enum cerrado en el endpoint global', async () => {
    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ ...validBody, priority: 'urgente' })

    expect(res.status).toBe(422)
    expect(db.producerTask.create).not.toHaveBeenCalled()
  })

  it('returns 401 without token', async () => {
    const res = await request(app).post('/api/v1/tasks').send(validBody)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a USER without the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(validBody)

    expect(res.status).toBe(403)
    expect(db.producerTask.create).not.toHaveBeenCalled()
  })

  it('returns 201 for a USER with the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['tasks'] }))
    db.producerTask.create.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${userToken()}`)
      .send(validBody)

    expect(res.status).toBe(201)
  })
})

// ── PUT /api/v1/tasks/:id (Fase 2C) ─────────────────────────────────────────

describe('PUT /api/v1/tasks/:id', () => {
  it('updates normal fields (title/status/priority) keeping the same producer', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })
    db.producerTask.update.mockResolvedValue(fakeTaskRow({ title: 'Renovar póliza (actualizado)', status: 'en_progreso' }))

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ title: 'Renovar póliza (actualizado)', status: 'en_progreso' })

    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('Renovar póliza (actualizado)')
    expect(res.body.data.status).toBe('en_progreso')
    // Busca la tarea por id — no por {id, producerId} como el endpoint legacy.
    expect(db.producerTask.findUnique).toHaveBeenCalledWith({ where: { id: TASK_ID }, select: { id: true } })
    expect(db.producer.findUnique).not.toHaveBeenCalled()
  })

  it('allows reassigning producerId to a different, existing producer', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })
    db.producerTask.update.mockResolvedValue(fakeTaskRow({ producerId: OTHER_PRODUCER_ID, producer: { name: 'María López' } }))

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ producerId: OTHER_PRODUCER_ID })

    expect(res.status).toBe(200)
    expect(res.body.data.producerId).toBe(OTHER_PRODUCER_ID)
    expect(res.body.data.producerName).toBe('María López')
    expect(db.producer.findUnique).toHaveBeenCalledWith({ where: { id: OTHER_PRODUCER_ID }, select: { id: true } })
    expect(db.producerTask.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: TASK_ID },
      data: { producerId: OTHER_PRODUCER_ID },
    }))
  })

  it('rejects reassigning to a producerId that does not exist', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })
    db.producer.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ producerId: OTHER_PRODUCER_ID })

    expect(res.status).toBe(400)
    expect(db.producerTask.update).not.toHaveBeenCalled()
  })

  it('rejects an empty-string producerId — no permite "sin productor"', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ producerId: '' })

    expect(res.status).toBe(422)
    expect(db.producerTask.update).not.toHaveBeenCalled()
  })

  it('rejects a null producerId — no permite "sin productor"', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ producerId: null })

    expect(res.status).toBe(422)
    expect(db.producerTask.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the task does not exist', async () => {
    db.producerTask.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ title: 'Nuevo título' })

    expect(res.status).toBe(404)
    expect(db.producerTask.update).not.toHaveBeenCalled()
  })

  it('returns the same mapTaskRow shape as GET /tasks/:id', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })
    db.producerTask.update.mockResolvedValue(fakeTaskRow({ policyId: POLICY_ID }))
    db.policy.findUnique.mockResolvedValue({ policyNumber: 'POL-0001' })

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ title: 'Renovar póliza' })

    expect(res.status).toBe(200)
    expect(res.body.data.policyNumber).toBe('POL-0001')
    expect(Object.keys(res.body.data).sort()).toEqual([
      'assetId', 'assetName', 'assignedTo', 'createdAt', 'description', 'dueDate',
      'id', 'policyId', 'policyNumber', 'priority', 'producerId', 'producerName',
      'status', 'title', 'updatedAt',
    ].sort())
  })

  it('returns 401 without token', async () => {
    const res = await request(app).put(`/api/v1/tasks/${TASK_ID}`).send({ title: 'x' })
    expect(res.status).toBe(401)
  })

  it('returns 403 for a USER without the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ title: 'x' })

    expect(res.status).toBe(403)
    expect(db.producerTask.findUnique).not.toHaveBeenCalled()
  })

  it('returns 200 for a USER with the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['tasks'] }))
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })
    db.producerTask.update.mockResolvedValue(fakeTaskRow())

    const res = await request(app)
      .put(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)
      .send({ title: 'x' })

    expect(res.status).toBe(200)
  })
})

// ── DELETE /api/v1/tasks/:id (Fase 2C) ──────────────────────────────────────

describe('DELETE /api/v1/tasks/:id', () => {
  it('deletes the task (hard delete) and returns 200', async () => {
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })

    const res = await request(app)
      .delete(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(db.producerTask.delete).toHaveBeenCalledWith({ where: { id: TASK_ID } })
  })

  it('returns 404 when the task does not exist', async () => {
    db.producerTask.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .delete(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(404)
    expect(db.producerTask.delete).not.toHaveBeenCalled()
  })

  it('returns 401 without token', async () => {
    const res = await request(app).delete(`/api/v1/tasks/${TASK_ID}`)
    expect(res.status).toBe(401)
  })

  it('returns 403 for a USER without the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .delete(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
    expect(db.producerTask.findUnique).not.toHaveBeenCalled()
  })

  it('returns 200 for a USER with the tasks module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['tasks'] }))
    db.producerTask.findUnique.mockResolvedValue({ id: TASK_ID })

    const res = await request(app)
      .delete(`/api/v1/tasks/${TASK_ID}`)
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })
})
