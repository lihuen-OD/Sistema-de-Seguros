import fs from 'fs'
import path from 'path'
import {
  attributeInsured,
  lineAttributionShare,
  hasAllocationFilters,
  type AllocationShare,
  type InsuredLineGroup,
} from '../insured-attribution'

// R4-B — prorrateo de la suma asegurada vigente por asignaciones. Los casos
// vienen del fixture compartido con el frontend (test-fixtures/), así los dos
// lados prueban exactamente los mismos importes.

interface FixtureLine { id: string; policyId: string; insurer: string; assetId: string | null; company: string | null; costCenter: string | null; ars: number; usd: number }
interface Fixture {
  companies: Record<string, string>
  costCenters: Record<string, string>
  assets: Record<string, [string, string, number][]>
  lines: FixtureLine[]
  cases: { name: string; filters: { companies?: string[]; costCenter?: string }; expected: {
    ars: number; usd: number; policies: number; assets: number; underAllocated: number; overAllocated: number; byInsurer: Record<string, [number, number]>
  } }[]
}

const fixture: Fixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../../test-fixtures/insured-attribution.json'), 'utf8'),
)
const C = fixture.companies
const CC = fixture.costCenters

const groups: InsuredLineGroup[] = fixture.lines.map((l) => ({
  policyId: l.policyId,
  assetId: l.assetId,
  companyId: l.company ? C[l.company] : null,
  costCenterId: l.costCenter ? CC[l.costCenter] : null,
  insuredAmountArs: l.ars,
  insuredAmountUsd: l.usd,
}))
const allocationsByAsset = new Map<string, AllocationShare[]>(
  Object.entries(fixture.assets).map(([assetId, allocations]) => [
    assetId,
    allocations.map(([company, costCenter, percentage]) => ({ companyId: C[company], costCenterId: CC[costCenter], percentage })),
  ]),
)
const insurerByPolicy = new Map(fixture.lines.map((l) => [l.policyId, l.insurer]))
const filtersOf = (f: Fixture['cases'][number]['filters']) => ({
  companyIds: f.companies?.map((k) => C[k]),
  costCenterId: f.costCenter ? CC[f.costCenter] : undefined,
})

describe('lineAttributionShare — el ejemplo aprobado (línea de 100 M, activo 60 % A / 40 % B)', () => {
  const line = { assetId: 'S', companyId: null, costCenterId: null }
  const allocations = [
    { companyId: 'A', costCenterId: 'X', percentage: 60 },
    { companyId: 'B', costCenterId: 'Y', percentage: 40 },
  ]
  const amount = (filters: { companyIds?: string[]; costCenterId?: string }) => 100_000_000 * lineAttributionShare(line, allocations, filters)

  it('global without filters: 100 M (contractual amount, no proration)', () => expect(amount({})).toBe(100_000_000))
  it('company A: 60 M', () => expect(amount({ companyIds: ['A'] })).toBe(60_000_000))
  it('company B: 40 M', () => expect(amount({ companyIds: ['B'] })).toBe(40_000_000))
  it('both companies: 100 M, never 200 M', () => expect(amount({ companyIds: ['A', 'B'] })).toBe(100_000_000))
  it('company + cost center: only allocations that satisfy both', () => {
    expect(amount({ companyIds: ['A'], costCenterId: 'X' })).toBe(60_000_000)
    expect(amount({ companyIds: ['A'], costCenterId: 'Y' })).toBe(0)
  })
  it('percentages are stored as 0-100 (60 = 60 %), not as 0.6', () => {
    expect(lineAttributionShare(line, allocations, { companyIds: ['A'] })).toBe(0.6)
  })
})

describe('lineAttributionShare — bordes', () => {
  it('a line without an asset keeps its direct company / cost center attribution', () => {
    const line = { assetId: null, companyId: 'A', costCenterId: 'X' }
    expect(lineAttributionShare(line, undefined, { companyIds: ['A'] })).toBe(1)
    expect(lineAttributionShare(line, undefined, { companyIds: ['B'] })).toBe(0)
    expect(lineAttributionShare(line, undefined, { costCenterId: 'Y' })).toBe(0)
  })
  it('an asset without allocations is never assigned to a company', () => {
    expect(lineAttributionShare({ assetId: 'U', companyId: null, costCenterId: null }, [], { companyIds: ['A'] })).toBe(0)
    expect(lineAttributionShare({ assetId: 'U', companyId: null, costCenterId: null }, undefined, {})).toBe(1)
  })
  it('incomplete percentages are not normalized (50 % stays 50 %)', () => {
    expect(lineAttributionShare({ assetId: 'P', companyId: null, costCenterId: null }, [{ companyId: 'A', costCenterId: 'X', percentage: 50 }], { companyIds: ['A'] })).toBe(0.5)
  })
  it('matching percentages over 100 % (invalid duplicated data) are capped at the contracted amount', () => {
    const duplicated = [{ companyId: 'A', costCenterId: 'X', percentage: 80 }, { companyId: 'A', costCenterId: 'X', percentage: 40 }]
    expect(lineAttributionShare({ assetId: 'O', companyId: null, costCenterId: null }, duplicated, { companyIds: ['A'] })).toBe(1)
  })
  it('only company / cost center filters prorate (asset type is a line filter, not an allocation)', () => {
    expect(hasAllocationFilters({})).toBe(false)
    expect(hasAllocationFilters({ companyIds: [] })).toBe(false)
    expect(hasAllocationFilters({ companyIds: ['A'] })).toBe(true)
    expect(hasAllocationFilters({ costCenterId: 'X' })).toBe(true)
  })
})

describe('attributeInsured — fixture compartido backend/frontend', () => {
  it.each(fixture.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = attributeInsured(groups, allocationsByAsset, filtersOf(c.filters), insurerByPolicy)

    // ARS y USD por separado, nunca convertidos entre sí.
    expect([result.insuredActiveArs, result.insuredActiveUsd]).toEqual([c.expected.ars, c.expected.usd])
    expect(result.activeCoveragePolicyCount).toBe(c.expected.policies)
    expect(result.insuredAssetCount).toBe(c.expected.assets)
    expect(result.allocationIssues).toEqual({ underAllocatedAssets: c.expected.underAllocated, overAllocatedAssets: c.expected.overAllocated })
    expect(Object.fromEntries(result.byInsurer.map((i) => [i.insurer, [i.insuredActiveArs, i.insuredActiveUsd]]))).toEqual(c.expected.byInsurer)
    expect(result.attributed).toBe(Object.keys(c.filters).length > 0)
  })

  it('the chart by insurer always adds up to the KPI (same scope, same proration)', () => {
    for (const c of fixture.cases) {
      const result = attributeInsured(groups, allocationsByAsset, filtersOf(c.filters), insurerByPolicy)
      const sum = (pick: (i: (typeof result.byInsurer)[number]) => number) => Math.round(result.byInsurer.reduce((s, i) => s + pick(i), 0) * 100) / 100
      expect([sum((i) => i.insuredActiveArs), sum((i) => i.insuredActiveUsd)]).toEqual([result.insuredActiveArs, result.insuredActiveUsd])
    }
  })

  it('an asset with several in-force lines counts once as an insured asset, and each line adds its own amount', () => {
    const result = attributeInsured(groups.filter((g) => g.assetId === 'S-compartido-A60-B40'), allocationsByAsset, {}, insurerByPolicy)
    expect(result.insuredAssetCount).toBe(1)
    expect(result.insuredActiveArs).toBe(102_000_000)
  })

  it('reports the affected asset id for a filtered under-allocated line', () => {
    const result = attributeInsured(
      [{
        policyId: 'P-incomplete',
        assetId: 'asset-incomplete',
        companyId: null,
        costCenterId: null,
        insuredAmountArs: 100,
        insuredAmountUsd: 0,
      }],
      new Map([['asset-incomplete', [{ companyId: 'company-a', costCenterId: 'center-a', percentage: 50 }]]]),
      { companyIds: ['company-a'] },
      new Map([['P-incomplete', 'Insurer']]),
    )

    expect(result.insuredActiveArs).toBe(50)
    expect(result.insuredAssetCount).toBe(1)
    expect(result.allocationIssues).toEqual({ underAllocatedAssets: 1, overAllocatedAssets: 0 })
    expect(result.allocationIssueAssetIds).toEqual({ underAllocated: ['asset-incomplete'], overAllocated: [] })
  })

  it('without filters the global never duplicates a line and the result is the plain contractual sum', () => {
    const result = attributeInsured(groups, allocationsByAsset, {}, insurerByPolicy)
    expect(result.insuredActiveArs).toBe(fixture.lines.reduce((s, l) => s + l.ars, 0))
    expect(result.insuredActiveUsd).toBe(fixture.lines.reduce((s, l) => s + l.usd, 0))
  })

  it('rounds to cents without drifting (USD lines with decimals)', () => {
    const result = attributeInsured(
      [{ policyId: 'P', assetId: 'S', companyId: null, costCenterId: null, insuredAmountArs: 1000, insuredAmountUsd: 333.333333 }],
      new Map([['S', [{ companyId: 'A', costCenterId: 'X', percentage: 33.33 }]]]),
      { companyIds: ['A'] },
    )
    expect([result.insuredActiveArs, result.insuredActiveUsd]).toEqual([333.3, 111.1])
  })
})
