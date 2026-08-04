import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'
import { classifyLevel } from '../fire-extinguisher-audit-dashboard.constants'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    fireExtinguisher: {
      findMany: jest.fn(),
    },
    fireExtinguisherAudit: {
      findMany: jest.fn(),
    },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const PERIOD = '2026-07'
const FAR_FUTURE = new Date('2030-01-01T00:00:00.000Z') // vigente
const PAST = new Date('2020-01-01T00:00:00.000Z') // vencido

function fe(overrides: Record<string, unknown>) {
  return {
    id: 'fe-default',
    code: 'fe-default',
    cylinderNumber: null,
    location: null,
    establishment: 'LA SUCHO',
    locationType: 'Engorde',
    expirationDate: FAR_FUTURE,
    manufacturingYear: 2024,
    hydraulicTestExpirationDate: null,
    ...overrides,
  }
}

function auditRow(overrides: Record<string, unknown>) {
  return {
    fireExtinguisherId: 'fe-default',
    auditDate: new Date('2026-07-15T00:00:00.000Z'),
    cleanliness: 'IMPECABLE',
    chargeFillStatus: 'CARGADO',
    beaconPlateCondition: 'SANA',
    sealStatus: 'TIENE',
    ringStatus: 'TIENE',
    hoseNozzleCondition: 'SANA',
    ...overrides,
  }
}

function findControlPoint(sector: any, key: string) {
  return sector.controlPoints.find((c: any) => c.key === key)
}

describe('GET /api/v1/fire-extinguisher-audits/audit-dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.fireExtinguisher.findMany.mockResolvedValue([])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])
  })

  it('averages each control point across audited extinguishers in a sector', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', expirationDate: FAR_FUTURE }), // vigente
      fe({ id: 'fe-2', expirationDate: PAST }), // vencido
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({
        fireExtinguisherId: 'fe-1',
        cleanliness: 'IMPECABLE', chargeFillStatus: 'CARGADO', hoseNozzleCondition: 'SANA',
        beaconPlateCondition: 'SANA', sealStatus: 'TIENE', ringStatus: 'TIENE',
      }),
      auditRow({
        fireExtinguisherId: 'fe-2',
        cleanliness: 'LEVE_POLVO', chargeFillStatus: 'SOBRECARGADO', hoseNozzleCondition: 'ROTA_LEVE',
        beaconPlateCondition: 'ROTA_LEVE', sealStatus: 'NO_TIENE', ringStatus: 'TIENE',
      }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const sector = res.body.data.sectors[0]
    expect(sector).toMatchObject({ establishment: 'LA SUCHO', locationType: 'Engorde', total: 2, audited: 2 })
    // (100 + 80) / 2
    expect(findControlPoint(sector, 'cleanliness').level).toBeCloseTo(90, 1)
    // (100 + 30) / 2
    expect(findControlPoint(sector, 'chargeFillStatus').level).toBeCloseTo(65, 1)
    // (100 + 60) / 2
    expect(findControlPoint(sector, 'hoseNozzleCondition').level).toBeCloseTo(80, 1)
    // (100 + 40) / 2 — beacon colapsa ROTA_LEVE a 40
    expect(findControlPoint(sector, 'beaconPlateCondition').level).toBeCloseTo(70, 1)
    // (100 + 0) / 2
    expect(findControlPoint(sector, 'sealStatus').level).toBeCloseTo(50, 1)
    // (100 + 100) / 2
    expect(findControlPoint(sector, 'ringStatus').level).toBeCloseTo(100, 1)
    // vigente=100, vencido=0 → (100 + 0) / 2
    expect(findControlPoint(sector, 'expiration').level).toBeCloseTo(50, 1)
  })

  it('collapses beaconPlateCondition ROTA_LEVE/ROTA_REQUIERE_CAMBIO into the same score (40), unlike hoseNozzleCondition which keeps them distinct (0)', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1' }),
      fe({ id: 'fe-2' }),
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', beaconPlateCondition: 'ROTA_LEVE', hoseNozzleCondition: 'ROTA_LEVE' }),
      auditRow({ fireExtinguisherId: 'fe-2', beaconPlateCondition: 'ROTA_REQUIERE_CAMBIO', hoseNozzleCondition: 'ROTA_REQUIERE_CAMBIO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const sector = res.body.data.sectors[0]
    // Ambas dan 40 (colapsado) → promedio 40, no una mezcla de valores distintos.
    expect(findControlPoint(sector, 'beaconPlateCondition').level).toBeCloseTo(40, 1)
    // Manguera SÍ distingue: ROTA_LEVE=60, ROTA_REQUIERE_CAMBIO=0 → promedio 30.
    expect(findControlPoint(sector, 'hoseNozzleCondition').level).toBeCloseTo(30, 1)
  })

  it('excludes a control point from the sector average when no extinguisher has data for it (never dragged to 0)', async () => {
    // Ningún matafuego de este sector fue auditado este período — solo
    // Vencimiento tiene dato (se calcula siempre desde el maestro).
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1', expirationDate: FAR_FUTURE })])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const sector = res.body.data.sectors[0]
    expect(sector.audited).toBe(0)
    expect(findControlPoint(sector, 'cleanliness').level).toBeNull()
    expect(findControlPoint(sector, 'expiration').level).toBeCloseTo(100, 1) // vigente
    // El nivel del sector solo promedia Vencimiento (el único con dato) → 100, no se arrastra a 0 por los otros 6.
    expect(sector.level).toBeCloseTo(100, 1)
  })

  it('computes "expiration" from the master record combined status (charge + manufacturing lifespan + hydraulic test), same as the findings report', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1', expirationDate: null, manufacturingYear: null })])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const sector = res.body.data.sectors[0]
    // sin fecha de vencimiento ni año de fabricación → "sin_fecha" → score 30.
    expect(findControlPoint(sector, 'expiration').level).toBeCloseTo(30, 1)
  })

  it('reconciles overallLevel with the plain average of the sector levels across multiple sectors', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', establishment: 'A', locationType: 'Sector 1', expirationDate: FAR_FUTURE }),
      fe({ id: 'fe-2', establishment: 'A', locationType: 'Sector 2', expirationDate: PAST }),
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const { sectors, overallLevel } = res.body.data
    expect(sectors).toHaveLength(2)
    const manualAverage = (sectors[0].level + sectors[1].level) / 2
    expect(overallLevel).toBeCloseTo(manualAverage, 1)
  })

  it('filters by establishment, returning only its sectors and omitting the establishments list', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1', establishment: 'LA SUCHO' })])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD, establishment: 'LA SUCHO' })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(db.fireExtinguisher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ establishment: 'LA SUCHO' }) }),
    )
    expect(res.body.data.establishment).toBe('LA SUCHO')
    expect(res.body.data.establishments).toBeNull()
  })

  it('returns the full establishments list when no establishment filter is applied', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', establishment: 'LA SUCHO' }),
      fe({ id: 'fe-2', establishment: 'OTRO CAMPO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.body.data.establishment).toBeNull()
    expect(res.body.data.establishments).toEqual(['LA SUCHO', 'OTRO CAMPO'])
  })

  it('excludes an extinguisher linked to a vehicle/machinery asset from the report entirely', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', establishment: 'LA SUCHO' }),
      fe({ id: 'fe-2', establishment: 'MAQUINARIA/VEHICULOS', assetId: 'a1', asset: { assetType: 'Tractor' } }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.totalRegistered).toBe(1)
    expect(res.body.data.establishments).toEqual(['LA SUCHO'])
  })

  it('keeps only the most recent non-rejected audit per extinguisher', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1' })])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', auditDate: new Date('2026-07-20T00:00:00.000Z'), cleanliness: 'MUY_SUCIO' }),
      auditRow({ fireExtinguisherId: 'fe-1', auditDate: new Date('2026-07-05T00:00:00.000Z'), cleanliness: 'IMPECABLE' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(db.fireExtinguisherAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { auditDate: 'desc' } }),
    )
    const sector = res.body.data.sectors[0]
    // El mock ya llega ordenado desc — el primero (más reciente) es MUY_SUCIO (score 10).
    expect(findControlPoint(sector, 'cleanliness').level).toBeCloseTo(10, 1)
  })

  it('lists expired extinguishers by cylinder number, regardless of whether they were audited this period', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', cylinderNumber: 'CIL-001', location: 'Depósito norte', expirationDate: FAR_FUTURE }), // vigente
      fe({ id: 'fe-2', cylinderNumber: 'CIL-002', location: null, expirationDate: PAST }), // vencido, sin auditoría este período
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const sector = res.body.data.sectors[0]
    expect(sector.expiredExtinguishers).toEqual([{ cylinderNumber: 'CIL-002', location: null }])
  })

  it('falls back to the code when the extinguisher has no cylinder number on file', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', code: 'MAT-005', cylinderNumber: null, location: null, expirationDate: PAST }),
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const sector = res.body.data.sectors[0]
    expect(sector.expiredExtinguishers).toEqual([{ cylinderNumber: 'MAT-005', location: null }])
  })

  it('lists extinguishers that need cleaning by cylinder number, only when audited this period with a non-IMPECABLE result', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', cylinderNumber: 'CIL-010', location: 'Cocina' }),
      fe({ id: 'fe-2', cylinderNumber: 'CIL-011', location: 'Taller' }),
      fe({ id: 'fe-3', cylinderNumber: 'CIL-012', location: 'Oficina' }), // sin auditoría este período
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', cleanliness: 'IMPECABLE' }),
      auditRow({ fireExtinguisherId: 'fe-2', cleanliness: 'MUY_SUCIO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    const sector = res.body.data.sectors[0]
    expect(sector.needsCleaningExtinguishers).toEqual([{ cylinderNumber: 'CIL-011', location: 'Taller' }])
  })

  it('returns 403 for a USER without the fire_extinguisher_audits module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
  })

  it('returns 200 for a USER with the fire_extinguisher_audits module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['fire_extinguisher_audits'] }))

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/fire-extinguisher-audits/audit-dashboard').query({ period: PERIOD })
    expect(res.status).toBe(401)
  })

  it('rejects a malformed period', async () => {
    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/audit-dashboard')
      .query({ period: 'not-a-period' })
      .set('Authorization', `Bearer ${adminToken()}`)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})

describe('classifyLevel', () => {
  it('respects the 4 scale cutoffs (Crítico < 50, Regular < 75, Bueno < 90, Óptimo >= 90)', () => {
    expect(classifyLevel(null)).toBeNull()
    expect(classifyLevel(0)).toBe('Crítico')
    expect(classifyLevel(49.9)).toBe('Crítico')
    expect(classifyLevel(50)).toBe('Regular')
    expect(classifyLevel(74.9)).toBe('Regular')
    expect(classifyLevel(75)).toBe('Bueno')
    expect(classifyLevel(89.9)).toBe('Bueno')
    expect(classifyLevel(90)).toBe('Óptimo')
    expect(classifyLevel(100)).toBe('Óptimo')
  })
})
