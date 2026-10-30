import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  computeFleetSummaries,
  computeInsuranceTypeSummaries,
  computeInsurerSummaries,
  computeProductiveUnitSummaries,
  computeCostCenterSummaries,
  topInsurersWithOther,
} from '../../src/shared/utils/insuranceDashboardCalc'
import { buildInsuranceDashboardScope } from '../../src/shared/utils/insuranceDashboardScope'
import type { Asset, Policy } from '../../src/shared/types'

// R4-B — indicadores de situación ACTUAL del Dashboard de Seguros con la
// vigencia efectiva (R4-A): una póliza futura o una línea dada de baja no
// cuentan como cobertura, no vuelven asegurado a un activo, no generan costo
// vigente ni "próximo vencimiento". El gasto histórico no cambia.

const TODAY = '2026-11-15'
const CC_X = 'cc-x'
const CC_Y = 'cc-y'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asset = (id: string, allocations: [string, string, number][] = [['co-a', CC_X, 100]]): Asset => ({
  id, internalCode: id, name: id, assetType: 'Camión', productiveUnit: 'Campo', status: 'activo',
  currentValueUsd: 10_000, patrimonialValueUsd: 10_000, patrimonialValueNewUsd: 20_000, patrimonialValueNew: 20_000,
  allocations: allocations.map(([companyId, costCenterId, percentage], i) => ({ id: `${id}-al${i}`, companyId, costCenterId, percentage })),
  companyId: allocations[0]?.[0] ?? '', costCenterId: allocations[0]?.[1] ?? '',
}) as unknown as Asset

let lineSeq = 0
function policy(
  id: string,
  startDate: string,
  endDate: string,
  status: Policy['status'],
  lines: { assetId: string | null; usd: number; type?: string; bajaDate?: string | null; effectiveDate?: string; companyId?: string }[],
  insuranceCompany = 'Aseguradora Norte',
): Policy {
  return {
    id, policyNumber: id, insuranceCompany, startDate, endDate, status, effectiveStatus: status,
    coverages: lines.map((l) => ({
      id: `L${++lineSeq}-${id}`, policyId: id, assetId: l.assetId, insuranceType: l.type ?? 'Automotor', coverageIds: [], coverages: [],
      insuredAmount: l.usd, currency: 'USD', exchangeRate: 1000, insuredAmountUsd: l.usd, insuredAmountArs: l.usd * 1000,
      effectiveDate: l.effectiveDate ?? startDate, bajaDate: l.bajaDate ?? null, companyId: l.companyId ?? null, costCenterId: null,
    })),
  } as unknown as Policy
}

const ASSET_HIST = asset('A-historico')
const ASSET_COVERED = asset('A-cubierto')
const policies = [
  // A-historico: solo antecedentes — una póliza vencida, una línea dada de baja ayer y una póliza futura.
  policy('P-vencida', '2025-01-01', '2025-12-31', 'vencida', [{ assetId: 'A-historico', usd: 9_000 }]),
  policy('P-baja-linea', '2026-01-01', '2026-12-31', 'vigente', [{ assetId: 'A-historico', usd: 8_000, bajaDate: '2026-11-14' }]),
  policy('P-futura', '2026-12-01', '2027-11-30', 'vigente', [{ assetId: 'A-historico', usd: 7_000 }], 'Aseguradora Sur'),
  // A-cubierto: dos líneas vigentes hoy en dos pólizas (casco + RC), sin deduplicar.
  policy('P1', '2026-01-01', '2026-12-31', 'proximo_vencer', [{ assetId: 'A-cubierto', usd: 1_000 }]),
  policy('P2', '2026-06-01', '2027-05-31', 'vigente', [{ assetId: 'A-cubierto', usd: 500, type: 'Responsabilidad civil' }]),
]
const fleet = (lineShare?: (id: string) => number) =>
  computeFleetSummaries([ASSET_HIST, ASSET_COVERED], policies, [], [], {}, TODAY, lineShare)

test('14. un activo con solo líneas históricas / futuras no está asegurado hoy (pero conserva su historial)', () => {
  const row = fleet().find((r) => r.assetId === 'A-historico')!
  assert.equal(row.sumaAseguradaUsd, 0)
  assert.equal(row.activePolicies.length, 0)
  assert.equal(row.costoMensualUsd, null)
  assert.equal(row.nextExpiration, null) // la futura no "vence" primero: hoy no hay cobertura
  assert.equal(row.allPolicies.length, 3) // el historial no se oculta
})

test('15. activo con varias líneas vigentes: suma ambas, ambas activas, vence primero la que termina antes', () => {
  const row = fleet().find((r) => r.assetId === 'A-cubierto')!
  assert.equal(row.sumaAseguradaUsd, 1_500)
  assert.deepEqual(row.activePolicies.map((p) => p.id).sort(), ['P1', 'P2'])
  assert.equal(row.nextExpiration?.policyId, 'P1')
  assert.notEqual(row.costoMensualUsd, undefined)
})

test('la suma asegurada por activo se prorratea con el filtro de empresa (lineShare)', () => {
  const p1Line = policies[3].coverages![0].id
  const row = fleet((id) => (id === p1Line ? 0.6 : 1)).find((r) => r.assetId === 'A-cubierto')!
  assert.equal(row.sumaAseguradaUsd, 1_000 * 0.6 + 500)
})

test('activos asegurados por unidad productiva y centro de costo: solo los cubiertos hoy', () => {
  const units = computeProductiveUnitSummaries([ASSET_HIST, ASSET_COVERED], policies, [], {}, TODAY)
  assert.equal(units.find((u) => u.label === 'Campo')?.insuredAssetCount, 1)
  assert.equal(units.find((u) => u.label === 'Campo')?.assetCount, 2)
  const costCenters = computeCostCenterSummaries([ASSET_HIST, ASSET_COVERED], policies, [], {}, new Map([[CC_X, { id: CC_X, name: 'Centro X' }]]), TODAY)
  assert.equal(costCenters.find((c) => c.label === 'Centro X')?.insuredAssetCount, 1)
})

test('tipos de seguro: pólizas vigentes, activos cubiertos y suma asegurada solo de lo vigente hoy', () => {
  const types = computeInsuranceTypeSummaries(policies, [], [], {}, new Set(), TODAY)
  const auto = types.find((t) => t.insuranceType === 'Automotor')!
  assert.equal(auto.totalPolicyCount, 4) // P-vencida, P-baja-linea, P-futura, P1
  assert.equal(auto.activePolicyCount, 1) // solo P1
  assert.equal(auto.assetsCoveredCount, 1)
  assert.equal(auto.activePremiumUsd, 1_000)
})

test('aseguradoras: una póliza futura no es cartera vigente ni cubre activos hoy', () => {
  const insurers = computeInsurerSummaries(policies, [], {}, [], {}, TODAY)
  const sur = insurers.find((i) => i.insuranceCompany === 'Aseguradora Sur')!
  assert.deepEqual([sur.activePolicyCount, sur.assetsCoveredCount, sur.primaVigenteUsd], [0, 0, 0])
  const norte = insurers.find((i) => i.insuranceCompany === 'Aseguradora Norte')!
  assert.deepEqual([norte.activePolicyCount, norte.assetsCoveredCount, norte.primaVigenteUsd], [2, 1, 1_500])
})

test('alcance por empresa: la parte de cada línea sale de las asignaciones del activo (60/40), sin inventar', () => {
  const shared = asset('A-compartido', [['co-a', CC_X, 60], ['co-b', CC_Y, 40]])
  const unallocated = asset('A-sin-asignaciones', [])
  const p = policy('P-mix', '2026-01-01', '2026-12-31', 'vigente', [
    { assetId: 'A-compartido', usd: 100 },
    { assetId: 'A-sin-asignaciones', usd: 50 },
    { assetId: null, usd: 30, companyId: 'co-a' },
    { assetId: null, usd: 20, companyId: 'co-b' },
  ])
  const [sharedLine, unallocatedLine, directA, directB] = p.coverages!.map((c) => c.id)
  const scopeA = buildInsuranceDashboardScope([shared, unallocated], [p], [], ['co-a'])
  assert.deepEqual([scopeA.lineShare(sharedLine), scopeA.lineShare(unallocatedLine), scopeA.lineShare(directA), scopeA.lineShare(directB)], [0.6, 0, 1, 0])
  const scopeBoth = buildInsuranceDashboardScope([shared, unallocated], [p], [], ['co-a', 'co-b'])
  assert.equal(scopeBoth.lineShare(sharedLine), 1)
  const global = buildInsuranceDashboardScope([shared, unallocated], [p], [], [])
  assert.equal(global.lineShare(unallocatedLine), 1) // sin filtro, el activo sin asignaciones queda en el global
  // La suma del activo compartido con filtro A coincide con su valor prorrateado (60 %): el % de cobertura no se distorsiona.
  const row = computeFleetSummaries(scopeA.assets, scopeA.policies, [], [], {}, TODAY, scopeA.lineShare).find((r) => r.assetId === 'A-compartido')!
  assert.equal(row.sumaAseguradaUsd, 60)
  assert.equal(row.valorRealUsd, 6_000)
})

test('activo sin allocations no hereda empresa/centro al filtrar y permanece en el total global', () => {
  const legacyUnallocated = {
    ...asset('A-sin-asignaciones', []),
    companyId: 'co-a',
    costCenterId: CC_X,
  }
  const policyWithUnallocatedAsset = policy('P-sin-asignaciones', '2026-01-01', '2026-12-31', 'vigente', [
    { assetId: legacyUnallocated.id, usd: 50 },
  ])
  const coverageId = policyWithUnallocatedAsset.coverages![0].id

  const companyScope = buildInsuranceDashboardScope(
    [legacyUnallocated],
    [policyWithUnallocatedAsset],
    [],
    ['co-a'],
  )
  assert.deepEqual(companyScope.assets, [])
  assert.deepEqual(companyScope.policies, [])
  assert.equal(companyScope.lineShare(coverageId), 0)

  const globalScope = buildInsuranceDashboardScope(
    [legacyUnallocated],
    [policyWithUnallocatedAsset],
    [],
    [],
  )
  assert.deepEqual(globalScope.assets.map((a) => a.id), [legacyUnallocated.id])
  assert.equal(globalScope.lineShare(coverageId), 1)
})

test('gráfico por aseguradora agrupa el excedente como Otras y reconcilia con el KPI filtrado', () => {
  const insurers = Array.from({ length: 8 }, (_, index) => ({
    insurer: `Aseguradora ${index + 1}`,
    insuredActiveArs: (8 - index) * 100,
  }))
  const filteredKpi = 3_600
  const chart = topInsurersWithOther(insurers, filteredKpi)

  assert.deepEqual(chart.slice(0, 5).map((entry) => entry.name), [
    'Aseguradora 1',
    'Aseguradora 2',
    'Aseguradora 3',
    'Aseguradora 4',
    'Aseguradora 5',
  ])
  assert.deepEqual(chart[5], { name: 'Otras', value: 600 })
  assert.equal(chart.reduce((sum, entry) => sum + entry.value, 0), filteredKpi)
})

test('gráfico por aseguradora suprime un residual negativo de un centavo por redondeo', () => {
  const chart = topInsurersWithOther(
    [
      { insurer: 'A', insuredActiveArs: 20.01 },
      { insurer: 'B', insuredActiveArs: 20 },
      { insurer: 'C', insuredActiveArs: 20 },
      { insurer: 'D', insuredActiveArs: 20 },
      { insurer: 'E', insuredActiveArs: 20 },
    ],
    100,
  )

  assert.equal(chart.some((entry) => entry.name === 'Otras'), false)
  assert.ok(chart.every((entry) => entry.value >= 0))
})

test('gráfico por aseguradora conserva como Otras un residual negativo material', () => {
  const chart = topInsurersWithOther(
    [
      { insurer: 'A', insuredActiveArs: 20.02 },
      { insurer: 'B', insuredActiveArs: 20 },
      { insurer: 'C', insuredActiveArs: 20 },
      { insurer: 'D', insuredActiveArs: 20 },
      { insurer: 'E', insuredActiveArs: 20 },
    ],
    100,
  )

  assert.deepEqual(chart[5], { name: 'Otras', value: -0.02 })
})
