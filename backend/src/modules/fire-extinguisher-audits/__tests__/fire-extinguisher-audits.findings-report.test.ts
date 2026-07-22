import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

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
    code: 'MAT-DEFAULT',
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

describe('GET /api/v1/fire-extinguisher-audits/findings-report', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.fireExtinguisher.findMany.mockResolvedValue([])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([])
  })

  it('groups by establishment and sector, reporting real cleanliness values with affected codes', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', code: 'MAT-001' }),
      fe({ id: 'fe-2', code: 'MAT-002' }),
      fe({ id: 'fe-3', code: 'MAT-003' }),
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', cleanliness: 'IMPECABLE' }),
      auditRow({ fireExtinguisherId: 'fe-2', cleanliness: 'LEVE_POLVO' }),
      auditRow({ fireExtinguisherId: 'fe-3', cleanliness: 'MUY_SUCIO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const [laSucho] = res.body.data.establishments
    expect(laSucho).toMatchObject({ establishment: 'LA SUCHO', total: 3, audited: 3 })
    const [engorde] = laSucho.sectors
    expect(engorde).toMatchObject({ locationType: 'Engorde', total: 3, audited: 3 })
    expect(engorde.fields.cleanliness).toEqual({
      Impecable: { count: 1, items: [{ id: 'fe-1', code: 'MAT-001' }] },
      'Polvo leve': { count: 1, items: [{ id: 'fe-2', code: 'MAT-002' }] },
      'Muy sucio': { count: 1, items: [{ id: 'fe-3', code: 'MAT-003' }] },
    })
  })

  it('collapses beaconPlateCondition ROTA_LEVE and ROTA_REQUIERE_CAMBIO into a single "Rota" tier (secundario)', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', code: 'MAT-001' }),
      fe({ id: 'fe-2', code: 'MAT-002' }),
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', beaconPlateCondition: 'ROTA_LEVE' }),
      auditRow({ fireExtinguisherId: 'fe-2', beaconPlateCondition: 'ROTA_REQUIERE_CAMBIO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const sector = res.body.data.establishments[0].sectors[0]
    expect(sector.fields.beaconPlateCondition.Rota).toEqual({
      count: 2,
      items: [
        { id: 'fe-1', code: 'MAT-001' },
        { id: 'fe-2', code: 'MAT-002' },
      ],
    })
    expect(sector.fields.beaconPlateCondition.Sana).toBeUndefined()
  })

  it('reports hoseNozzleCondition with its real values, WITHOUT collapsing "Rota (leve)" and "Rota (requiere cambio)" (principal)', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', code: 'MAT-001' }),
      fe({ id: 'fe-2', code: 'MAT-002' }),
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', hoseNozzleCondition: 'ROTA_LEVE' }),
      auditRow({ fireExtinguisherId: 'fe-2', hoseNozzleCondition: 'ROTA_REQUIERE_CAMBIO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const sector = res.body.data.establishments[0].sectors[0]
    expect(sector.fields.hoseNozzleCondition).toEqual({
      'Rota (leve)': { count: 1, items: [{ id: 'fe-1', code: 'MAT-001' }] },
      'Rota (requiere cambio)': { count: 1, items: [{ id: 'fe-2', code: 'MAT-002' }] },
    })
  })

  it('supports SOBRECARGADO as a real chargeFillStatus value', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1', code: 'MAT-001' })])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', chargeFillStatus: 'SOBRECARGADO' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const sector = res.body.data.establishments[0].sectors[0]
    expect(sector.fields.chargeFillStatus).toEqual({
      Sobrecargados: { count: 1, items: [{ id: 'fe-1', code: 'MAT-001' }] },
    })
  })

  it('computes Vencimiento for every active extinguisher regardless of whether it was audited this period', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', code: 'MAT-001', expirationDate: FAR_FUTURE }), // vigente, sin auditar
      fe({ id: 'fe-2', code: 'MAT-002', expirationDate: PAST }), // vencido, auditado
    ])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([auditRow({ fireExtinguisherId: 'fe-2' })])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const sector = res.body.data.establishments[0].sectors[0]
    expect(sector.total).toBe(2)
    expect(sector.audited).toBe(1) // solo fe-2 tiene auditoría este período
    expect(sector.fields.expiration).toEqual({
      Vigente: { count: 1, items: [{ id: 'fe-1', code: 'MAT-001' }] },
      Vencido: { count: 1, items: [{ id: 'fe-2', code: 'MAT-002' }] },
    })
    // Los campos del checklist no existen para fe-1 (nunca auditado este período).
    expect(sector.fields.cleanliness).toEqual({ Impecable: { count: 1, items: [{ id: 'fe-2', code: 'MAT-002' }] } })
  })

  it('buckets extinguishers without expirationDate under the "Sin fecha" tier, not dropped', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([
      fe({ id: 'fe-1', code: 'MAT-001', expirationDate: FAR_FUTURE }), // vigente
      fe({ id: 'fe-2', code: 'MAT-002', expirationDate: null }), // sin fecha
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    const sector = res.body.data.establishments[0].sectors[0]
    expect(sector.fields.expiration).toEqual({
      Vigente: { count: 1, items: [{ id: 'fe-1', code: 'MAT-001' }] },
      'Sin fecha': { count: 1, items: [{ id: 'fe-2', code: 'MAT-002' }] },
    })
  })

  it('keeps only the most recent non-rejected audit per extinguisher', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1', code: 'MAT-001' })])
    db.fireExtinguisherAudit.findMany.mockResolvedValue([
      auditRow({ fireExtinguisherId: 'fe-1', auditDate: new Date('2026-07-20T00:00:00.000Z'), cleanliness: 'MUY_SUCIO' }),
      auditRow({ fireExtinguisherId: 'fe-1', auditDate: new Date('2026-07-05T00:00:00.000Z'), cleanliness: 'IMPECABLE' }),
    ])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(db.fireExtinguisherAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { auditDate: 'desc' } }),
    )
    const sector = res.body.data.establishments[0].sectors[0]
    // El mock ya llega ordenado desc — el primero (más reciente) es MUY_SUCIO.
    expect(sector.fields.cleanliness).toEqual({ 'Muy sucio': { count: 1, items: [{ id: 'fe-1', code: 'MAT-001' }] } })
  })

  it('buckets extinguishers with no establishment under "Sin establecimiento"', async () => {
    db.fireExtinguisher.findMany.mockResolvedValue([fe({ id: 'fe-1', code: 'MAT-001', establishment: null })])

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.establishments[0].establishment).toBe('Sin establecimiento')
  })

  it('returns 200 for ADMIN (bypass total)', async () => {
    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
  })

  it('returns 403 for a USER without the fire_extinguisher_audits module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: [] }))

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(403)
  })

  it('returns 200 for a USER with the fire_extinguisher_audits module', async () => {
    db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: ['fire_extinguisher_audits'] }))

    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: PERIOD })
      .set('Authorization', `Bearer ${userToken()}`)

    expect(res.status).toBe(200)
  })

  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/fire-extinguisher-audits/findings-report').query({ period: PERIOD })
    expect(res.status).toBe(401)
  })

  it('rejects a malformed period', async () => {
    const res = await request(app)
      .get('/api/v1/fire-extinguisher-audits/findings-report')
      .query({ period: 'not-a-period' })
      .set('Authorization', `Bearer ${adminToken()}`)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
  })
})
