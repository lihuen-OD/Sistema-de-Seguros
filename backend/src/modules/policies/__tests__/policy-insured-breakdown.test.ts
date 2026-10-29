import fs from 'fs'
import path from 'path'
import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'
import { matchesWhere, simulateFindMany, simulateGroupBy } from '../../../__tests__/helpers/prismaWhere'

// R4-B — summary de pólizas con prorrateo por asignaciones y desglose para
// el Dashboard general, de punta a punta: endpoint real, where real, base
// simulada en memoria (ver prismaWhere.ts) y el mismo fixture que el frontend.

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    policyAssetCoverage: { aggregate: jest.fn(), groupBy: jest.fn(), update: jest.fn() },
    assetAllocation: { findMany: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

interface FixtureLine { id: string; policyId: string; insurer: string; assetId: string | null; company: string | null; costCenter: string | null; ars: number; usd: number }
const fixture = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../../../test-fixtures/insured-attribution.json'), 'utf8')) as {
  companies: Record<string, string>
  costCenters: Record<string, string>
  assets: Record<string, [string, string, number][]>
  lines: FixtureLine[]
  cases: { name: string; filters: { companies?: string[]; costCenter?: string }; expected: Record<string, unknown> & { byInsurer: Record<string, [number, number]> } }[]
}
const C = fixture.companies
const CC = fixture.costCenters

// 15/11/2026 12:00 en Argentina.
const NOW = new Date('2026-11-15T15:00:00.000Z')
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

// ── Base simulada ────────────────────────────────────────────────────────────
interface Db { policies: Row[]; lines: Row[]; allocations: Row[] }
let current: Db

const ASSET_TYPES: Record<string, string> = {
  'S-compartido-A60-B40': 'Camión', 'AA-empresa-A': 'Camión', 'BB-empresa-B': 'Tractor', 'AY-empresa-A-centro-Y': 'Tractor',
  'U-sin-asignaciones': 'Camión', 'P-incompleto-50': 'Camión', 'O-duplicado-120': 'Tractor',
}

function buildDb(
  lines: (FixtureLine & { startDate?: string; endDate?: string; effectiveDate?: string; bajaDate?: string | null; deactivatedAt?: Date | null })[],
): Db {
  const assets = new Map<string, Row>()
  const allocations: Row[] = []
  for (const [assetId, rows] of Object.entries(fixture.assets)) {
    const asset = { id: assetId, assetType: ASSET_TYPES[assetId] ?? 'Camión', allocations: [] as Row[], policyCoverages: [] as Row[] }
    for (const [company, costCenter, percentage] of rows) {
      const allocation = { assetId, companyId: C[company], costCenterId: CC[costCenter], percentage, asset }
      asset.allocations.push(allocation)
      allocations.push(allocation)
    }
    assets.set(assetId, asset)
  }
  const policies = new Map<string, Row>()
  const builtLines: Row[] = []
  for (const l of lines) {
    const policy = policies.get(l.policyId) ?? {
      id: l.policyId, insuredName: l.insurer, policyNumber: l.policyId,
      startDate: d(l.startDate ?? '2026-01-01'), endDate: d(l.endDate ?? '2026-12-31'), deactivatedAt: l.deactivatedAt ?? null,
      isActive: true, coverages: [] as Row[], renewalLinksAsPrevious: [] as Row[],
    }
    policies.set(l.policyId, policy)
    const asset = l.assetId ? assets.get(l.assetId) : null
    const line = {
      id: l.id, policyId: l.policyId, policy, assetId: l.assetId, asset,
      companyId: l.company ? C[l.company] : null, costCenterId: l.costCenter ? CC[l.costCenter] : null,
      effectiveDate: d(l.effectiveDate ?? '2026-01-01'), bajaDate: l.bajaDate ? d(l.bajaDate) : null,
      insuredAmountArs: l.ars, insuredAmountUsd: l.usd,
    }
    policy.coverages.push(line)
    asset?.policyCoverages.push(line)
    builtLines.push(line)
  }
  return { policies: [...policies.values()], lines: builtLines, allocations }
}

let auth: Record<string, string>
beforeAll(() => {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  })
  auth = { Authorization: `Bearer ${adminToken()}` }
})
afterAll(() => jest.useRealTimers())

beforeEach(() => {
  current = buildDb(fixture.lines)
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.policy.count.mockImplementation(({ where }: Row) => Promise.resolve(current.policies.filter((p) => matchesWhere(p, where)).length))
  // Con select: consultas del summary (aseguradoras, ids en alcance). Sin select: la página del listado (no se evalúa acá).
  db.policy.findMany.mockImplementation((args: Row) => Promise.resolve(args.select ? simulateFindMany(current.policies, args) : []))
  db.policyAssetCoverage.groupBy.mockImplementation((args: Row) => Promise.resolve(simulateGroupBy(current.lines, args)))
  db.policyAssetCoverage.aggregate.mockImplementation(({ where }: Row) => {
    const lines = current.lines.filter((l) => matchesWhere(l, where))
    return Promise.resolve({ _sum: { insuredAmountArs: lines.reduce((s, l) => s + l.insuredAmountArs, 0), insuredAmountUsd: lines.reduce((s, l) => s + l.insuredAmountUsd, 0) } })
  })
  db.assetAllocation.findMany.mockImplementation((args: Row) => Promise.resolve(simulateFindMany(current.allocations, args)))
})

async function summary(query: Record<string, string | undefined>, breakdown = true) {
  const params = new URLSearchParams({ includeSummary: 'true', limit: '1', ...(breakdown && { includeInsuredBreakdown: 'true' }) })
  for (const [k, v] of Object.entries(query)) if (v) params.set(k, v)
  const res = await request(app).get(`/api/v1/policies?${params}`).set(auth)
  expect(res.status).toBe(200)
  return res.body.summary
}
const scopeQuery = (f: { companies?: string[]; costCenter?: string }) => ({
  scopeCompanyIds: f.companies?.map((k) => C[k]).join(','),
  scopeCostCenterId: f.costCenter ? CC[f.costCenter] : undefined,
})

describe('GET /policies?includeSummary&includeInsuredBreakdown — fixture compartido', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const s = await summary(scopeQuery(c.filters))
    expect([s.insuredActiveArs, s.insuredActiveUsd]).toEqual([c.expected.ars, c.expected.usd])
    expect(s.insuredBreakdown.activeCoveragePolicyCount).toBe(c.expected.policies)
    expect(s.insuredBreakdown.insuredAssetCount).toBe(c.expected.assets)
    expect(s.insuredBreakdown.allocationIssues).toEqual({ underAllocatedAssets: c.expected.underAllocated, overAllocatedAssets: c.expected.overAllocated })
    expect(Object.fromEntries(s.insuredBreakdown.byInsurer.map((i: Row) => [i.insurer, [i.insuredActiveArs, i.insuredActiveUsd]]))).toEqual(c.expected.byInsurer)
  })

  it('17. the chart by insurer adds up exactly to the filtered KPI', async () => {
    for (const c of fixture.cases) {
      const s = await summary(scopeQuery(c.filters))
      const total = s.insuredBreakdown.byInsurer.reduce((sum: number, i: Row) => sum + i.insuredActiveArs, 0)
      expect(Math.round(total * 100) / 100).toBe(s.insuredActiveArs)
    }
  })

  it('without filters, the breakdown keeps the same global as the plain aggregate (PoliciesPage path)', async () => {
    const plain = await summary({}, false)
    const withBreakdown = await summary({})
    expect([withBreakdown.insuredActiveArs, withBreakdown.insuredActiveUsd]).toEqual([plain.insuredActiveArs, plain.insuredActiveUsd])
    expect(plain.insuredBreakdown).toBeUndefined()
    expect(db.policyAssetCoverage.groupBy).toHaveBeenCalledTimes(1) // solo el pedido con desglose
  })

  it('company filter WITHOUT breakdown still prorates the KPI (same rule for every caller)', async () => {
    const s = await summary(scopeQuery({ companies: ['A'] }), false)
    expect([s.insuredActiveArs, s.insuredActiveUsd]).toEqual([154_200_000, 110_900])
    expect(s.insuredBreakdown).toBeUndefined()
  })

  it('scopePolicyIds: every policy in scope (policy-level membership), only when there is a scope', async () => {
    expect((await summary({})).insuredBreakdown.scopePolicyIds).toBeNull()
    const ids = (await summary(scopeQuery({ companies: ['B'] }))).insuredBreakdown.scopePolicyIds
    expect([...ids].sort()).toEqual(['P1', 'P2', 'P3', 'P6'])
  })
})

describe('tipo de activo (sin prorrateo) y combinado con empresa', () => {
  it('8. asset type alone filters lines without prorating: Camión = L1 + L2 + L7 + L8 + L10', async () => {
    const s = await summary({ scopeAssetType: 'Camión' })
    expect([s.insuredActiveArs, s.insuredActiveUsd]).toEqual([163_000_000, 150_500])
    expect(s.insuredBreakdown.attributed).toBe(false)
  })

  it('asset type + company prorates only the in-scope lines', async () => {
    // L1 60 % + L2 100 % + L7 (sin asignaciones) 0 + L8 50 % + L10 60 %.
    const s = await summary({ scopeAssetType: 'Camión', ...scopeQuery({ companies: ['A'] }) })
    expect([s.insuredActiveArs, s.insuredActiveUsd]).toEqual([113_200_000, 101_900])
    expect(s.insuredBreakdown.attributed).toBe(true)
  })
})

describe('vigencia efectiva dentro del prorrateo', () => {
  const extra = (line: Partial<FixtureLine> & Record<string, unknown>) => ({
    id: 'X', policyId: 'PX', insurer: 'Aseguradora Norte', assetId: 'S-compartido-A60-B40', company: null, costCenter: null, ars: 999_000_000, usd: 999_000,
    ...line,
  }) as FixtureLine

  it('13. a future policy is in the scope list but adds nothing and does not count as insured', async () => {
    current = buildDb([...fixture.lines, extra({ policyId: 'P-futura', startDate: '2026-12-01', endDate: '2027-11-30', effectiveDate: '2026-12-01' } as Row)])
    const s = await summary(scopeQuery({ companies: ['A'] }))
    expect([s.insuredActiveArs, s.insuredBreakdown.activeCoveragePolicyCount]).toEqual([154_200_000, 6])
    expect(s.insuredBreakdown.scopePolicyIds).toContain('P-futura')
  })

  it('14. a historical (past bajaDate) line neither adds nor makes its asset insured today', async () => {
    current = buildDb([...fixture.lines.filter((l) => l.assetId !== 'BB-empresa-B'), extra({ id: 'L-hist', policyId: 'P-hist', assetId: 'BB-empresa-B', bajaDate: '2026-11-14' } as Row)])
    const s = await summary(scopeQuery({ companies: ['B'] }))
    expect(s.insuredBreakdown.insuredAssetCount).toBe(1) // solo el compartido
    expect(s.insuredActiveArs).toBe(40_800_000) // L1 40 % + L10 40 % (sin BB)
  })

  it('2. bajaDate = today still adds (inclusive)', async () => {
    current = buildDb([extra({ id: 'L-hoy', policyId: 'P-hoy', assetId: 'BB-empresa-B', ars: 5_000_000, usd: 5_000, bajaDate: '2026-11-15' } as Row)])
    expect((await summary(scopeQuery({ companies: ['B'] }))).insuredActiveArs).toBe(5_000_000)
  })

  it('a manually deactivated policy adds nothing', async () => {
    current = buildDb([extra({ policyId: 'P-baja', deactivatedAt: new Date('2026-06-01T12:00:00Z') } as Row)])
    const s = await summary({})
    expect([s.insuredActiveArs, s.insuredBreakdown.activeCoveragePolicyCount]).toEqual([0, 0])
  })
})

describe('18. totales globales sin truncar (más de 200 pólizas)', () => {
  it('250 policies: the KPI, the counts and the scope ids cover all of them, not the first page', async () => {
    current = buildDb(Array.from({ length: 250 }, (_, i) => ({
      id: `L${i}`, policyId: `P${i}`, insurer: i % 2 ? 'Aseguradora Norte' : 'Aseguradora Sur', assetId: 'AA-empresa-A', company: null, costCenter: null, ars: 1_000_000, usd: 1_000,
    })))
    const s = await summary(scopeQuery({ companies: ['A'] }))
    expect(s.total).toBe(250)
    expect([s.insuredActiveArs, s.insuredActiveUsd]).toEqual([250_000_000, 250_000])
    expect(s.insuredBreakdown.activeCoveragePolicyCount).toBe(250)
    expect(s.insuredBreakdown.scopePolicyIds).toHaveLength(250)
    expect(s.insuredBreakdown.byInsurer.map((i: Row) => i.policyCount).sort()).toEqual([125, 125])
  })
})

describe('19. nada histórico se toca', () => {
  it('the summary only reads: no writes and no accounting-document queries', async () => {
    await summary(scopeQuery({ companies: ['A'] }))
    expect(db.policy.update).not.toHaveBeenCalled()
    expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    // El mock de prisma no define accountingDocument: cualquier consulta de documentos fallaría la request.
    expect(Object.keys(db)).not.toContain('accountingDocument')
  })
})
