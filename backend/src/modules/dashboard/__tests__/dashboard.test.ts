import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    asset: { count: jest.fn(), aggregate: jest.fn() },
    policy: { count: jest.fn(), findMany: jest.fn() },
    policyAssetCoverage: { aggregate: jest.fn() },
    accountingDocument: { aggregate: jest.fn() },
    documentInstallment: { aggregate: jest.fn(), findMany: jest.fn() },
    fireExtinguisher: { count: jest.fn() },
    claim: { count: jest.fn() },
    producerTask: { count: jest.fn() },
    company: { count: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

describe('Dashboard API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.asset.count.mockResolvedValue(0)
    db.asset.aggregate.mockResolvedValue({ _sum: { currentValueArs: 0, currentValueUsd: 0 } })
    db.policy.count.mockResolvedValue(0)
    db.policy.findMany.mockResolvedValue([])
    db.policyAssetCoverage.aggregate.mockResolvedValue({ _sum: { insuredAmountArs: 0, insuredAmountUsd: 0 } })
    db.accountingDocument.aggregate.mockResolvedValue({ _sum: { totalAmountArs: 0, totalAmountUsd: 0 }, _count: { id: 0 } })
    db.documentInstallment.aggregate.mockResolvedValue({ _sum: { amountArs: 0, amountUsd: 0 }, _count: { id: 0 } })
    db.documentInstallment.findMany.mockResolvedValue([])
    db.fireExtinguisher.count.mockResolvedValue(0)
    db.claim.count.mockResolvedValue(0)
    db.producerTask.count.mockResolvedValue(0)
    db.company.count.mockResolvedValue(0)
  })

  it('GET /dashboard/kpis returns 200 for ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/kpis')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('assets')
    expect(res.body.data).toHaveProperty('documents')
  })

  it('GET /dashboard/expiring-policies returns 200 for ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/expiring-policies')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  it('GET /dashboard/expiring-installments returns 200 for ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/expiring-installments')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.data)).toBe(true)
  })

  // El "gráfico de evolución de costos" que vivía acá (GET /dashboard/charts)
  // se eliminó: tenía dos cálculos desincronizados entre sí (este endpoint
  // para "sin filtros" vs. un cómputo client-side para "con filtros" en
  // DashboardPage.tsx) y ningún otro consumidor. Ahora todo se calcula una
  // sola vez en el frontend a partir de datos que la página ya trae.
  it('GET /dashboard/charts no longer exists', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/charts')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(404)
  })

  it('returns 403 for a USER without the dashboard module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get('/api/v1/dashboard/kpis')
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/dashboard/kpis')
    expect(res.status).toBe(401)
  })
})
