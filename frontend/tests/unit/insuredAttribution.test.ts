import { test } from 'node:test'
import assert from 'node:assert/strict'
import fixture from '../../../test-fixtures/insured-attribution.json'
import {
  allocationIssueAssetLabels,
  lineAttributionShare,
  hasAllocationFilters,
  type AllocationShare,
} from '../../src/shared/utils/insuredAttribution'

// R4-B — el prorrateo del frontend calcula exactamente los mismos importes
// que el backend (mismo fixture: test-fixtures/insured-attribution.json).

type FixtureLine = (typeof fixture.lines)[number]
const C = fixture.companies as Record<string, string>
const CC = fixture.costCenters as Record<string, string>
const allocationsOf = (assetId: string | null): AllocationShare[] | undefined =>
  assetId
    ? (fixture.assets as Record<string, [string, string, number][]>)[assetId].map(([company, costCenter, percentage]) => ({
        companyId: C[company],
        costCenterId: CC[costCenter],
        percentage,
      }))
    : undefined
const lineOf = (l: FixtureLine) => ({ assetId: l.assetId, companyId: l.company ? C[l.company] : null, costCenterId: l.costCenter ? CC[l.costCenter] : null })
const cents = (n: number) => Math.round(n * 100) / 100

for (const c of fixture.cases) {
  test(`fixture compartido — ${c.name}`, () => {
    const filters = {
      companyIds: (c.filters as { companies?: string[] }).companies?.map((k) => C[k]),
      costCenterId: (c.filters as { costCenter?: string }).costCenter ? CC[(c.filters as { costCenter: string }).costCenter] : undefined,
    }
    let ars = 0
    let usd = 0
    const byInsurer: Record<string, [number, number]> = {}
    const policies = new Set<string>()
    const assets = new Set<string>()
    for (const l of fixture.lines) {
      const share = lineAttributionShare(lineOf(l), allocationsOf(l.assetId), filters)
      if (share <= 0) continue
      ars += l.ars * share
      usd += l.usd * share
      const entry = (byInsurer[l.insurer] ??= [0, 0])
      entry[0] += l.ars * share
      entry[1] += l.usd * share
      policies.add(l.policyId)
      if (l.assetId) assets.add(l.assetId)
    }
    assert.deepEqual([cents(ars), cents(usd)], [c.expected.ars, c.expected.usd])
    assert.deepEqual(Object.fromEntries(Object.entries(byInsurer).map(([k, [a, u]]) => [k, [cents(a), cents(u)]])), c.expected.byInsurer)
    assert.equal(policies.size, c.expected.policies)
    assert.equal(assets.size, c.expected.assets)
  })
}

test('ejemplo aprobado: línea de 100 M, activo 60 % A / 40 % B', () => {
  const line = { assetId: 'S', companyId: null, costCenterId: null }
  const allocations = [{ companyId: 'A', costCenterId: 'X', percentage: 60 }, { companyId: 'B', costCenterId: 'Y', percentage: 40 }]
  const amount = (filters: { companyIds?: string[]; costCenterId?: string }) => 100_000_000 * lineAttributionShare(line, allocations, filters)
  assert.equal(amount({}), 100_000_000)
  assert.equal(amount({ companyIds: ['A'] }), 60_000_000)
  assert.equal(amount({ companyIds: ['B'] }), 40_000_000)
  assert.equal(amount({ companyIds: ['A', 'B'] }), 100_000_000)
})

test('solo empresa / centro de costo prorratean', () => {
  assert.equal(hasAllocationFilters({}), false)
  assert.equal(hasAllocationFilters({ companyIds: [] }), false)
  assert.equal(hasAllocationFilters({ companyIds: ['A'] }), true)
  assert.equal(hasAllocationFilters({ costCenterId: 'X' }), true)
})

test('activo sin allocations no se atribuye por companyId heredado', () => {
  const legacyAssetLine = { assetId: 'legacy-asset', companyId: 'company-a', costCenterId: 'center-a' }
  assert.equal(lineAttributionShare(legacyAssetLine, [], { companyIds: ['company-a'] }), 0)
  assert.equal(lineAttributionShare(legacyAssetLine, [], {}), 1)
})

test('las advertencias identifican activos por código y nombre sin exponer IDs', () => {
  assert.equal(
    allocationIssueAssetLabels(['asset-1'], [{ id: 'asset-1', internalCode: 'ACT-0001', name: 'Camión de carga' }]),
    'ACT-0001 (Camión de carga)',
  )
})
