import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMatrixData, getRows as getFinancialRows, selectFinancialInstallments, computeFinancialKpis, financialMonthlySeries,
  isInstallmentOverdue, pickAmount, type RowGrouping as FinancialGrouping,
} from '../../src/shared/utils/financialAnalysisCalc'
import {
  buildEconomicMatrix, getRows as getEconomicRows, economicDocumentsInRange, computeEconomicKpis, economicMonthlySeries,
  type RowGrouping as EconomicGrouping,
} from '../../src/shared/utils/economicAnalysisCalc'
import {
  completeRows, UNASSIGNED_ROW_ID, NO_COMPANY_ROW_ID, type AnalysisGrouping,
} from '../../src/shared/utils/analysisGrouping'
import { NO_ASSET_LINE_ROW_ID } from '../../src/shared/utils/fixedAssetGrouping'
import { getDocumentEconomicDirection } from '../../src/shared/utils/documentEconomicEffect'
import { businessTodayStr } from '../../src/shared/utils/businessDate'
import { getISOWeekKey } from '../../src/shared/utils/export'
import { buildAssetRealTimelineByCuota, buildAssetRealTimelineByDocument } from '../../src/shared/utils/renewalProjectionCalc'
import type { DocumentForFinancial } from '../../src/shared/api/documents.api'
import type { Asset, Company, CostCenter, DocumentPolicyAllocation, Installment, Policy } from '../../src/shared/types'

// Consistencia KPI = tabla = gráfico en Análisis Financiero y Económico, con
// todos los tipos de documento, rangos parciales, filas «Sin …» y la
// duplicación de cuotas propias de un ajuste ya volcado en su factura (ND01).

const RATE = 1000
function close(actual: number | undefined, expected: number, msg?: string) {
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-6, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
}

const companies = [{ id: 'c1', name: 'Empresa Activa', status: 'activo' }, { id: 'c2', name: 'Empresa Vieja', status: 'inactivo' }] as unknown as Company[]
const costCenters = [{ id: 'cc1', name: 'CC', status: 'activo' }] as unknown as CostCenter[]
function asset(id: string, companyId: string, fixedAsset: { id: string; code: string; name: string } | null = null): Asset {
  return { id, name: `Activo ${id}`, internalCode: id.toUpperCase(), assetType: 'vehiculo', status: 'activo', companyId, costCenterId: 'cc1', fixedAssetId: fixedAsset?.id ?? null, fixedAsset } as unknown as Asset
}
const assets = [asset('a1', 'c1', { id: 'fa1', code: 'BU-1', name: 'Planta' }), asset('a2', 'c2'), asset('a3', '')]
const policies = [
  { id: 'P1', policyNumber: 'P-1', insuranceCompany: 'Aseguradora A', status: 'vigente', insuranceTypeNames: [], coverages: [] },
  { id: 'P2', policyNumber: 'P-2', insuranceCompany: 'Aseguradora B', status: 'vencida', insuranceTypeNames: [], coverages: [{ id: 'cov-rc', assetId: null, companyId: 'c1', costCenterId: 'cc1' }] },
] as unknown as Policy[]
const lookups = { companies, costCenters, assets, policies }

let seq = 0
function inst(dueDate: string, amount: number, paid = false): Installment {
  seq += 1
  return { id: `i-${seq}`, accountingDocumentId: '', installmentNumber: seq, dueDate, amount, currency: 'ARS', amountArs: amount, amountUsd: amount / RATE, paymentStatus: paid ? 'PAID' : 'PENDING', paidAt: null, paymentMethod: null } as Installment
}
interface Doc {
  number: string; type?: string; status?: string; issueDate: string; total: number
  alloc?: { policyId?: string; assetId: string | null; pct: number; amount: number }[]
  installments?: Installment[]; impact?: string; sign?: string; linked?: string
  applied?: { count: number; ars: number; usd: number }
}
function doc(d: Doc): DocumentForFinancial {
  const id = `d-${d.number}`
  return {
    id, documentNumber: d.number, documentType: d.type ?? 'INVOICE', documentStatus: d.status ?? 'ISSUED', issueDate: d.issueDate,
    currency: 'ARS', exchangeRate: RATE, netAmount: d.total, vatAmount: 0, otherTaxesAmount: 0, totalAmount: d.total,
    totalAmountArs: d.total, totalAmountUsd: d.total / RATE, paymentMethod: 'Transferencia', linkedDocumentId: d.linked,
    economicImpactType: d.impact ?? null, adjustmentSign: d.sign,
    installments: (d.installments ?? []).map((i) => ({ ...i, accountingDocumentId: id })),
    allocations: (d.alloc ?? []).map((a, k) => ({
      id: `${id}-al${k}`, accountingDocumentId: id, policyId: a.policyId ?? 'P1', assetId: a.assetId,
      policyAssetCoverageId: a.assetId ? `cov-${a.assetId}` : 'cov-rc', allocatedAmount: a.amount, allocationPercentage: a.pct,
    })),
    appliedAdjustment: d.applied ?? { count: 0, ars: 0, usd: 0 },
  } as unknown as DocumentForFinancial
}

const FROM = '2026-02'
const TO = '2026-05'
const documents: DocumentForFinancial[] = [
  // Factura repartida 60/40 (a2 es de una empresa INACTIVA); cuotas en rango + una fuera (enero) y otra fuera (junio).
  doc({ number: 'INV1', issueDate: '2026-03-05', total: 1000, alloc: [{ assetId: 'a1', pct: 60, amount: 600 }, { assetId: 'a2', pct: 40, amount: 400 }],
    installments: [inst('2026-01-31', 100, true), inst('2026-03-31', 400, true), inst('2026-04-30', 400), inst('2026-06-30', 100)] }),
  // Póliza VENCIDA, línea sin activo.
  doc({ number: 'INV2', issueDate: '2026-02-20', total: 600, alloc: [{ policyId: 'P2', assetId: null, pct: 100, amount: 600 }], installments: [inst('2026-02-28', 600)] }),
  // Asignación incoherente (60 % pero importe ~0): Financiero usa el %, Económico el importe → resto «Sin asignar».
  doc({ number: 'A-001', issueDate: '2026-04-10', total: 1000, alloc: [{ assetId: 'a3', pct: 60, amount: 0.03 }], installments: [inst('2026-04-15', 1000)] }),
  // NC aplicada con distribución automática (negativa) y con distribución manual (positiva): ambas restan.
  doc({ number: 'NC-AUTO', type: 'CREDIT_NOTE', status: 'APPLIED', issueDate: '2026-03-20', total: 100, linked: 'd-INV1', alloc: [{ assetId: 'a1', pct: 100, amount: -100 }] }),
  doc({ number: 'NC-MANUAL', type: 'CREDIT_NOTE', status: 'APPLIED', issueDate: '2026-04-05', total: 50, linked: 'd-INV1', alloc: [{ assetId: 'a2', pct: 100, amount: 50 }] }),
  // NC sin aplicar: no impacta (regla del KPI).
  doc({ number: 'NC-PEND', type: 'CREDIT_NOTE', status: 'ISSUED', issueDate: '2026-04-06', total: 30, alloc: [{ assetId: 'a1', pct: 100, amount: -30 }] }),
  // ND01: aplicada, ya volcada en la factura (+200) Y con cuota propia de 200 → la cuota propia se excluye en Financiero.
  doc({ number: 'ND01', type: 'DEBIT_NOTE', status: 'APPLIED', issueDate: '2026-04-18', total: 200, linked: 'd-INV1', installments: [inst('2026-04-20', 200, true)], applied: { count: 1, ars: 200, usd: 0.2 } }),
  // ND aplicada con cuota propia, pero solo volcó una parte → no se puede confirmar: se cuenta y se avisa.
  doc({ number: 'ND-PARCIAL', type: 'DEBIT_NOTE', status: 'APPLIED', issueDate: '2026-05-02', total: 80, linked: 'd-INV1', installments: [inst('2026-05-10', 80)], applied: { count: 1, ars: 40, usd: 0.04 } }),
  // ND emitida (no aplicada) con cuota propia: es su única representación → se cuenta, sin aviso.
  doc({ number: 'ND-SOLA', type: 'DEBIT_NOTE', status: 'ISSUED', issueDate: '2026-05-03', total: 70, alloc: [{ policyId: 'P2', assetId: null, pct: 100, amount: 70 }], installments: [inst('2026-05-15', 70)] }),
  // Endosos: disminuye (resta), sin impacto (suma, regla vigente), sin aplicar (no impacta).
  doc({ number: 'END-DEC', type: 'ENDORSEMENT', status: 'APPLIED', impact: 'DECREASES_COST', issueDate: '2026-03-25', total: 40, alloc: [{ assetId: 'a1', pct: 100, amount: 40 }] }),
  doc({ number: 'END-INC', type: 'ENDORSEMENT', status: 'APPLIED', impact: 'INCREASES_COST', issueDate: '2026-03-26', total: 25, alloc: [{ assetId: 'a3', pct: 100, amount: 25 }] }),
  doc({ number: 'END-PEND', type: 'ENDORSEMENT', status: 'ISSUED', impact: 'INCREASES_COST', issueDate: '2026-03-27', total: 999, alloc: [{ assetId: 'a1', pct: 100, amount: 999 }] }),
  // Asiento de ajuste negativo aplicado, sin asignaciones → «Sin asignar».
  doc({ number: 'ADJ', type: 'ADJUSTMENT_ENTRY', status: 'APPLIED', sign: 'NEGATIVE', issueDate: '2026-05-20', total: 10 }),
  // Fuera de rango (emitido en enero y en junio): no entra en Económico.
  doc({ number: 'INV-ENE', issueDate: '2026-01-15', total: 5000, alloc: [{ assetId: 'a1', pct: 100, amount: 5000 }] }),
  doc({ number: 'INV-JUN', issueDate: '2026-06-02', total: 7000, alloc: [{ assetId: 'a1', pct: 100, amount: 7000 }] }),
]
const allocations = documents.flatMap((d) => d.allocations) as unknown as DocumentPolicyAllocation[]

const FIN_GROUPINGS: FinancialGrouping[] = ['empresa', 'centro_costo', 'activo', 'bien_de_uso', 'poliza']
const ECO_GROUPINGS: EconomicGrouping[] = ['empresa', 'centro_costo', 'aseguradora', 'poliza', 'activo', 'bien_de_uso']
const sumMap = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

describe('Financiero — período, sin asignar y duplicaciones', () => {
  const selection = selectFinancialInstallments(documents, FROM, TO)

  test('solo cuotas con vencimiento en el rango; ND01 excluida (su ajuste ya está en la factura); ND parcial y ND sin aplicar se cuentan', () => {
    const amounts = selection.installments.map((i) => i.amount).sort((a, b) => a - b)
    assert.deepEqual(amounts, [70, 80, 400, 400, 600, 1000])
    assert.deepEqual(selection.adjustmentIssues.map((i) => [i.documentNumber, i.excluded]), [['ND01', true], ['ND-PARCIAL', false]])
    close(selection.adjustmentIssues[0].appliedAmount ?? undefined, 200)
  })

  for (const currency of ['ARS', 'USD'] as const) {
    test(`${currency}: KPI = gráfico = Σ filas de TODAS las agrupaciones, por mes y por semana`, () => {
      const kpi = computeFinancialKpis(selection.installments, currency, '2026-04-30')
      close(kpi.total, (70 + 80 + 400 + 400 + 600 + 1000) / (currency === 'USD' ? RATE : 1))
      const series = financialMonthlySeries(selection.installments, ['2026-02', '2026-03', '2026-04', '2026-05'], currency)
      close(series.reduce((s, m) => s + m.paid, 0), kpi.totalPaid, 'gráfico pagado')
      close(series.reduce((s, m) => s + m.pending, 0), kpi.totalPending, 'gráfico pendiente')
      for (const g of FIN_GROUPINGS) {
        for (const granularity of ['month', 'week'] as const) {
          const { matrix, paymentMethods } = buildMatrixData(g, currency, granularity, policies, assets, documents, selection.installments, allocations)
          const rows = completeRows(g, getFinancialRows(g, companies, costCenters, assets, policies), matrix.keys(), lookups)
          const ids = new Set(rows.map((r) => r.id))
          let paid = 0, pending = 0
          for (const [id, cells] of matrix) {
            assert.ok(ids.has(id), `${g}: la fila ${id} tiene movimientos y está en la tabla`)
            for (const c of cells.values()) { paid += c.paid; pending += c.pending }
          }
          close(paid, kpi.totalPaid, `${g}/${granularity} pagado`)
          close(pending, kpi.totalPending, `${g}/${granularity} pendiente`)
          if (g === 'empresa') {
            // El desglose por medio de pago de cada empresa suma lo mismo que la empresa.
            for (const [id, methods] of paymentMethods) {
              const byMethod = [...methods.values()].flatMap((p) => [...p.values()]).reduce((s, c) => s + c.paid + c.pending, 0)
              close(byMethod, [...matrix.get(id)!.values()].reduce((s, c) => s + c.paid + c.pending, 0), `medios de pago ${id}`)
            }
          }
        }
      }
    })
  }

  test('ninguna semana, mes o trimestre suma movimientos fuera del rango', () => {
    const { matrix } = buildMatrixData('poliza', 'ARS', 'month', policies, assets, documents, selection.installments, allocations)
    for (const cells of matrix.values()) for (const k of cells.keys()) assert.ok(k >= FROM && k <= TO, `mes ${k}`)
    const weeks = buildMatrixData('poliza', 'ARS', 'week', policies, assets, documents, selection.installments, allocations).matrix
    const allowed = new Set(selection.installments.map((i) => getISOWeekKey(i.dueDate)))
    for (const cells of weeks.values()) for (const k of cells.keys()) assert.ok(allowed.has(k), `semana ${k}`)
    // Enero (100) y junio (100) de INV1 no están en ninguna celda.
    const total = [...matrix.values()].flatMap((m) => [...m.values()]).reduce((s, c) => s + c.paid + c.pending, 0)
    close(total, 2550)
  })

  test('filas: póliza vencida, empresa inactiva, sin empresa, líneas sin activo y sin asignar', () => {
    const rowsFor = (g: AnalysisGrouping) => {
      const { matrix } = buildMatrixData(g as FinancialGrouping, 'ARS', 'month', policies, assets, documents, selection.installments, allocations)
      return { matrix, rows: completeRows(g, getFinancialRows(g as FinancialGrouping, companies, costCenters, assets, policies), matrix.keys(), lookups) }
    }
    const total = (m: ReturnType<typeof rowsFor>['matrix'], id: string) => [...(m.get(id)?.values() ?? [])].reduce((s, c) => s + c.paid + c.pending, 0)
    const pol = rowsFor('poliza')
    assert.equal(pol.rows.find((r) => r.id === 'P2')?.sublabel?.startsWith('Vencida'), true)
    close(total(pol.matrix, 'P2'), 600 + 70)
    const emp = rowsFor('empresa')
    assert.equal(emp.rows.find((r) => r.id === 'c2')?.sublabel, 'Empresa inactiva')
    close(total(emp.matrix, NO_COMPANY_ROW_ID), 600, 'A-001: 60 % al activo a3 sin empresa')
    const act = rowsFor('activo')
    close(total(act.matrix, NO_ASSET_LINE_ROW_ID), 600 + 70)
    // Sin asignar: A-001 40 % no cubierto + ND-PARCIAL sin asignaciones. ND01 NO (excluida, no se duplica).
    close(total(act.matrix, UNASSIGNED_ROW_ID), 400 + 80)
    assert.equal(act.rows[act.rows.length - 1].id, UNASSIGNED_ROW_ID)
  })

  test('cuota vencida: comparada contra HOY (día de negocio de Argentina), no una fecha fija', () => {
    const pending = inst('2026-04-15', 1)
    assert.equal(isInstallmentOverdue(pending, '2026-04-16'), true)
    assert.equal(isInstallmentOverdue(pending, '2026-04-15'), false, 'vence hoy: todavía no está vencida')
    assert.equal(isInstallmentOverdue({ ...pending, paymentStatus: 'PAID' }, '2027-01-01'), false)
    // Límite de día: 02:59 UTC del 16/04 todavía es 15/04 en Buenos Aires (UTC−3); 03:00 UTC ya es 16/04.
    assert.equal(businessTodayStr(new Date('2026-04-16T02:59:00Z')), '2026-04-15')
    assert.equal(businessTodayStr(new Date('2026-04-16T03:00:00Z')), '2026-04-16')
    const kpi = computeFinancialKpis([pending, inst('2026-04-30', 1), inst('2026-04-01', 1, true)], 'ARS', businessTodayStr(new Date('2026-04-20T15:00:00Z')))
    assert.equal(kpi.overdueCount, 1)
  })
})

describe('Económico — signo del documento, período y sin asignar', () => {
  const period = economicDocumentsInRange(documents, FROM, TO)

  test('signo según tipo y estado (misma regla que el KPI)', () => {
    const dir = (n: string) => getDocumentEconomicDirection(documents.find((d) => d.documentNumber === n)!)
    assert.deepEqual(
      ['INV1', 'NC-AUTO', 'NC-MANUAL', 'NC-PEND', 'ND01', 'END-DEC', 'END-INC', 'END-PEND', 'ADJ'].map(dir),
      [1, -1, -1, 0, 1, -1, 1, 0, -1],
    )
  })

  for (const currency of ['ARS', 'USD'] as const) {
    test(`${currency}: KPI = gráfico = torta = Σ filas de TODAS las agrupaciones, por mes y por semana`, () => {
      const div = currency === 'USD' ? RATE : 1
      const kpis = computeEconomicKpis(period, allocations, policies, assets, currency)
      // 1000 + 600 + 1000 − 100 − 50 + 0 + 200 + 80 + 70 − 40 + 25 + 0 − 10
      close(kpis.totalCost, 2775 / div)
      close(economicMonthlySeries(period, ['2026-02', '2026-03', '2026-04', '2026-05'], currency).reduce((s, m) => s + m.total, 0), kpis.totalCost, 'gráfico')
      close(kpis.byInsurer.reduce((s, x) => s + x.amount, 0), kpis.totalCost, 'torta / aseguradoras')
      assert.notEqual(kpis.topInsurer.name, UNASSIGNED_ROW_ID)
      for (const g of ECO_GROUPINGS) {
        for (const granularity of ['month', 'week'] as const) {
          const { matrix } = buildEconomicMatrix(g, currency, granularity, policies, assets, period, allocations)
          const rows = completeRows(g, getEconomicRows(g, companies, costCenters, assets, policies), matrix.keys(), lookups)
          const ids = new Set(rows.map((r) => r.id))
          for (const id of matrix.keys()) assert.ok(ids.has(id), `${g}: fila ${id}`)
          close([...matrix.values()].reduce((s, m) => s + sumMap(m), 0), kpis.totalCost, `${g}/${granularity}`)
        }
      }
    })
  }

  test('reparto por importe asignado con el signo del documento; lo no asignado va a «Sin asignar»', () => {
    const { matrix } = buildEconomicMatrix('activo', 'ARS', 'month', policies, assets, period, allocations)
    const row = (id: string) => sumMap(matrix.get(id) ?? new Map())
    close(row('a1'), 600 - 100 - 40, 'INV1 60 % − NC automática − endoso que disminuye (NC sin aplicar y endoso sin aplicar no impactan)')
    close(row('a2'), 400 - 50, 'NC con distribución manual POSITIVA igual resta')
    close(row('a3'), 0.03 + 25, 'A-001 según importe asignado + endoso que aumenta')
    close(row(NO_ASSET_LINE_ROW_ID), 600 + 70)
    close(row(UNASSIGNED_ROW_ID), (1000 - 0.03) + 200 + 80 - 10, 'A-001 no asignado + ND01 + ND parcial + ajuste negativo')
  })

  test('los documentos fuera del rango no entran en ninguna vista (trimestre/año incluidos)', () => {
    assert.deepEqual(period.map((d) => d.documentNumber).filter((n) => n.startsWith('INV-')), [])
    const { matrix } = buildEconomicMatrix('poliza', 'ARS', 'month', policies, assets, period, allocations)
    for (const cells of matrix.values()) for (const k of cells.keys()) assert.ok(k >= FROM && k <= TO, `mes ${k}`)
  })
})

describe('Proyecciones — movimientos reales con el mismo criterio', () => {
  test('Económica: la NC con distribución manual positiva resta; la NC sin aplicar no impacta; facturas sin cambios', () => {
    const t = buildAssetRealTimelineByDocument('a2', documents)
    close(t.get('2026-03')!.byCurrency.ARS.total, 400)
    close(t.get('2026-04')!.byCurrency.ARS.total, -50)
    const t1 = buildAssetRealTimelineByDocument('a1', documents)
    assert.equal(t1.get('2026-04'), undefined, 'NC-PEND (sin aplicar) no aporta')
    close(t1.get('2026-03')!.byCurrency.ARS.total, 600 - 100 - 40 + 0)
  })

  test('Financiera: las cuotas propias de un ajuste ya volcado en su factura no se cuentan dos veces', () => {
    const dup = doc({ number: 'ND-DUP', type: 'DEBIT_NOTE', status: 'APPLIED', issueDate: '2026-04-18', total: 200, linked: 'd-INV1',
      alloc: [{ assetId: 'a1', pct: 100, amount: 200 }], installments: [inst('2026-04-20', 200)], applied: { count: 1, ars: 200, usd: 0.2 } })
    const t = buildAssetRealTimelineByCuota('a1', [...documents, dup])
    close(t.get('2026-04')!.byCurrency.ARS.total, 400 * 0.6, 'solo la cuota de INV1 (60 %), sin la cuota propia de ND-DUP')
    const kept = doc({ ...{ number: 'ND-KEEP', type: 'DEBIT_NOTE', status: 'APPLIED', issueDate: '2026-04-18', total: 200, alloc: [{ assetId: 'a1', pct: 100, amount: 200 }], installments: [inst('2026-04-21', 200)] }, applied: { count: 0, ars: 0, usd: 0 } })
    close(buildAssetRealTimelineByCuota('a1', [...documents, kept]).get('2026-04')!.byCurrency.ARS.total, 400 * 0.6 + 200, 'sin ajuste confirmado en la factura: se cuenta')
  })

  test('pickAmount sigue usando el cierre de la cuota en la moneda elegida', () => {
    const i = inst('2026-04-01', 1500)
    assert.equal(pickAmount(i, 'ARS'), 1500)
    assert.equal(pickAmount(i, 'USD'), 1.5)
  })
})
