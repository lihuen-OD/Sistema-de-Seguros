import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

// R4-A (corrección) — la suma asegurada activa con filtros de alcance suma
// SOLO las líneas en alcance, no todas las líneas de las pólizas que entran
// al filtro. Desde R4-B, con filtro de empresa / centro de costo la parte de
// cada línea se prorratea por las asignaciones del activo (el compartido
// 60/40 aporta 60 % a A y 40 % a B, ya no el 100 % a cada una). Los mocks
// evalúan el `where` real que arma el servicio sobre un conjunto fijo de
// líneas (ver prismaWhere.ts): los tests comparan importes, no la forma del
// filtro.

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findMany: jest.fn(), count: jest.fn() },
    policyAssetCoverage: { aggregate: jest.fn(), groupBy: jest.fn() },
    assetAllocation: { findMany: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
import { matchesWhere as matches, simulateFindMany, simulateGroupBy } from '../../../__tests__/helpers/prismaWhere'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
type Where = Record<string, unknown>

// ── Datos: hoy (Argentina) = 15/11/2026 ─────────────────────────────────────
const NOW = new Date('2026-11-15T15:00:00.000Z')
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
const COMPANY_A = '70000000-0000-0000-0000-00000000000a'
const COMPANY_B = '70000000-0000-0000-0000-00000000000b'
const CC_X = '71000000-0000-0000-0000-00000000000a'
const CC_Y = '71000000-0000-0000-0000-00000000000b'

const asset = (id: string, assetType: string, allocations: [string, string, number][]) => ({
  id, assetType, allocations: allocations.map(([companyId, costCenterId, percentage]) => ({ companyId, costCenterId, percentage })),
})
const CAMION_AX = asset('asset-1', 'Camión', [[COMPANY_A, CC_X, 100]])
const TRACTOR_BY = asset('asset-2', 'Tractor', [[COMPANY_B, CC_Y, 100]])
const CAMION_SHARED = asset('asset-3', 'Camión', [[COMPANY_A, CC_X, 60], [COMPANY_B, CC_Y, 40]])
const TRACTOR_AY = asset('asset-4', 'Tractor', [[COMPANY_A, CC_Y, 100]])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Line = any
const LINES: Line[] = []
function policy(
  id: string,
  startDate: string,
  endDate: string,
  lines: [string, typeof CAMION_AX | null, number, Record<string, unknown>?][],
  target: Line[] = LINES,
) {
  const p = { id, startDate: d(startDate), endDate: d(endDate), deactivatedAt: null, coverages: [] as unknown[] }
  for (const [lineId, a, millionsArs, extra] of lines) {
    const line = {
      id: lineId, policy: p, assetId: a?.id ?? null, asset: a, companyId: null, costCenterId: null,
      effectiveDate: d(startDate), bajaDate: null, insuredAmountArs: millionsArs * 1_000_000, insuredAmountUsd: millionsArs * 1_000,
      ...extra,
    }
    p.coverages.push(line)
    target.push(line)
  }
  return p
}
// Montos en millones de ARS (USD = ARS / 1000).
policy('P1-una-empresa', '2026-01-01', '2026-12-31', [['L1', CAMION_AX, 100]])
policy('P2-dos-empresas', '2026-01-01', '2026-12-31', [['L2', CAMION_AX, 100], ['L3', TRACTOR_BY, 50], ['L9', TRACTOR_AY, 25]])
policy('P3-sin-activo', '2026-01-01', '2026-12-31', [
  ['L4', null, 30, { companyId: COMPANY_A, costCenterId: CC_X }],
  ['L5', null, 20, { companyId: COMPANY_B, costCenterId: CC_Y }],
])
policy('P4-futura', '2026-12-01', '2027-11-30', [['L-fut', CAMION_AX, 70]])
policy('P5-bajas', '2026-01-01', '2026-12-31', [
  ['L-baja-pasada', CAMION_AX, 40, { bajaDate: d('2026-11-01') }],
  ['L6-baja-hoy', TRACTOR_BY, 10, { bajaDate: d('2026-11-15') }],
])
policy('P6-superpuesta', '2026-11-01', '2027-10-31', [['L7', CAMION_AX, 5]])
policy('P7-linea-futura', '2026-01-01', '2026-12-31', [['L-linea-fut', TRACTOR_BY, 8, { effectiveDate: d('2026-12-01') }]])
policy('P8-activo-compartido', '2026-01-01', '2026-12-31', [['L8', CAMION_SHARED, 12]])

// Conjuntos aislados para los casos 1 y 2 (no suman al conjunto global).
const ONLY_SINGLE_COMPANY: Line[] = []
policy('P-solo-A', '2026-01-01', '2026-12-31', [['LA', CAMION_AX, 100]], ONLY_SINGLE_COMPANY)
// El caso reportado: misma póliza, línea de la Empresa A (100 M) y de la B (50 M).
const REPORTED_CASE: Line[] = []
policy('P-reportada', '2026-01-01', '2026-12-31', [['LA', CAMION_AX, 100], ['LB', TRACTOR_BY, 50]], REPORTED_CASE)

let dataset: Line[] = LINES

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
  dataset = LINES
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.policy.count.mockResolvedValue(0)
  db.policy.findMany.mockResolvedValue([])
  db.policyAssetCoverage.aggregate.mockImplementation(({ where }: { where: Where }) => {
    const lines = dataset.filter((line) => matches(line, where))
    return Promise.resolve({
      _sum: {
        insuredAmountArs: lines.reduce((s, l) => s + l.insuredAmountArs, 0),
        insuredAmountUsd: lines.reduce((s, l) => s + l.insuredAmountUsd, 0),
      },
    })
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.policyAssetCoverage.groupBy.mockImplementation((args: any) => Promise.resolve(simulateGroupBy(dataset, args)))
  // Asignaciones de los activos del conjunto, con su relación activo → líneas.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.assetAllocation.findMany.mockImplementation((args: any) => {
    const assets = [...new Set(dataset.map((l) => l.asset).filter(Boolean))]
    const allocations = assets.flatMap((a) => {
      const withLines = { ...a, policyCoverages: dataset.filter((l) => l.asset === a) }
      return a.allocations.map((al: Record<string, unknown>) => ({ ...al, assetId: a.id, asset: withLines }))
    })
    return Promise.resolve(simulateFindMany(allocations, args))
  })
})

async function insuredActiveMillions(query: string) {
  const res = await request(app).get(`/api/v1/policies?includeSummary=true&limit=1${query}`).set(auth)
  expect(res.status).toBe(200)
  const { insuredActiveArs, insuredActiveUsd } = res.body.summary
  expect(insuredActiveUsd * 1000).toBe(insuredActiveArs)
  return insuredActiveArs / 1_000_000
}

describe('summary.insuredActive con filtros de alcance — importes por línea', () => {
  it('9. without filters: every in-force line, globally (352 M)', async () => {
    // L1 100 + L2 100 + L3 50 + L9 25 + L4 30 + L5 20 + L6 10 + L7 5 + L8 12.
    expect(await insuredActiveMillions('')).toBe(352)
  })

  it('1. a single-company policy: its whole amount in its company, nothing in the other one', async () => {
    dataset = ONLY_SINGLE_COMPANY
    expect(await insuredActiveMillions('')).toBe(100)
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}`)).toBe(100)
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_B}`)).toBe(0)
  })

  it('2. the reported case: line of company A (100 M) + line of company B (50 M), filter A → 100 M, not 150 M', async () => {
    dataset = REPORTED_CASE
    expect(await insuredActiveMillions('')).toBe(150)
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}`)).toBe(100)
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_B}`)).toBe(50)
  })

  it('2b. policies with lines of several companies, on the full dataset', async () => {
    // A: L1 100 + L2 100 + L9 25 + L4 30 (sin activo) + L7 5 + L8 12 × 60 % (compartido, R4-B). Antes de R4-A: 352.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}`)).toBe(267.2)
    // B: L3 50 + L5 20 (sin activo) + L6 10 + L8 12 × 40 %.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_B}`)).toBe(84.8)
    // Ambas empresas: cada línea una sola vez (el compartido 60 % + 40 % = 100 %).
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A},${COMPANY_B}`)).toBe(352)
  })

  it('3. lines of different cost centers', async () => {
    // X: L1 + L2 + L7 (activo A/X) 205 + L4 30 (sin activo) + L8 12 × 60 % (su asignación X).
    expect(await insuredActiveMillions(`&scopeCostCenterId=${CC_X}`)).toBe(242.2)
    // Y: L3 50 + L9 25 + L5 20 + L6 10 + L8 12 × 40 %.
    expect(await insuredActiveMillions(`&scopeCostCenterId=${CC_Y}`)).toBe(109.8)
  })

  it('4. lines of different asset types (lines without an asset have no type; asset type alone never prorates)', async () => {
    expect(await insuredActiveMillions('&scopeAssetType=Cami%C3%B3n')).toBe(217) // L1 + L2 + L7 + L8 completo
    expect(await insuredActiveMillions('&scopeAssetType=Tractor')).toBe(85) // L3 + L9 + L6
  })

  it('5. combined filters: every condition on the SAME line (and the same allocation for company + cost center)', async () => {
    // A + Y: solo L9 (activo A/Y). L8 tiene Y pero con la Empresa B; L4 es A pero X.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}&scopeCostCenterId=${CC_Y}`)).toBe(25)
    // A + Camión: L1 + L2 + L7 + L8 × 60 %. L4 (A, sin activo) no tiene tipo.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}&scopeAssetType=Cami%C3%B3n`)).toBe(212.2)
    // A + X + Tractor: ninguna línea cumple las tres (L9 es A/Y).
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}&scopeCostCenterId=${CC_X}&scopeAssetType=Tractor`)).toBe(0)
  })

  it('6. future lines and future policies never add, even in scope', async () => {
    // P4 (futura, 70) y L-linea-fut (8) serían de A/Camión y B/Tractor respectivamente.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}&scopeAssetType=Cami%C3%B3n`)).toBe(212.2)
    expect(await insuredActiveMillions('&scopeAssetType=Tractor')).toBe(85)
  })

  it('7. de-baja lines: a past bajaDate does not add; bajaDate = today still adds', async () => {
    // L-baja-pasada (40, A/X) no suma; L6-baja-hoy (10, B/Y) sí.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}`)).toBe(267.2)
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_B}`)).toBe(84.8)
  })

  it('8. a filter with no matching line adds 0', async () => {
    // B + X: ninguna asignación ni línea sin activo combina la Empresa B con el centro X.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_B}&scopeCostCenterId=${CC_X}`)).toBe(0)
    expect(await insuredActiveMillions('&scopeAssetType=Avi%C3%B3n')).toBe(0)
  })

  it('10. genuinely overlapping policies on the same asset all add (no deduplication)', async () => {
    // Camión A/X: L1 (P1) + L2 (P2) + L7 (P6, superpuesta) = 205, más el 60 % A/X del compartido L8.
    expect(await insuredActiveMillions(`&scopeCompanyIds=${COMPANY_A}&scopeCostCenterId=${CC_X}&scopeAssetType=Cami%C3%B3n`)).toBe(212.2)
  })

  it('the policy list keeps its policy-level scope (a policy enters if one of its lines matches)', async () => {
    await request(app).get(`/api/v1/policies?includeSummary=true&scopeCompanyIds=${COMPANY_A}`).set(auth)
    const listWhere = db.policy.findMany.mock.calls[0][0].where
    const policiesInScope = [...new Set(LINES.map((l) => l.policy))].filter((p) => matches(p, listWhere)).map((p) => p.id)
    // P2 y P5 entran al listado por una línea de A aunque también tengan líneas de B.
    expect(policiesInScope).toEqual(expect.arrayContaining(['P2-dos-empresas', 'P5-bajas', 'P3-sin-activo']))
  })
})
