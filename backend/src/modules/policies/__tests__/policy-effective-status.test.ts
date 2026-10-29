import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

// R2 — estado administrativo (effectiveStatus) en listados, filtros, resumen,
// detalle y búsqueda, y la garantía central: registrar o no una renovación no
// mueve ningún dato económico ni el estado contractual (`status`).

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
    policyAssetCoverage: { aggregate: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
const auth = { Authorization: `Bearer ${adminToken()}` }

const POLICY_ID = '34000000-0000-0000-0000-000000000001'
const NEW_ID = '34000000-0000-0000-0000-000000000002'
const OLD_ID = '34000000-0000-0000-0000-000000000003'
const TYPE_ID = '50000000-0000-0000-0000-000000000001'
const COMPANY_A = '70000000-0000-0000-0000-00000000000a'
const COMPANY_B = '70000000-0000-0000-0000-00000000000b'
const COST_CENTER = '71000000-0000-0000-0000-000000000001'
const ASSET_ID = '40000000-0000-0000-0000-000000000001'

// Fechas lejanas: los estados no dependen del día en que corre el test.
const FAR_FUTURE = new Date('2099-12-31T00:00:00.000Z')
const PAST = new Date('2000-12-31T00:00:00.000Z')
const renewedBy = { renewalPolicy: { id: NEW_ID, policyNumber: 'R-NEW' } }

const listLine = {
  id: 'cov-1', assetId: ASSET_ID, insuranceTypeId: TYPE_ID, coverageIds: [], insuredAmount: 10000, currency: 'USD',
  exchangeRate: 1000, insuredAmountArs: 10_000_000, insuredAmountUsd: 10000, companyId: null, costCenterId: null,
  effectiveDate: new Date('2026-01-01T00:00:00.000Z'), bajaDate: null, bajaReason: null, deactivatedAt: null,
  insuranceType: { id: TYPE_ID, name: 'Automotor' }, asset: { id: ASSET_ID, name: 'Camión A' },
  attachments: [], _count: { attachments: 0 },
}

function listRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POLICY_ID, policyNumber: 'R-OLD', insuredName: 'La Segunda', producerId: null, producer: null,
    startDate: new Date('2099-01-01T00:00:00.000Z'), endDate: FAR_FUTURE, description: null, isActive: true,
    deactivatedAt: null as Date | null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    coverages: [listLine], _count: { coverages: 1 }, renewalLinksAsPrevious: [] as unknown[],
    ...overrides,
  }
}

// El select de la línea en el detalle (COVERAGE_DETAIL_INCLUDE) es más rico.
function detailRow(overrides: Record<string, unknown> = {}) {
  return listRow({
    coverages: [{ ...listLine, insuranceType: { id: TYPE_ID, name: 'Automotor', coverages: [] }, asset: { id: ASSET_ID, name: 'Camión A', code: 'A' } }],
    renewalLinksAsRenewal: [] as unknown[],
    ...overrides,
  })
}

// Quita lo administrativo para comparar todo lo demás campo a campo.
function withoutAdministrativeFields<T extends Record<string, unknown>>(row: T) {
  const { effectiveStatus: _effectiveStatus, renewal: _renewal, ...rest } = row
  return rest
}

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.policy.count.mockResolvedValue(0)
  db.policy.findMany.mockResolvedValue([])
  db.policyAssetCoverage.aggregate.mockResolvedValue({ _sum: { insuredAmountArs: 0, insuredAmountUsd: 0 } })
})

describe('GET /api/v1/policies — estado administrativo', () => {
  it('returns effectiveStatus and renewedBy per row next to the unchanged contractual status', async () => {
    db.policy.findMany.mockResolvedValue([
      listRow({ id: 'a', renewalLinksAsPrevious: [renewedBy] }),
      listRow({ id: 'b' }),
      listRow({ id: 'c', endDate: PAST, renewalLinksAsPrevious: [renewedBy] }),
      listRow({ id: 'd', endDate: PAST }),
      listRow({ id: 'e', deactivatedAt: new Date('2026-02-01T12:00:00Z'), renewalLinksAsPrevious: [renewedBy] }),
    ])

    const res = await request(app).get('/api/v1/policies').set(auth)

    expect(res.status).toBe(200)
    expect(res.body.data.map((p: { status: string; effectiveStatus: string }) => [p.status, p.effectiveStatus])).toEqual([
      ['vigente', 'renovada'],
      ['vigente', 'vigente'],
      ['vencida', 'vencida'],
      ['vencida', 'vencida'],
      ['de_baja', 'de_baja'],
    ])
    expect(res.body.data[0].renewal).toEqual({ isMarked: true, renewedBy: { id: NEW_ID, policyNumber: 'R-NEW' } })
    expect(res.body.data[1].renewal).toEqual({ isMarked: false, renewedBy: null })
    expect(res.body.data[2].renewal.isMarked).toBe(true)
    expect(res.body.data[0]).not.toHaveProperty('renewalLinksAsPrevious')
    // Un único include acotado (Prisma lo resuelve en una consulta para toda la página).
    expect(db.policy.findMany.mock.calls[0][0].include.renewalLinksAsPrevious).toEqual({
      where: { revokedAt: null },
      select: { renewalPolicy: { select: { id: true, policyNumber: true } } },
      take: 1,
    })
  })

  it('filters by effectiveStatus with AND, keeping the search OR and the pagination intact', async () => {
    const res = await request(app).get('/api/v1/policies?effectiveStatus=renovada&search=R-OLD&page=2&limit=10').set(auth)

    expect(res.status).toBe(200)
    const { where, skip, take } = db.policy.findMany.mock.calls[0][0]
    expect([skip, take]).toEqual([10, 10])
    expect(where.AND).toHaveLength(2)
    expect(where.AND[0].OR).toHaveLength(2)
    expect(where.AND[1]).toEqual({
      deactivatedAt: null,
      endDate: { gte: expect.any(Date) },
      renewalLinksAsPrevious: { some: { revokedAt: null } },
    })
    // El total de la paginación usa exactamente el mismo filtro que la página.
    expect(db.policy.count.mock.calls[0][0].where).toEqual(where)
  })

  it('combines the contractual and administrative expired states without requiring a renewal link', async () => {
    await request(app).get('/api/v1/policies?status=vencida&effectiveStatus=vencida').set(auth)

    const { where } = db.policy.findMany.mock.calls[0][0]
    expect(where.AND[0]).toEqual({ endDate: { lt: expect.any(Date) }, deactivatedAt: null })
    expect(where.AND[1]).toEqual({ deactivatedAt: null, endDate: { lt: expect.any(Date) } })
  })

  it('keeps the legacy where shape when only the contractual status is sent', async () => {
    await request(app).get('/api/v1/policies?status=vigente').set(auth)

    const { where } = db.policy.findMany.mock.calls[0][0]
    expect(where).toEqual({ endDate: { gt: expect.any(Date) }, deactivatedAt: null })
  })

  it('accepts the proximo_vencer alias and rejects unknown values (422)', async () => {
    const ok = await request(app).get('/api/v1/policies?effectiveStatus=proximo_vencer').set(auth)
    const bad = await request(app).get('/api/v1/policies?effectiveStatus=pendiente').set(auth)

    expect(ok.status).toBe(200)
    expect(db.policy.findMany.mock.calls[0][0].where.AND[1].endDate).toEqual({ gte: expect.any(Date), lte: expect.any(Date) })
    expect(bad.status).toBe(422)
  })

  it('adds the dashboard scope filters as separate AND conditions, without colliding with insuranceTypeId', async () => {
    const res = await request(app)
      .get(`/api/v1/policies?insuranceTypeId=${TYPE_ID}&scopeCompanyIds=${COMPANY_A},${COMPANY_B}&scopeCostCenterId=${COST_CENTER}&scopeAssetType=vehiculo`)
      .set(auth)

    expect(res.status).toBe(200)
    const { where } = db.policy.findMany.mock.calls[0][0]
    expect(where.coverages).toEqual({ some: { insuranceTypeId: TYPE_ID } })
    expect(where.AND).toEqual([
      {
        coverages: {
          some: {
            OR: [
              { assetId: null, companyId: { in: [COMPANY_A, COMPANY_B] } },
              { asset: { is: { allocations: { some: { companyId: { in: [COMPANY_A, COMPANY_B] } } } } } },
            ],
          },
        },
      },
      {
        coverages: {
          some: {
            OR: [
              { assetId: null, costCenterId: COST_CENTER },
              { asset: { is: { allocations: { some: { costCenterId: COST_CENTER, companyId: { in: [COMPANY_A, COMPANY_B] } } } } } },
            ],
          },
        },
      },
      { coverages: { some: { asset: { is: { assetType: 'vehiculo' } } } } },
    ])
  })

  it('rejects an invalid company id in the scope (422)', async () => {
    const res = await request(app).get(`/api/v1/policies?scopeCompanyIds=${COMPANY_A},not-a-uuid`).set(auth)
    expect(res.status).toBe(422)
  })
})

describe('GET /api/v1/policies?includeSummary=true — byEffectiveStatus', () => {
  // Cada conteo se identifica por la forma de su filtro de estado (AND[1]).
  function effectiveStatusOf(where: { AND?: Record<string, unknown>[] }): string | null {
    const f = where.AND?.[1]
    const renewal = f?.renewalLinksAsPrevious as Record<string, unknown> | undefined
    if (!f) return null
    if (f.deactivatedAt && typeof f.deactivatedAt === 'object') return renewal === undefined ? 'de_baja' : null
    const end = f.endDate as Record<string, unknown>
    if (end?.lt) return 'vencida'
    if (renewal?.some) return 'renovada'
    if (!renewal && !end) return null
    if (end.gt) return 'vigente'
    return 'proxima_a_vencer'
  }
  const COUNTS: Record<string, number> = { vigente: 50, proxima_a_vencer: 4, renovada: 6, vencida: 11, de_baja: 1 }

  beforeEach(() => {
    db.policy.count.mockImplementation((args: { where: { AND?: Record<string, unknown>[] } }) => {
      const status = effectiveStatusOf(args.where)
      return Promise.resolve(status ? COUNTS[status] : 3)
    })
  })

  it('counts the five administrative states over the whole filtered set (scope included), ignoring only the state filters', async () => {
    const res = await request(app)
      .get('/api/v1/policies?includeSummary=true&effectiveStatus=renovada&status=vigente&scopeAssetType=vehiculo&limit=5')
      .set(auth)

    expect(res.status).toBe(200)
    expect(res.body.summary.byEffectiveStatus).toEqual(COUNTS)
    // Todos los conteos salvo el total de la tabla: 4 contractuales + 6 administrativos.
    const tableWhere = JSON.stringify(db.policy.findMany.mock.calls[0][0].where)
    const summaryCounts = db.policy.count.mock.calls
      .map((c: [{ where: { AND: Record<string, unknown>[] } }]) => c[0].where)
      .filter((w: unknown) => JSON.stringify(w) !== tableWhere)
    expect(summaryCounts).toHaveLength(4 + 5)
    for (const w of summaryCounts) {
      // baseWhere: con el alcance del dashboard, sin ningún filtro de estado.
      expect(w.AND[0].AND).toEqual([{ coverages: { some: { asset: { is: { assetType: 'vehiculo' } } } } }])
      expect(w.AND[0]).not.toHaveProperty('endDate')
      expect(w.AND[0]).not.toHaveProperty('deactivatedAt')
    }
  })

  it('evaluates every administrative count with the same instant as the table filter (no midnight split)', async () => {
    await request(app).get('/api/v1/policies?includeSummary=true&effectiveStatus=vigente').set(auth)

    const tableToday = db.policy.findMany.mock.calls[0][0].where.AND[1].endDate.gt.getTime()
    const vigenteCount = db.policy.count.mock.calls
      .map((c: [{ where: { AND?: Record<string, unknown>[] } }]) => c[0].where)
      .find((w: { AND?: Record<string, unknown>[] }) => effectiveStatusOf(w) === 'vigente' && w.AND?.[1] && 'renewalLinksAsPrevious' in w.AND[1])
    expect(vigenteCount.AND[1].endDate.gt.getTime()).toBe(tableToday)
  })
})

describe('Detalle, baja manual y búsqueda', () => {
  it('GET /:id returns renewedBy and renewalOf (consolidation) from active links only', async () => {
    db.policy.findUnique.mockResolvedValue(detailRow({
      renewalLinksAsPrevious: [renewedBy],
      renewalLinksAsRenewal: [
        { previousPolicy: { id: OLD_ID, policyNumber: 'R-OLDER-1' } },
        { previousPolicy: { id: 'x', policyNumber: 'R-OLDER-2' } },
      ],
    }))

    const res = await request(app).get(`/api/v1/policies/${POLICY_ID}`).set(auth)

    expect(res.status).toBe(200)
    expect(res.body.data.effectiveStatus).toBe('renovada')
    expect(res.body.data.status).toBe('vigente')
    expect(res.body.data.renewal).toEqual({
      isMarked: true,
      renewedBy: { id: NEW_ID, policyNumber: 'R-NEW' },
      renewalOf: [{ id: OLD_ID, policyNumber: 'R-OLDER-1' }, { id: 'x', policyNumber: 'R-OLDER-2' }],
    })
    const { include } = db.policy.findUnique.mock.calls[0][0]
    expect(include.renewalLinksAsPrevious.where).toEqual({ revokedAt: null })
    expect(include.renewalLinksAsRenewal.where).toEqual({ revokedAt: null })
  })

  it('a reverted renewal (no active link) shows the date-based state again', async () => {
    db.policy.findUnique.mockResolvedValue(detailRow({ endDate: PAST }))

    const res = await request(app).get(`/api/v1/policies/${POLICY_ID}`).set(auth)

    expect(res.body.data.effectiveStatus).toBe('vencida')
    expect(res.body.data.renewal).toEqual({ isMarked: false, renewedBy: null, renewalOf: [] })
  })

  it('manual baja on a renewed policy shows De baja but keeps the renewal visible', async () => {
    db.policy.findUnique.mockResolvedValue({ id: POLICY_ID, deactivatedAt: null })
    db.policy.update.mockResolvedValue(detailRow({ deactivatedAt: new Date(), renewalLinksAsPrevious: [renewedBy] }))

    const res = await request(app).post(`/api/v1/policies/${POLICY_ID}/de-baja`).set(auth)

    expect(res.status).toBe(200)
    expect([res.body.data.status, res.body.data.effectiveStatus]).toEqual(['de_baja', 'de_baja'])
    expect(res.body.data.renewal.renewedBy).toEqual({ id: NEW_ID, policyNumber: 'R-NEW' })
  })

  it('search returns effectiveStatus for selectors, looking only at active links', async () => {
    db.policy.findMany.mockResolvedValue([{
      id: POLICY_ID, policyNumber: 'R-OLD', insuredName: 'La Segunda', startDate: PAST, endDate: PAST, deactivatedAt: null,
      producer: null, coverages: [], renewalLinksAsPrevious: [{ id: 'link-1' }],
    }])

    const res = await request(app).get('/api/v1/policies/search?q=R-OLD').set(auth)

    expect(res.body.data[0]).toMatchObject({ status: 'vencida', effectiveStatus: 'vencida' })
    expect(db.policy.findMany.mock.calls[0][0].select.renewalLinksAsPrevious).toEqual({ where: { revokedAt: null }, select: { id: true }, take: 1 })
  })
})

// ── Invariancia económica ─────────────────────────────────────────────────────
// Registrar o revertir una renovación solo puede cambiar effectiveStatus y
// renewal. Todo lo demás —estado contractual, sumas aseguradas, montos por
// línea, cantidades— tiene que ser idéntico byte a byte.
describe('Invariancia económica: con y sin renovación', () => {
  const cases = [
    ['vigente lejana', {}],
    ['vencida', { endDate: PAST }],
    ['dada de baja', { deactivatedAt: new Date('2026-02-01T12:00:00Z') }],
  ] as const

  it.each(cases)('list (includeCoverages) — %s: only effectiveStatus/renewal differ', async (_label, overrides) => {
    db.policy.findMany.mockResolvedValueOnce([listRow({ ...overrides })])
    const without = (await request(app).get('/api/v1/policies?includeCoverages=true').set(auth)).body.data[0]
    db.policy.findMany.mockResolvedValueOnce([listRow({ ...overrides, renewalLinksAsPrevious: [renewedBy] })])
    const withRenewal = (await request(app).get('/api/v1/policies?includeCoverages=true').set(auth)).body.data[0]

    expect(withoutAdministrativeFields(withRenewal)).toEqual(withoutAdministrativeFields(without))
    expect(withRenewal.totalInsuredAmountUsd).toBe(10000)
    expect(withRenewal.status).toBe(without.status)
  })

  it('a manual mark on an expired policy changes only administrative metadata', async () => {
    db.policy.findMany.mockResolvedValueOnce([listRow({ endDate: PAST })])
    const before = (await request(app).get('/api/v1/policies?includeCoverages=true').set(auth)).body.data[0]
    db.policy.findMany.mockResolvedValueOnce([
      listRow({ endDate: PAST, renewalLinksAsPrevious: [{ renewalPolicy: null }] }),
    ])
    const after = (await request(app).get('/api/v1/policies?includeCoverages=true').set(auth)).body.data[0]

    expect(after.effectiveStatus).toBe('vencida')
    expect(after.renewal).toEqual({ isMarked: true, renewedBy: null })
    expect(withoutAdministrativeFields(after)).toEqual(withoutAdministrativeFields(before))
  })

  it.each(cases)('detail — %s: only effectiveStatus/renewal differ', async (_label, overrides) => {
    db.policy.findUnique.mockResolvedValueOnce(detailRow({ ...overrides }))
    const without = (await request(app).get(`/api/v1/policies/${POLICY_ID}`).set(auth)).body.data
    db.policy.findUnique.mockResolvedValueOnce(detailRow({
      ...overrides,
      renewalLinksAsPrevious: [renewedBy],
      renewalLinksAsRenewal: [{ previousPolicy: { id: OLD_ID, policyNumber: 'R-OLDER-1' } }],
    }))
    const withRenewal = (await request(app).get(`/api/v1/policies/${POLICY_ID}`).set(auth)).body.data

    expect(withoutAdministrativeFields(withRenewal)).toEqual(withoutAdministrativeFields(without))
  })

  it('the contractual summary (byStatus, insuredActive) never queries renewals — renewals cannot move it', async () => {
    await request(app).get('/api/v1/policies?includeSummary=true&status=vigente&search=x').set(auth)

    // Los 4 conteos contractuales (byStatus) usan buildPolicyStatusFilter: ninguno toca renovaciones.
    const legacyFilters = ['vigente', 'proxima_a_vencer', 'vencida', 'de_baja'].map((s) =>
      JSON.stringify(jest.requireActual('../../../shared/utils/dates').buildPolicyStatusFilter(s)),
    )
    const legacyCounts = db.policy.count.mock.calls
      .map((c: [{ where: { AND?: Record<string, unknown>[] } }]) => c[0].where)
      .filter((w: { AND?: Record<string, unknown>[] }) => w.AND && legacyFilters.includes(JSON.stringify(w.AND[1])))
    expect(legacyCounts.length).toBeGreaterThanOrEqual(4)
    for (const w of legacyCounts) expect(JSON.stringify(w)).not.toContain('renewalLinksAsPrevious')
    const aggregateArgs = db.policyAssetCoverage.aggregate.mock.calls[0][0]
    expect(JSON.stringify(aggregateArgs)).not.toContain('renewalLinksAsPrevious')
    expect(aggregateArgs.where.policy.AND[1]).toEqual({ deactivatedAt: null, startDate: { lte: expect.any(Date) }, endDate: { gte: expect.any(Date) } })
  })

  it('without an administrative filter, the list query is identical whether renewals exist or not', async () => {
    db.policy.findMany.mockResolvedValueOnce([listRow()])
    await request(app).get('/api/v1/policies?status=vigente&search=x&page=1&limit=20').set(auth)
    db.policy.findMany.mockResolvedValueOnce([listRow({ renewalLinksAsPrevious: [renewedBy] })])
    await request(app).get('/api/v1/policies?status=vigente&search=x&page=1&limit=20').set(auth)

    const [first, second] = db.policy.findMany.mock.calls.map((c: [Record<string, unknown>]) => c[0])
    expect(second.where).toEqual(first.where)
    expect(JSON.stringify(first.where)).not.toContain('renewalLinksAsPrevious')
  })
})
