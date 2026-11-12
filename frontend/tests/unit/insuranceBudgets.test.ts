import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  distributeAnnualAmount,
  monthsToOverwrite,
  parseBudgetAmount,
  sumMonthAmounts,
} from '../../src/shared/utils/budgetDistribution'
import {
  allocationPercentIssues,
  assetAttribution,
  contextAttribution,
  type BudgetLevel,
} from '../../src/shared/utils/budgetAttribution'
import {
  aggregateRows,
  budgetStatus,
  buildFundsSeries,
  computeBudgetComparison,
  deviationEstimateOrNull,
  deviationRealOrNull,
  estimatePercent,
  filterBudgetRows,
  isIncomplete,
  realFinancial,
  syntheticTotals,
  type BudgetComparisonInput,
  type BudgetLineInput,
  type BudgetRow,
} from '../../src/shared/utils/budgetComparisonCalc'
import { reconcileEconomic, reconcileFinancial } from '../../src/shared/utils/budgetReconciliation'
import {
  buildProjectionAssetInputs,
  buildRenewalProjectionRows,
  type RenewalProjectionRowData,
} from '../../src/shared/utils/renewalProjectionRows'
import {
  NO_ASSET_LINE_ROW_ID,
  NO_FIXED_ASSET_ROW_ID,
} from '../../src/shared/utils/fixedAssetGrouping'
import { NO_COMPANY_ROW_ID, UNASSIGNED_ROW_ID, type AllocationContext } from '../../src/shared/utils/analysisGrouping'
import type { DocumentForFinancial } from '../../src/shared/api/documents.api'
import type { Asset, BienDeUso, Company, CostCenter, Installment, Policy } from '../../src/shared/types'

// Presupuestos de Seguros (plan A–J rev. 2): distribución, imputación por
// nivel con prorrateo, los 7 conceptos sin doble conteo, USD no confiable,
// «nada desaparece», filtros, fondos y conciliación con los Análisis.

function close(actual: number | null | undefined, expected: number, msg?: string) {
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-6, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
}

// ── Distribución anual ──────────────────────────────────────────────────────

describe('distribución anual y montos mensuales', () => {
  test('1200 en año calendario → 12 × 100', () => {
    const d = distributeAnnualAmount(1200, '2026-01')
    assert.equal(d.length, 12)
    assert.equal(d[0].month, '2026-01')
    assert.equal(d[11].month, '2026-12')
    assert.ok(d.every((m) => m.amountUsd === 100))
  })

  test('ejercicio julio–junio que cruza años; el resto de centavos va al último mes y Σ = total exacto', () => {
    const d = distributeAnnualAmount(1000.05, '2025-07')
    assert.equal(d[0].month, '2025-07')
    assert.equal(d[11].month, '2026-06')
    assert.ok(d.slice(0, 11).every((m) => m.amountUsd === 83.33))
    assert.equal(d[11].amountUsd, 83.42)
    assert.equal(sumMonthAmounts(d.map((m) => m.amountUsd)), 1000.05)
  })

  test('0 → 12 meses con presupuesto CERO (no vacíos)', () => {
    const d = distributeAnnualAmount(0, '2026-01')
    assert.equal(d.length, 12)
    assert.ok(d.every((m) => m.amountUsd === 0))
  })

  test('negativo o no numérico se rechaza', () => {
    assert.throws(() => distributeAnnualAmount(-1, '2026-01'))
    assert.throws(() => distributeAnnualAmount(Number.NaN, '2026-01'))
  })

  test('meses a sobrescribir: solo los guardados (incluido 0) con valor distinto', () => {
    const next = distributeAnnualAmount(1200, '2026-01')
    const stored = new Map([['2026-01', 100], ['2026-02', 0], ['2026-03', 250]])
    assert.deepEqual(monthsToOverwrite(next, stored), [
      { month: '2026-02', previous: 0, next: 100 },
      { month: '2026-03', previous: 250, next: 100 },
    ])
  })

  test('input: vacío = sin presupuesto, 0 = presupuesto cero, inválidos rechazados', () => {
    assert.deepEqual(parseBudgetAmount(''), { kind: 'empty' })
    assert.deepEqual(parseBudgetAmount(' 0 '), { kind: 'value', amountUsd: 0 })
    assert.deepEqual(parseBudgetAmount('1500.5'), { kind: 'value', amountUsd: 1500.5 })
    assert.equal(parseBudgetAmount('-1').kind, 'invalid')
    assert.equal(parseBudgetAmount('1.234').kind, 'invalid')
    assert.equal(parseBudgetAmount('abc').kind, 'invalid')
  })

  test('Σ de meses ignora los vacíos y es exacta al centavo', () => {
    assert.equal(sumMonthAmounts([0.1, 0.2, null, undefined, 0.3]), 0.6)
  })
})

// ── Fixture compartido ──────────────────────────────────────────────────────

const RATE = 1000
const companies = [
  { id: 'c1', name: 'Empresa 1', status: 'activo' },
  { id: 'c2', name: 'Empresa 2', status: 'activo' },
] as unknown as Company[]
const costCenters = [
  { id: 'cc1', name: 'CC 1', description: '', status: 'activo' },
  { id: 'cc2', name: 'CC 2', description: '', status: 'activo' },
] as unknown as CostCenter[]
const fixedAssets = [
  { id: 'fa1', code: 'BU-1', name: 'Planta', description: '', status: 'activo' },
  { id: 'fa9', code: 'BU-9', name: 'Bien sin activos', description: '', status: 'activo' },
] as unknown as BienDeUso[]

function asset(id: string, allocations: { companyId: string; costCenterId: string; percentage: number }[], fixedAssetId: string | null): Asset {
  return {
    id, name: `Activo ${id}`, internalCode: id.toUpperCase(), assetType: 'vehiculo', status: 'activo',
    // Los Análisis usan la PRIMERA asignación (companyId/costCenterId del activo).
    companyId: allocations[0]?.companyId ?? '', costCenterId: allocations[0]?.costCenterId ?? '',
    fixedAssetId, fixedAsset: fixedAssetId ? { id: fixedAssetId, code: 'BU-1', name: 'Planta' } : null,
    allocations: allocations.map((a, i) => ({ id: `${id}-al${i}`, ...a })),
  } as unknown as Asset
}

// a1: 60 % c1/cc1 + 40 % c2/cc2, bien de uso fa1. a2: solo 50 % a c2 (dato viejo: el resto va a «Sin asignar»).
const assets = [
  asset('a1', [{ companyId: 'c1', costCenterId: 'cc1', percentage: 60 }, { companyId: 'c2', costCenterId: 'cc2', percentage: 40 }], 'fa1'),
  asset('a2', [{ companyId: 'c2', costCenterId: 'cc2', percentage: 50 }], null),
]
const policies = [
  { id: 'P1', policyNumber: 'P-1', insuranceCompany: 'Aseg', status: 'vigente', insuranceTypeNames: [], coverages: [{ id: 'cov-a1', assetId: 'a1' }, { id: 'cov-a2', assetId: 'a2' }, { id: 'cov-rc', assetId: null, companyId: 'c1', costCenterId: 'cc1' }] },
] as unknown as Policy[]

let seq = 0
function inst(dueDate: string, amount: number, opts: { paid?: boolean; currency?: 'USD' | 'ARS'; amountUsd?: number } = {}): Installment {
  seq += 1
  const currency = opts.currency ?? 'USD'
  return {
    id: `i-${seq}`, accountingDocumentId: '', installmentNumber: seq, dueDate, amount, currency,
    amountArs: currency === 'ARS' ? amount : amount * RATE,
    amountUsd: opts.amountUsd ?? (currency === 'USD' ? amount : amount / RATE),
    paymentStatus: opts.paid ? 'PAID' : 'PENDING', paidAt: null, paymentMethod: null,
  } as Installment
}

interface DocIn {
  number: string; type?: string; status?: string; issueDate: string; total: number
  currency?: 'USD' | 'ARS'; totalUsd?: number
  alloc?: { assetId: string | null; pct: number; amount: number }[]
  installments?: Installment[]; sign?: string; applied?: { count: number; ars: number; usd: number }
}
function doc(d: DocIn): DocumentForFinancial {
  const id = `d-${d.number}`
  const currency = d.currency ?? 'USD'
  return {
    id, documentNumber: d.number, documentType: d.type ?? 'INVOICE', documentStatus: d.status ?? 'ISSUED', issueDate: d.issueDate,
    currency, exchangeRate: RATE, netAmount: d.total, vatAmount: 0, otherTaxesAmount: 0, totalAmount: d.total,
    totalAmountArs: currency === 'ARS' ? d.total : d.total * RATE,
    totalAmountUsd: d.totalUsd ?? (currency === 'USD' ? d.total : d.total / RATE),
    adjustmentSign: d.sign ?? null, economicImpactType: null, paymentMethod: 'Transferencia',
    installments: (d.installments ?? []).map((i) => ({ ...i, accountingDocumentId: id })),
    allocations: (d.alloc ?? []).map((a, k) => ({
      id: `${id}-al${k}`, accountingDocumentId: id, policyId: 'P1', assetId: a.assetId,
      policyAssetCoverageId: a.assetId ? `cov-${a.assetId}` : 'cov-rc', allocatedAmount: a.amount, allocationPercentage: a.pct,
    })),
    appliedAdjustment: d.applied ?? { count: 0, ars: 0, usd: 0 },
  } as unknown as DocumentForFinancial
}

const FROM = '2026-01'
const TO = '2026-06'
const NOW = '2026-04'

const documents: DocumentForFinancial[] = [
  // Línea de cobertura SIN activo (empresa/CC de la línea): real pero nunca proyección.
  doc({ number: 'INV-RC', issueDate: '2026-02-15', total: 300, alloc: [{ assetId: null, pct: 100, amount: 300 }], installments: [inst('2026-02-28', 300)] }),
  // a1, repartido por sus asignaciones (60/40).
  doc({ number: 'INV-A1', issueDate: '2026-03-10', total: 1000, alloc: [{ assetId: 'a1', pct: 100, amount: 1000 }],
    installments: [inst('2026-03-31', 500, { paid: true }), inst('2026-04-30', 500)] }),
  // Cierre USD NO confiable (ARS con TC 1): se excluye de Real económico y financiero.
  doc({ number: 'BAD-FX', issueDate: '2026-03-20', total: 500_000, currency: 'ARS', totalUsd: 500_000, alloc: [{ assetId: 'a1', pct: 100, amount: 500_000 }],
    installments: [inst('2026-03-31', 500_000, { currency: 'ARS', amountUsd: 500_000 })] }),
  // NC aplicada: resta. NC emitida (no aplicada): 0. Factura anulada: 0.
  doc({ number: 'NC-APP', type: 'CREDIT_NOTE', status: 'APPLIED', issueDate: '2026-04-20', total: 100, alloc: [{ assetId: 'a1', pct: 100, amount: -100 }] }),
  doc({ number: 'NC-ISS', type: 'CREDIT_NOTE', status: 'ISSUED', issueDate: '2026-04-21', total: 50, alloc: [{ assetId: 'a1', pct: 100, amount: -50 }] }),
  doc({ number: 'INV-ANUL', status: 'CANCELLED', issueDate: '2026-03-01', total: 999, alloc: [{ assetId: 'a1', pct: 100, amount: 999 }] }),
  // a2 (solo 50 % asignado a c2).
  doc({ number: 'INV-A2', issueDate: '2026-04-05', total: 200, alloc: [{ assetId: 'a2', pct: 100, amount: 200 }], installments: [inst('2026-04-30', 200)] }),
  // ND aplicada, ya volcada en su factura y con cuota propia → la cuota propia se excluye en Financiero; en Económico suma (sin asignar).
  doc({ number: 'ND01', type: 'DEBIT_NOTE', status: 'APPLIED', issueDate: '2026-04-18', total: 20, installments: [inst('2026-04-20', 20, { paid: true })], applied: { count: 1, ars: 20_000, usd: 20 } }),
  // Ajuste negativo aplicado sin asignaciones → «Sin asignar».
  doc({ number: 'ADJ', type: 'ADJUSTMENT_ENTRY', status: 'APPLIED', sign: 'NEGATIVE', issueDate: '2026-05-02', total: 10 }),
  // Fuera de rango.
  doc({ number: 'INV-OLD', issueDate: '2025-12-15', total: 7000, alloc: [{ assetId: 'a1', pct: 100, amount: 7000 }] }),
]

function projRow(assetId: string, cells: [string, number][], opts: { blocked?: boolean; hasReal?: boolean } = {}): RenewalProjectionRowData {
  return {
    assetId, name: `Activo ${assetId}`, projectionBlocked: opts.blocked ?? false,
    realTimeline: new Map(opts.hasReal ? [['2026-01', {}]] : []),
    projectedByMonth: new Map(cells.map(([monthKey, amountUsd]) => [monthKey, { monthKey, amountUsd }])),
  } as unknown as RenewalProjectionRowData
}
// Proyección ECONOMIC de a1: abril (mes actual) 300, junio 400, agosto (fuera de rango), y un valor
// en febrero (PASADO) que nunca debe sumarse. a2 bloqueada (sin base USD confiable) con historia.
const economicProjectionRows = [
  projRow('a1', [['2026-02', 999], ['2026-04', 300], ['2026-06', 400], ['2026-08', 999]]),
  projRow('a2', [], { blocked: true, hasReal: true }),
]
const financialProjectionRows = [projRow('a1', [['2026-05', 250]])]

function input(level: BudgetLevel, budgets: BudgetLineInput[] = []): BudgetComparisonInput {
  return {
    level, from: FROM, to: TO, currentMonth: NOW, documents, policies, assets, companies, costCenters, fixedAssets,
    economicProjectionRows, financialProjectionRows, budgets,
  }
}

const companyBudgets: BudgetLineInput[] = [
  // c1: enero = presupuesto CERO, junio SIN presupuesto.
  { scopeType: 'COMPANY', scopeId: 'c1', months: [
    { month: '2026-01', amountUsd: 0 }, { month: '2026-02', amountUsd: 100 }, { month: '2026-03', amountUsd: 500 },
    { month: '2026-04', amountUsd: 400 }, { month: '2026-05', amountUsd: 200 },
  ] },
  // c2: solo marzo, presupuesto 0 con real > 0 → excedido, % n/a.
  { scopeType: 'COMPANY', scopeId: 'c2', months: [{ month: '2026-03', amountUsd: 0 }] },
]

const byId = (rows: BudgetRow[], id: string) => {
  const row = rows.find((r) => r.id === id)
  assert.ok(row, `fila ${id}`)
  return row
}
const cell = (row: BudgetRow, month: string) => row.months.find((m) => m.month === month)!

// ── Imputación ──────────────────────────────────────────────────────────────

describe('imputación por nivel (prorrateo por %)', () => {
  const assetById = new Map(assets.map((a) => [a.id, a]))

  test('Empresa / Centro de costo: un activo se prorratea por sus asignaciones', () => {
    assert.deepEqual(assetAttribution('COMPANY', 'a1', assetById.get('a1')), [{ rowId: 'c1', weight: 0.6 }, { rowId: 'c2', weight: 0.4 }])
    assert.deepEqual(assetAttribution('COST_CENTER', 'a1', assetById.get('a1')), [{ rowId: 'cc1', weight: 0.6 }, { rowId: 'cc2', weight: 0.4 }])
  })

  test('% que no suman 100: el resto va a «Sin asignar» (los pesos siempre suman 1)', () => {
    const shares = assetAttribution('COMPANY', 'a2', assetById.get('a2'))
    assert.deepEqual(shares, [{ rowId: 'c2', weight: 0.5 }, { rowId: UNASSIGNED_ROW_ID, weight: 0.5 }])
  })

  test('% por encima de 100 (dato inválido): se normaliza para no duplicar', () => {
    const over = asset('ax', [{ companyId: 'c1', costCenterId: 'cc1', percentage: 100 }, { companyId: 'c2', costCenterId: 'cc2', percentage: 100 }], null)
    const shares = assetAttribution('COMPANY', 'ax', over)
    close(shares.reduce((s, x) => s + x.weight, 0), 1)
    assert.deepEqual(shares.map((s) => s.rowId), ['c1', 'c2'])
  })

  test('activo sin asignaciones → «Sin empresa»; bien de uso y activo sin prorrateo', () => {
    const bare = asset('ab', [], null)
    assert.deepEqual(assetAttribution('COMPANY', 'ab', bare), [{ rowId: NO_COMPANY_ROW_ID, weight: 1 }])
    assert.deepEqual(assetAttribution('FIXED_ASSET', 'a1', assetById.get('a1')), [{ rowId: 'fa1', weight: 1 }])
    assert.deepEqual(assetAttribution('FIXED_ASSET', 'a2', assetById.get('a2')), [{ rowId: NO_FIXED_ASSET_ROW_ID, weight: 1 }])
    assert.deepEqual(assetAttribution('ASSET', 'a1', assetById.get('a1')), [{ rowId: 'a1', weight: 1 }])
  })

  test('línea de cobertura sin activo: empresa/CC de la línea; en Activo/Bien de uso → «Líneas sin activo»', () => {
    const ctx = { assetId: null, companyId: 'c1', costCenterId: 'cc1', fixedAssetRowId: NO_ASSET_LINE_ROW_ID } as AllocationContext
    assert.deepEqual(contextAttribution('COMPANY', ctx, assetById), [{ rowId: 'c1', weight: 1 }])
    assert.deepEqual(contextAttribution('COST_CENTER', ctx, assetById), [{ rowId: 'cc1', weight: 1 }])
    assert.deepEqual(contextAttribution('ASSET', ctx, assetById), [{ rowId: NO_ASSET_LINE_ROW_ID, weight: 1 }])
    assert.deepEqual(contextAttribution('FIXED_ASSET', ctx, assetById), [{ rowId: NO_ASSET_LINE_ROW_ID, weight: 1 }])
  })

  test('activos con % ≠ 100 se informan', () => {
    assert.deepEqual(allocationPercentIssues(assets), [{ assetId: 'a2', assetName: 'Activo a2', totalPercent: 50 }])
  })
})

// ── Comparación: los 7 conceptos ────────────────────────────────────────────

describe('comparación por empresa (7 conceptos, sin doble conteo)', () => {
  const result = computeBudgetComparison(input('COMPANY', companyBudgets))
  const c1 = byId(result.rows, 'c1')
  const c2 = byId(result.rows, 'c2')
  const unassigned = byId(result.rows, UNASSIGNED_ROW_ID)

  test('Real económico: issueDate, signo económico, prorrateo 60/40, USD confiable', () => {
    close(cell(c1, '2026-02').realEconomic, 300, 'línea sin activo → c1')
    close(cell(c1, '2026-03').realEconomic, 600)
    close(cell(c2, '2026-03').realEconomic, 400)
    close(cell(c1, '2026-04').realEconomic, -60, 'NC aplicada resta (prorrateada)')
    close(cell(c2, '2026-04').realEconomic, -40 + 100, 'NC + a2 al 50 %')
    close(cell(unassigned, '2026-04').realEconomic, 100 + 20, 'resto de a2 + ND sin asignar')
    close(cell(unassigned, '2026-05').realEconomic, -10, 'ajuste negativo')
  })

  test('mes sin presupuesto ≠ presupuesto 0', () => {
    const jan = cell(c1, '2026-01')
    assert.equal(jan.budgetDefined, 1)
    close(jan.budget, 0)
    assert.equal(budgetStatus(jan), 'within')
    assert.equal(estimatePercent(jan), null, '% n/a con presupuesto 0')
    const jun = cell(c1, '2026-06')
    assert.equal(jun.budgetDefined, 0)
    assert.equal(budgetStatus(jun), 'no_budget')
    assert.equal(deviationEstimateOrNull(jun), null)
    assert.equal(deviationRealOrNull(jun), null)
  })

  test('presupuesto 0 con real > 0 → excedido y % n/a', () => {
    const mar = cell(c2, '2026-03')
    assert.equal(budgetStatus(mar), 'over')
    assert.equal(estimatePercent(mar), null)
    close(deviationEstimateOrNull(mar), 400)
  })

  test('Estimado = Real económico + Proyección; Real financiero nunca entra en el costo', () => {
    const apr = cell(c1, '2026-04')
    close(apr.projection, 180, 'proyección a1 abril × 60 %')
    close(apr.estimate, -60 + 180)
    close(realFinancial(apr), 300, 'vencimiento de abril (referencia)')
    close(cell(c1, '2026-06').estimate, 240, 'junio solo proyectado')
    close(c1.totals.estimate, c1.totals.realEconomic + c1.totals.projection)
  })

  test('nada proyectado en meses pasados ni fuera de rango', () => {
    close(cell(c1, '2026-02').projection, 0)
    close(result.levelTotals.totals.projection, 300 + 400, 'abril + junio de a1 (febrero y agosto ignorados)')
  })

  test('desvío real solo en meses transcurridos; desvío estimado en todos los meses con presupuesto', () => {
    assert.equal(deviationRealOrNull(cell(c1, '2026-05')), null, 'mayo no transcurrió')
    close(deviationRealOrNull(cell(c1, '2026-02')), 200)
    close(deviationRealOrNull(cell(c1, '2026-04')), -460)
    close(deviationEstimateOrNull(cell(c1, '2026-05')), -200)
    assert.equal(c1.totals.deviationRealCells, 4, 'ene–abr')
    close(c1.totals.deviationReal, 0 + 200 + 100 - 460)
    close(c1.totals.deviationEstimate, 0 + 200 + 100 - 280 - 200)
    close(c1.totals.deviationEstimate, c1.totals.estimateBudgeted - c1.totals.budget, 'desvío = estimado presupuestado − presupuesto')
    close(estimatePercent(c1.totals), 1020 / 1200)
    assert.equal(budgetStatus(c1.totals), 'within')
  })

  test('el real de meses sin presupuesto se informa aparte y no entra en el desvío', () => {
    close(c2.totals.realWithoutBudget, 60, 'abril de c2 (solo marzo presupuestado)')
    close(c2.totals.deviationEstimate, 400)
  })

  test('cierre USD no confiable: excluido, listado y marcado incompleto', () => {
    assert.deepEqual(result.excludedEconomic.map((e) => e.documentNumber), ['BAD-FX'])
    assert.deepEqual(result.excludedFinancial.map((e) => e.documentNumber), ['BAD-FX'])
    assert.ok(isIncomplete(cell(c1, '2026-03')))
    assert.ok(isIncomplete(cell(c2, '2026-03')))
    assert.ok(!isIncomplete(cell(c1, '2026-02')))
    assert.ok(isIncomplete(c1.totals))
    assert.ok(isIncomplete(result.levelTotals.totals))
    assert.ok(result.levelTotals.totals.realEconomic < 10_000, 'el importe con TC 1 nunca se suma')
  })

  test('Real financiero: cuotas por vencimiento, pagado/pendiente, ND ya volcada excluida', () => {
    close(cell(c1, '2026-03').realFinancialPaid, 300)
    close(cell(c1, '2026-04').realFinancialPending, 300)
    close(cell(c2, '2026-04').realFinancialPending, 200 + 100)
    close(cell(c1, '2026-02').realFinancialPending, 300)
    assert.deepEqual(result.adjustmentIssues.map((i) => [i.documentNumber, i.excluded]), [['ND01', true]])
    close(realFinancial(result.levelTotals.totals), 300 + 500 + 500 + 200)
  })

  test('nada desaparece: Σ filas (con «Sin asignar») = total del período', () => {
    close(result.levelTotals.totals.realEconomic, 300 + 1000 - 100 + 200 + 20 - 10)
    close(result.rows.reduce((s, r) => s + r.totals.realEconomic, 0), result.levelTotals.totals.realEconomic)
  })

  test('observaciones de proyección y líneas sin activo', () => {
    assert.deepEqual(result.projectionBlocked, [{ assetId: 'a2', name: 'Activo a2' }])
    close(result.linesWithoutAssetRealUsd, 300)
  })
})

describe('niveles independientes', () => {
  test('mezclar presupuestos de otro nivel se rechaza', () => {
    assert.throws(() => computeBudgetComparison(input('COMPANY', [{ scopeType: 'ASSET', scopeId: 'a1', months: [] }])), /nivel/)
  })

  test('cada nivel reparte el MISMO total del período sin sumar presupuestos de otros niveles', () => {
    const levels: BudgetLevel[] = ['COMPANY', 'COST_CENTER', 'FIXED_ASSET', 'ASSET']
    const expected = 300 + 1000 - 100 + 200 + 20 - 10
    for (const level of levels) {
      const r = computeBudgetComparison(input(level))
      close(r.rows.reduce((s, row) => s + row.totals.realEconomic, 0), expected, `real ${level}`)
      close(r.rows.reduce((s, row) => s + realFinancial(row.totals), 0), 1500, `financiero ${level}`)
      close(r.levelTotals.totals.projection, 700, `proyección ${level}`)
      close(r.levelTotals.totals.budget, 0, `sin presupuestos de este nivel (${level})`)
    }
    const assetLevel = computeBudgetComparison(input('ASSET', [{ scopeType: 'ASSET', scopeId: 'a1', months: [{ month: '2026-03', amountUsd: 5000 }] }]))
    const companyLevel = computeBudgetComparison(input('COMPANY', companyBudgets))
    close(assetLevel.levelTotals.totals.budget, 5000)
    close(companyLevel.levelTotals.totals.budget, 1200, 'el presupuesto del activo no se suma a la empresa')
  })

  test('bien de uso del catálogo sin activos se nombra desde el catálogo', () => {
    const r = computeBudgetComparison(input('FIXED_ASSET', [{ scopeType: 'FIXED_ASSET', scopeId: 'fa9', months: [{ month: '2026-01', amountUsd: 10 }] }]))
    assert.equal(byId(r.rows, 'fa9').label, 'Bien sin activos')
    assert.ok(byId(r.rows, 'fa9').hasBudgetLine)
  })
})

// ── Filtros, fondos ─────────────────────────────────────────────────────────

describe('filtros y fondos', () => {
  const result = computeBudgetComparison(input('COMPANY', companyBudgets))

  test('un filtro oculta filas sin cambiar importes; «Sin asignar» sigue en el total del nivel', () => {
    const visible = filterBudgetRows(result.rows, 'COMPANY', { entityIds: ['c1'] }, assets)
    assert.deepEqual(visible.map((r) => r.id), ['c1'])
    close(visible[0].totals.realEconomic, byId(result.rows, 'c1').totals.realEconomic)
    close(syntheticTotals(result.rows, result.months, NOW).realEconomic, 110)
    close(result.levelTotals.totals.realEconomic, aggregateRows(visible, result.months, NOW).totals.realEconomic + 460 + 110)
  })

  test('nivel Activo: filtros por empresa / bien de uso por pertenencia', () => {
    const r = computeBudgetComparison(input('ASSET'))
    assert.deepEqual(filterBudgetRows(r.rows, 'ASSET', { entityIds: [], companyIds: ['c2'] }, assets).map((x) => x.id).sort(), ['a1', 'a2'])
    assert.deepEqual(filterBudgetRows(r.rows, 'ASSET', { entityIds: [], fixedAssetIds: ['fa1'] }, assets).map((x) => x.id), ['a1'])
  })

  test('regresión: los agregados conservan la clave de mes y la cantidad de meses', () => {
    assert.deepEqual(result.levelTotals.months.map((m) => m.month), result.months)
    assert.equal(result.levelTotals.totals.monthCount, 6)
    assert.equal(byId(result.rows, 'c1').totals.monthCount, 6)
    const agg = aggregateRows(result.rows, result.months, NOW)
    assert.deepEqual(agg.months.map((m) => m.month), result.months)
    assert.deepEqual(agg.months.map((m) => m.isElapsed), [true, true, true, true, false, false])
    assert.deepEqual(buildFundsSeries(agg.months).map((p) => p.month), result.months)
  })

  test('flujo de fondos acumulado: presupuesto vs vencimientos + proyección financiera', () => {
    const series = buildFundsSeries(result.levelTotals.months)
    assert.deepEqual(series.map((p) => p.need), [0, 300, 500, 700, 250, 0])
    close(series.at(-1)!.cumulativeBudget, 1200)
    close(series.at(-1)!.cumulativeNeed, 1750)
    close(series.at(-1)!.fundsDifference, -550)
    assert.ok(series[2].incomplete, 'marzo excluye la cuota con TC 1')
  })

  test('la sección de fondos no alimenta el costo: Estimado no cambia con la proyección financiera', () => {
    const without = computeBudgetComparison({ ...input('COMPANY', companyBudgets), financialProjectionRows: [] })
    close(without.levelTotals.totals.estimate, result.levelTotals.totals.estimate)
  })
})

// ── Conciliación ────────────────────────────────────────────────────────────

describe('conciliación con los Análisis actuales', () => {
  test('Económico por empresa: Análisis + cierre + prorrateo = Presupuestos; prorrateo suma 0', () => {
    const level: BudgetLevel = 'COMPANY'
    const r = computeBudgetComparison(input(level))
    const rec = reconcileEconomic({ level, from: FROM, to: TO, documents, policies, assets, rows: r.rows })
    const line = (id: string) => rec.lines.find((l) => l.rowId === id)!
    // El Análisis imputa a1 entero a c1 (primera asignación) e incluye BAD-FX con TC 1.
    close(line('c1').accordingToAnalysis, 300 + 1000 + 500_000 - 100)
    close(line('c1').closureAdjustment, -500_000)
    close(line('c1').prorationAdjustment, 840 - 1200)
    close(line('c2').prorationAdjustment, 460 - 200)
    close(line(UNASSIGNED_ROW_ID).prorationAdjustment, 100)
    close(rec.total.prorationAdjustment, 0)
    for (const l of rec.lines) close(l.accordingToAnalysis + l.closureAdjustment + l.prorationAdjustment, l.budgetModule, l.label)
    assert.equal(rec.mismatch, false)
    assert.ok(rec.prorationApplies)
  })

  test('Activo y Bien de uso: el prorrateo no aplica (cada fila ≈ 0)', () => {
    for (const level of ['ASSET', 'FIXED_ASSET'] as BudgetLevel[]) {
      const r = computeBudgetComparison(input(level))
      const rec = reconcileEconomic({ level, from: FROM, to: TO, documents, policies, assets, rows: r.rows })
      assert.equal(rec.prorationApplies, false)
      assert.ok(rec.lines.every((l) => Math.abs(l.prorationAdjustment) < 1e-6), level)
      assert.equal(rec.mismatch, false)
    }
  })

  test('Financiero por centro de costo: cierra y el prorrateo suma 0', () => {
    const level: BudgetLevel = 'COST_CENTER'
    const r = computeBudgetComparison(input(level))
    const rec = reconcileFinancial({ level, from: FROM, to: TO, documents, policies, assets, rows: r.rows })
    close(rec.total.closureAdjustment, -500_000)
    close(rec.total.prorationAdjustment, 0)
    close(rec.total.budgetModule, 1500)
    assert.equal(rec.mismatch, false)
  })

  test('una diferencia sin explicación se informa (nunca se corrige)', () => {
    const r = computeBudgetComparison(input('ASSET'))
    const tampered = r.rows.map((row) => (row.id === 'a1' ? { ...row, totals: { ...row.totals, realEconomic: row.totals.realEconomic + 5 } } : row))
    const rec = reconcileEconomic({ level: 'ASSET', from: FROM, to: TO, documents, policies, assets, rows: tampered })
    assert.equal(rec.mismatch, true)
    assert.ok(rec.mismatchDetail)
  })
})

// ── Motor de proyección real: un período ya facturado no se proyecta ────────

describe('integración con el motor de proyección', () => {
  test('factura del período vigente: la próxima renovación se proyecta al ciclo siguiente, no en el mismo mes', () => {
    const A = 'a1'
    const pols = [{ id: 'PX', startDate: '2026-04-01', endDate: '2027-04-01', status: 'vigente', coverages: [{ assetId: A }] }] as unknown as Policy[]
    const docs = [doc({ number: 'REN', issueDate: '2026-04-02', total: 1200, alloc: [{ assetId: A, pct: 100, amount: 1200 }] })]
    for (const d of docs) for (const al of d.allocations) (al as { policyId: string }).policyId = 'PX'
    const inputs = buildProjectionAssetInputs('ECONOMIC', [assets[0]], docs, pols)
    const rows = buildRenewalProjectionRows(inputs, new Map(), NOW, '2027-12')
    const projectedApril = rows[0].projectedByMonth.get('2026-04')?.amountUsd ?? 0
    close(projectedApril, 0, 'abril ya está facturado: no se proyecta otra vez')
    close(rows[0].projectedByMonth.get('2027-04')?.amountUsd, 1200, 'renovación siguiente')
    const r = computeBudgetComparison({
      ...input('ASSET'), from: '2026-04', to: '2027-04', documents: docs, policies: pols,
      economicProjectionRows: rows, financialProjectionRows: [],
    })
    const a1 = byId(r.rows, A)
    close(cell(a1, '2026-04').realEconomic, 1200)
    close(cell(a1, '2026-04').projection, 0)
    close(cell(a1, '2026-04').estimate, 1200, 'el mes facturado no se cuenta dos veces')
  })
})

// ── Rendimiento ─────────────────────────────────────────────────────────────

describe('rendimiento', () => {
  test('2000 comprobantes × 300 activos en los 4 niveles + conciliación en tiempo razonable', () => {
    const manyAssets = Array.from({ length: 300 }, (_, i) =>
      asset(`m${i}`, [{ companyId: 'c1', costCenterId: 'cc1', percentage: 70 }, { companyId: 'c2', costCenterId: 'cc2', percentage: 30 }], i % 2 ? 'fa1' : null))
    const manyDocs = Array.from({ length: 2000 }, (_, i) =>
      doc({ number: `P${i}`, issueDate: `2026-0${(i % 6) + 1}-10`, total: 100 + i,
        alloc: [{ assetId: `m${i % 300}`, pct: 100, amount: 100 + i }], installments: [inst(`2026-0${(i % 6) + 1}-28`, 100 + i)] }))
    const started = Date.now()
    for (const level of ['COMPANY', 'COST_CENTER', 'FIXED_ASSET', 'ASSET'] as BudgetLevel[]) {
      const r = computeBudgetComparison({ ...input(level), documents: manyDocs, assets: manyAssets, economicProjectionRows: [], financialProjectionRows: [] })
      reconcileEconomic({ level, from: FROM, to: TO, documents: manyDocs, policies, assets: manyAssets, rows: r.rows })
    }
    const elapsed = Date.now() - started
    assert.ok(elapsed < 3000, `tardó ${elapsed} ms`)
  })
})

// ── Excel, observaciones y render (pantalla) ────────────────────────────────

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildBudgetExport } from '../../src/modules/insurance/budgets/budgetExport'
import { buildBudgetObservations } from '../../src/modules/insurance/budgets/budgetObservations'
import { HISTORICAL_ALLOCATION_WARNING } from '../../src/modules/insurance/budgets/budgetFormat'
import { BudgetComparisonTable } from '../../src/modules/insurance/budgets/BudgetComparisonTable'
import { BudgetFundsSection } from '../../src/modules/insurance/budgets/BudgetFundsSection'

describe('Excel, observaciones y pantalla', () => {
  const level: BudgetLevel = 'COMPANY'
  const result = computeBudgetComparison(input(level, companyBudgets))
  const recs = [
    reconcileEconomic({ level, from: FROM, to: TO, documents, policies, assets, rows: result.rows }),
    reconcileFinancial({ level, from: FROM, to: TO, documents, policies, assets, rows: result.rows }),
  ]
  const observations = buildBudgetObservations(result, recs)
  const visibleRows = filterBudgetRows(result.rows, level, { entityIds: ['c1'] }, assets)
  const visibleTotals = aggregateRows(visibleRows, result.months, NOW)
  const xlsx = buildBudgetExport(level, {
    result, visibleRows, visibleTotals, filtersApplied: true, filterDescriptions: ['Empresas: Empresa 1'],
    reconciliations: recs, observations, truncated: true, generatedAt: new Date('2026-11-12T10:00:00Z'),
  })
  const sheet = (name: string) => xlsx.options.extraSheets!.find((s) => s.name === name)!

  test('observaciones: excluidos por cierre USD, ajustes, % ≠ 100, proyección bloqueada, líneas sin activo', () => {
    const keys = observations.map((o) => o.key)
    for (const k of ['excluded-economic', 'excluded-financial', 'adjustment-excluded', 'allocation-percent', 'projection-blocked', 'lines-without-asset']) {
      assert.ok(keys.includes(k), `falta ${k}`)
    }
    assert.ok(!keys.some((k) => k.startsWith('reconciliation-')), 'la conciliación cierra')
    assert.match(observations.find((o) => o.key === 'excluded-economic')!.details[0].text, /no se suma/)
  })

  test('hoja principal: formato largo con «Incompleto» y «Excluidos (n)», totales visibles y del nivel', () => {
    const [header, ...rows] = xlsx.rows
    const iIncomplete = header.indexOf('Incompleto')
    const iExcluded = header.indexOf('Excluidos (n)')
    const iMonth = header.indexOf('Mes')
    assert.ok(iIncomplete > 0 && iExcluded > 0)
    assert.ok(header.some((h) => String(h).includes('no es costo')), 'Real financiero rotulado como fondos')
    const marzo = rows.find((r) => r[1] === 'Empresa 1' && String(r[iMonth]).includes('MAR'))!
    assert.equal(marzo[iIncomplete], 'Sí')
    assert.equal(marzo[iExcluded], 2, 'BAD-FX: el comprobante (económico) + su cuota (financiero)')
    const junio = rows.find((r) => r[1] === 'Empresa 1' && String(r[iMonth]).includes('JUN'))!
    assert.equal(junio[header.indexOf('Sin presupuesto')], 'Sí')
    assert.equal(junio[header.indexOf('Presupuesto (USD)')], null, 'sin presupuesto ≠ 0')
    assert.ok(rows.some((r) => r[1] === 'Total filas visibles'))
    assert.ok(rows.some((r) => String(r[1]).startsWith('Total del nivel')))
    assert.ok(!rows.some((r) => r[1] === 'Empresa 2'), 'el filtro oculta filas')
  })

  test('hojas: fondos (no es costo), conciliación y filtros/observaciones con advertencia D8 y truncado', () => {
    assert.deepEqual(xlsx.options.extraSheets!.map((s) => s.name), ['Fondos (no es costo)', 'Conciliación', 'Filtros y observaciones'])
    assert.ok(sheet('Fondos (no es costo)').rows[0].some((h) => String(h).includes('Diferencia de fondos')))
    assert.ok(!sheet('Fondos (no es costo)').rows[0].some((h) => /desv[ií]o/i.test(String(h))), 'fondos nunca habla de «desvío»')
    const conc = sheet('Conciliación').rows
    assert.ok(conc.some((r) => r[0] === 'Análisis Económico' && r[1] === 'Total del nivel'))
    assert.ok(conc.some((r) => r[0] === 'Análisis Financiero' && r[1] === 'Total del nivel'))
    const filtros = sheet('Filtros y observaciones').rows.map((r) => r.join(' | '))
    assert.ok(filtros.some((l) => l.includes('Empresas: Empresa 1')))
    assert.ok(filtros.some((l) => l.includes(HISTORICAL_ALLOCATION_WARNING)))
    assert.ok(filtros.some((l) => l.startsWith('Truncado | Sí')))
    assert.ok(filtros.some((l) => l.includes('BAD-FX')), 'lista los excluidos')
  })

  test('nivel Activo: sin advertencia de imputación histórica en el Excel', () => {
    const r = computeBudgetComparison(input('ASSET'))
    const x = buildBudgetExport('ASSET', {
      result: r, visibleRows: r.rows, visibleTotals: r.levelTotals, filtersApplied: false, filterDescriptions: [],
      reconciliations: [], observations: [], truncated: false, generatedAt: new Date(),
    })
    const filtros = x.options.extraSheets!.find((s) => s.name === 'Filtros y observaciones')!.rows.map((row) => row.join(' | '))
    assert.ok(!filtros.some((l) => l.includes(HISTORICAL_ALLOCATION_WARNING)))
  })

  test('pantalla: tabla con grupo de fondos «no es costo», «Sin presupuesto», incompleto y total del nivel', () => {
    const html = renderToStaticMarkup(createElement(BudgetComparisonTable, {
      rows: result.rows, levelLabel: 'Empresa', canEdit: true, filtersApplied: false,
      visibleTotals: result.levelTotals.totals, levelTotals: result.levelTotals.totals,
      unassignedTotals: syntheticTotals(result.rows, result.months, NOW),
      onEdit: () => {}, onHistory: () => {},
    }))
    assert.match(html, /Referencia de fondos/)
    assert.match(html, /no es costo/)
    assert.match(html, /Sin presupuesto/)
    assert.match(html, /Incompleto/)
    assert.match(html, /Total del nivel/)
    assert.match(html, /Sin asignar/)
    assert.match(html, /Editar/)
  })

  test('pantalla: sin permiso de edición no hay botones Editar/Cargar', () => {
    const html = renderToStaticMarkup(createElement(BudgetComparisonTable, {
      rows: result.rows, levelLabel: 'Empresa', canEdit: false, filtersApplied: false,
      visibleTotals: result.levelTotals.totals, levelTotals: result.levelTotals.totals,
      unassignedTotals: syntheticTotals(result.rows, result.months, NOW),
      onEdit: () => {}, onHistory: () => {},
    }))
    assert.doesNotMatch(html, />Editar</)
    assert.doesNotMatch(html, />Cargar</)
    assert.match(html, /Historial/)
  })

  test('pantalla: sección de fondos rotulada «no es gasto económico» y con «Diferencia de fondos»', () => {
    const html = renderToStaticMarkup(createElement(BudgetFundsSection, { cells: result.levelTotals.months }))
    assert.match(html, /no es gasto económico/)
    assert.match(html, /Diferencia de fondos/)
    assert.doesNotMatch(html, /[Dd]esvío/)
  })
})
