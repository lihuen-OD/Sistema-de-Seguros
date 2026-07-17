import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    fireExtinguisher: {
      count: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    fireExtinguisherAudit: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    catalogItem: {
      findMany: jest.fn(),
    },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const BASE_DATE = new Date('2026-07-07T00:00:00.000Z')

const ESTABLISHMENT_CATALOG = ['LA SUCHO', 'LA HONORIA', 'PLANTA', 'TALLER', 'OFICINA'].map((label) => ({ label }))

describe('GET /api/v1/fire-extinguishers/dashboard/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    // Defaults: parque vacío, sin auditorías — cada test sobreescribe lo que necesita.
    db.fireExtinguisher.count.mockResolvedValue(0)
    db.fireExtinguisher.findMany.mockResolvedValue([])
    db.fireExtinguisher.groupBy.mockResolvedValue([])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])
    db.fireExtinguisherAudit.count.mockResolvedValue(0)
    db.catalogItem.findMany.mockResolvedValue(ESTABLISHMENT_CATALOG)
  })

  it('computes totals, deriving vigente by subtraction', async () => {
    db.fireExtinguisher.count
      .mockResolvedValueOnce(10) // total activo
      .mockResolvedValueOnce(2) // vencido
      .mockResolvedValueOnce(3) // proximo_vencer

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.totals).toEqual({ total: 10, vigente: 5, proximo_vencer: 3, vencido: 2 })
  })

  it('always returns every establishment from the catalog, zero-filled when empty', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      { establishment: 'PLANTA', locationType: 'Edificio', expirationDate: new Date('2020-01-01'), manufacturingYear: 2000 }, // vencido
      { establishment: 'PLANTA', locationType: 'Edificio', expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 }, // vigente
      { establishment: 'TALLER', locationType: 'Maquinaria', expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 }, // vigente
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const byEstablishment = res.body.data.byEstablishment
    expect(byEstablishment.map((b: any) => b.establishment)).toEqual([
      'LA SUCHO', 'LA HONORIA', 'PLANTA', 'TALLER', 'OFICINA',
    ])
    const planta = byEstablishment.find((b: any) => b.establishment === 'PLANTA')
    expect(planta).toMatchObject({ total: 2, vigente: 1, vencido: 1, proximo_vencer: 0 })
    const laSucho = byEstablishment.find((b: any) => b.establishment === 'LA SUCHO')
    expect(laSucho).toMatchObject({ total: 0, vigente: 0, proximo_vencer: 0, vencido: 0 })
    expect(laSucho.byLocationType).toEqual([])
  })

  it('breaks each establishment down by locationType ("asignación física")', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      { establishment: 'LA SUCHO', locationType: 'Maternidad', expirationDate: new Date('2020-01-01'), manufacturingYear: 2000 }, // vencido
      { establishment: 'LA SUCHO', locationType: 'Maternidad', expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 }, // vigente
      { establishment: 'LA SUCHO', locationType: 'Engorde', expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 }, // vigente
      { establishment: 'PLANTA', locationType: 'Vehículo', expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 }, // vigente, único tipo
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const byEstablishment = res.body.data.byEstablishment
    const laSucho = byEstablishment.find((b: any) => b.establishment === 'LA SUCHO')
    expect(laSucho.byLocationType).toEqual([
      { locationType: 'Maternidad', total: 2, vigente: 1, proximo_vencer: 0, vencido: 1 },
      { locationType: 'Engorde', total: 1, vigente: 1, proximo_vencer: 0, vencido: 0 },
    ])
    const planta = byEstablishment.find((b: any) => b.establishment === 'PLANTA')
    expect(planta.byLocationType).toEqual([
      { locationType: 'Vehículo', total: 1, vigente: 1, proximo_vencer: 0, vencido: 0 },
    ])
  })

  it('ignores rows with an unrecognized or null establishment without crashing', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      { establishment: null, expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 },
      { establishment: 'ZONA_INEXISTENTE', expirationDate: new Date('2030-01-01'), manufacturingYear: 2024 },
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const totalAcrossZones = res.body.data.byEstablishment.reduce((sum: number, b: any) => sum + b.total, 0)
    expect(totalAcrossZones).toBe(0)
  })

  it('returns byType ordered as provided by the groupBy query', async () => {
    db.fireExtinguisher.groupBy.mockResolvedValue([
      { type: 'Polvo seco ABC', _count: { _all: 7 } },
      { type: 'CO2', _count: { _all: 3 } },
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.byType).toEqual([
      { type: 'Polvo seco ABC', count: 7 },
      { type: 'CO2', count: 3 },
    ])
    expect(db.fireExtinguisher.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['type'], orderBy: { _count: { type: 'desc' } } }),
    )
  })

  it('computes audit coverage percent, avoiding division by zero when there are no active units', async () => {
    db.fireExtinguisher.count.mockResolvedValueOnce(0) // total activo = 0

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.audits.totalActive).toBe(0)
    expect(res.body.data.audits.coveragePercent).toBe(0)
  })

  it('computes audit coverage percent from distinct audited units this period', async () => {
    db.fireExtinguisher.count.mockResolvedValueOnce(4) // total activo
    db.fireExtinguisherAudit.findMany.mockImplementation((args: any) =>
      args?.distinct ? Promise.resolve([{ fireExtinguisherId: 'a' }, { fireExtinguisherId: 'b' }]) : Promise.resolve([]),
    )
    db.fireExtinguisherAudit.count.mockResolvedValueOnce(5).mockResolvedValueOnce(1) // pending, needsCorrection

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.audits).toMatchObject({
      totalActive: 4,
      auditedThisPeriod: 2,
      coveragePercent: 50,
      pendingReview: 5,
      needsCorrection: 1,
    })
  })

  it('returns recentAudits with the expected shape', async () => {
    db.fireExtinguisherAudit.findMany.mockImplementation((args: any) =>
      args?.distinct
        ? Promise.resolve([])
        : Promise.resolve([
            {
              id: 'audit-1',
              status: 'SUBMITTED',
              auditPeriod: '2026-07',
              auditedBy: 'auditor@losodwyer.com',
              createdAt: BASE_DATE,
              extinguisher: { code: 'MAT-001-A' },
            },
          ]),
    )

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.recentAudits).toEqual([
      {
        id: 'audit-1',
        extinguisherCode: 'MAT-001-A',
        status: 'SUBMITTED',
        auditPeriod: '2026-07',
        auditedBy: 'auditor@losodwyer.com',
        createdAt: BASE_DATE.toISOString(),
      },
    ])
  })

  it.each([
    ['ADMIN', 'ADMIN'],
    ['a USER with no modules', 'USER'],
  ] as const)('returns 200 for any authenticated role (%s) — no role restriction', async (_label, role) => {
    if (role === 'USER') db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get('/api/v1/fire-extinguishers/dashboard/summary')
      .set('Authorization', `Bearer ${role === 'ADMIN' ? adminToken() : userToken()}`)

    expect(res.status).toBe(200)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/fire-extinguishers/dashboard/summary')
    expect(res.status).toBe(401)
  })
})
