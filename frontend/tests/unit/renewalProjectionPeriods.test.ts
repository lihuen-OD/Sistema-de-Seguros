import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectRenewalCycleByCuota,
  detectRenewalCycleByDocument,
  buildAssetRealTimelineByCuota,
  buildAssetRealTimelineByDocument,
  projectAssetRow,
  resolveRowBase,
  baseTotalUsd,
  buildDisplayMatrix,
  sumDisplayCells,
  addMonthsToKey,
  buildMonthRange,
  monthsBetweenKeys,
  resolveEffectiveCycle,
  sumRowTotals,
  inconsistentAllocationsForAsset,
  type DisplayCell,
  type RenewalCycle,
  type RowProjectionInputs,
} from '../../src/shared/utils/renewalProjectionCalc'
import type { AssetRowData } from '../../src/modules/insurance/renewal-projections/RenewalProjectionTable'
import type { DocumentForFinancial } from '../../src/shared/api/documents.api'
import type { Currency, Installment, Policy } from '../../src/shared/types'

// Regresión: una renovación es un PERÍODO de cobertura (póliza + vigencia),
// no una factura suelta. Casos tomados de la auditoría de Neon development
// (Trafic, Auto 02, facturas consolidadas, pólizas de 1 y 12 meses…).

const A = 'asset-a'
const NOW = '2026-11'

function close(actual: number | null | undefined, expected: number, msg?: string) {
  assert.ok(actual !== null && actual !== undefined, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
}

let seq = 0

function policy(id: string, startDate: string, endDate: string, assetIds = [A]): Policy {
  return { id, startDate, endDate, status: 'vencida', coverages: assetIds.map((assetId) => ({ assetId })) } as unknown as Policy
}

function inst(dueDate: string, amount: number, currency: Currency = 'USD', rate = 1500, paid = false): Installment {
  seq += 1
  return {
    id: `i-${seq}`, accountingDocumentId: 'd', installmentNumber: seq, dueDate, amount, currency,
    amountArs: currency === 'ARS' ? amount : amount * rate,
    amountUsd: currency === 'USD' ? amount : amount / rate,
    paymentStatus: paid ? 'PAID' : 'PENDING', paidAt: null, paymentMethod: null,
  } as Installment
}

interface DocIn {
  type?: string
  number?: string
  issueDate: string
  currency?: Currency
  net: number
  vat?: number
  rate?: number
  totalUsd?: number | null
  alloc: { assetId?: string; policyId: string; pct: number; amount?: number }[]
  installments?: Installment[]
}

function doc(p: DocIn): DocumentForFinancial {
  seq += 1
  const currency = p.currency ?? 'USD'
  const rate = p.rate ?? 1500
  const total = p.net + (p.vat ?? 0)
  return {
    id: `doc-${seq}`, documentType: p.type ?? 'INVOICE', documentStatus: p.type && p.type !== 'INVOICE' ? 'APPLIED' : 'ISSUED', documentNumber: p.number ?? `N-${seq}`,
    issueDate: p.issueDate, currency, exchangeRate: rate,
    netAmount: p.net, vatAmount: p.vat ?? 0, otherTaxesAmount: 0, totalAmount: total,
    totalAmountArs: currency === 'ARS' ? total : total * rate,
    totalAmountUsd: p.totalUsd === undefined ? (currency === 'USD' ? total : total / rate) : p.totalUsd,
    paymentStatus: 'PENDING',
    installments: p.installments ?? [],
    allocations: p.alloc.map((a, i) => ({
      id: `al-${seq}-${i}`, accountingDocumentId: `doc-${seq}`, policyAssetCoverageId: `cov-${a.policyId}-${i}`,
      policyId: a.policyId, assetId: a.assetId ?? A, allocationPercentage: a.pct, allocatedAmount: a.amount ?? (total * a.pct) / 100,
    })),
  } as unknown as DocumentForFinancial
}

/** Con 0 %, cada ciclo COMPLETO proyectado debe sumar exactamente la base (sin pérdidas ni duplicaciones). */
function assertCycleSumsToBase(cycle: RenewalCycle) {
  const total = baseTotalUsd(resolveRowBase(cycle, null))!
  // Un ciclo completo cualquiera en el futuro (el nº 24 desde el ancla).
  const start = addMonthsToKey(cycle.lastRenewalStartMonthKey, cycle.cycleLengthMonths * 24)
  const cells = projectAssetRow(cycle, start, addMonthsToKey(start, cycle.cycleLengthMonths - 1), total, 0, 0, 0)
  close(cells.reduce((s, c) => s + c.amountUsd, 0), total, `ciclo completo desde ${start}`)
}

// ── Trafic ──────────────────────────────────────────────────────────────────
// Póliza N-01 de 1 mes (30/07 → 30/08). Dos facturas del MISMO período:
// DOC-01 (USD 49.999,98, 50 % al activo, cuotas 02/08 y 30/08) y N-01
// (USD 2.000, 50 %, cuotas 30/08 y 06/09 — la última fuera de vigencia).

describe('Trafic: dos facturas del mismo período de una póliza de 1 mes', () => {
  const policies = [policy('N-01', '2026-07-30', '2026-08-30')]
  const docs = () => [
    doc({ number: 'DOC-01', issueDate: '2026-07-30', net: 49_999.98, alloc: [{ policyId: 'N-01', pct: 50 }, { assetId: 'otro', policyId: 'N-01', pct: 50 }],
      installments: [inst('2026-08-02', 24_999.99, 'USD', 1500, true), inst('2026-08-30', 20_000, 'USD', 1500, true)] }),
    doc({ number: 'N-01', issueDate: '2026-08-10', net: 2000, alloc: [{ policyId: 'N-01', pct: 50 }, { assetId: 'otro', policyId: 'N-01', pct: 50 }],
      installments: [inst('2026-08-30', 1000), inst('2026-09-06', 1000)] }),
  ]

  test('Financiero: una sola renovación, ciclo 1 mes (plazo real), base = suma de las dos facturas, sin pérdida', () => {
    const c = detectRenewalCycleByCuota(A, docs(), policies, NOW)
    assert.equal(c.cycleLengthMonths, 1)
    assert.equal(c.periodInvoiceCount, 2)
    close(c.defaultNetUsd, 24_999.99 + 1000)
    assert.equal(c.lastRenewalStartMonthKey, '2026-07')
    assert.deepEqual(Object.keys(c.originalShare), ['0'])
    close(c.originalShare[0], 1)
    assert.equal(c.outOfTermCount, 1, 'la cuota del 06/09 está fuera de la vigencia (fin 30/08)')
    assertCycleSumsToBase(c)
  })

  test('Económico: misma base, reconocida por emisión, sin cuotas fuera de vigencia', () => {
    const c = detectRenewalCycleByDocument(A, docs(), policies, NOW)
    assert.equal(c.cycleLengthMonths, 1)
    assert.equal(c.periodInvoiceCount, 2)
    close(c.defaultNetUsd, 24_999.99 + 1000)
    assert.equal(c.outOfTermCount, 0)
    assertCycleSumsToBase(c)
  })
})

// ── Auto 02 ─────────────────────────────────────────────────────────────────
// Póliza AUTO-0102 de 1 mes. N-0101 es una factura CONSOLIDADA (10 activos al
// 10 %, USD 20.000) con una cuota anómala en 2027-08; N-0102 es propia (100 %).

describe('Auto 02: factura consolidada + factura propia del mismo período', () => {
  const assets = Array.from({ length: 10 }, (_, i) => (i === 0 ? A : `flota-${i}`))
  const policies = [policy('AUTO-0102', '2026-08-12', '2026-09-13', assets)]
  const consolidated = () =>
    doc({ number: 'N-0101', issueDate: '2026-08-20', net: 20_000, alloc: assets.map((assetId) => ({ assetId, policyId: 'AUTO-0102', pct: 10 })),
      installments: [inst('2027-08-30', 20_000, 'USD', 1500, true)] })
  const own = () => doc({ number: 'N-0102', issueDate: '2026-08-21', net: 100_000, alloc: [{ policyId: 'AUTO-0102', pct: 100 }], installments: [inst('2026-09-06', 100_000)] })

  test('Financiero y Económico: base 102.000 (no solo la última factura), ciclo 1 mes', () => {
    for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
      const c = detect(A, [consolidated(), own()], policies, NOW)
      assert.equal(c.cycleLengthMonths, 1)
      assert.equal(c.periodInvoiceCount, 2)
      close(c.defaultNetUsd, 2000 + 100_000)
      assertCycleSumsToBase(c)
    }
    assert.equal(detectRenewalCycleByCuota(A, [consolidated(), own()], policies, NOW).outOfTermCount, 1, 'la cuota de 2027-08 queda fuera de vigencia')
  })

  test('la factura consolidada no se duplica: la suma de las bases de los 10 activos es su total', () => {
    const d = consolidated()
    const sum = assets.reduce((s, assetId) => s + (detectRenewalCycleByDocument(assetId, [d], policies, NOW).defaultNetUsd ?? 0), 0)
    close(sum, 20_000)
    const sumFin = assets.reduce((s, assetId) => s + (detectRenewalCycleByCuota(assetId, [d], policies, NOW).defaultNetUsd ?? 0), 0)
    close(sumFin, 20_000)
  })

  test('el vencimiento anómalo de 2027-08 no tapa las renovaciones anteriores: se proyecta desde el mes actual', () => {
    const c = detectRenewalCycleByCuota(A, [consolidated(), own()], policies, NOW)
    const t02 = buildAssetRealTimelineByCuota(A, [consolidated(), own()])
    assert.ok(t02.has('2027-08'), 'la cuota real de 2027-08 sigue siendo real')
    const projected = projectAssetRow(c, NOW, '2027-12', c.defaultNetUsd!, 0, 0, 0)
    const byMonth = new Map(projected.map((p) => [p.monthKey, p.amountUsd]))
    // Cada renovación mensual: N-0102 (100.000) vence ~1 mes después del inicio; la parte de N-0101 (2.000) 12 meses después, como está cargada.
    close(byMonth.get(NOW), 100_000, 'noviembre ya tiene proyección (antes: vacío hasta 2027-09)')
    close(byMonth.get('2027-08'), 100_000, 'agosto 2027: renovación proyectada además de la cuota real (celda mixta)')
    close(byMonth.get('2027-09'), 102_000, 'desde 2027-09 se suma la parte de N-0101 de la renovación de 2026-09')
    assert.deepEqual(c.outOfTermItems, [{ documentNumber: 'N-0101', date: '2027-08-30', kind: 'cuota' }])
  })
})

// ── Pólizas de 12 meses / renovaciones legítimas ────────────────────────────

describe('pólizas anuales y renovaciones legítimas', () => {
  test('factura complementaria del mismo año: ciclo 12 (no 1) y base sumada', () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const docs = [
      doc({ issueDate: '2026-01-05', net: 1000, alloc: [{ policyId: 'ANUAL', pct: 100 }], installments: [inst('2026-01-15', 1000)] }),
      doc({ issueDate: '2026-02-10', net: 200, alloc: [{ policyId: 'ANUAL', pct: 100 }], installments: [inst('2026-02-20', 200)] }),
    ]
    for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
      const c = detect(A, docs, policies, NOW)
      assert.equal(c.cycleLengthMonths, 12)
      close(c.defaultNetUsd, 1200)
      assert.equal(c.lastRenewalStartMonthKey, '2026-01')
      assertCycleSumsToBase(c)
    }
  })

  test('renovación con póliza nueva facturada por adelantado: el último período es el nuevo, sin sumar el anterior', () => {
    const policies = [policy('P-2025', '2025-01-01', '2026-01-01'), policy('P-2026', '2026-01-01', '2027-01-01')]
    const docs = [
      doc({ issueDate: '2025-01-05', net: 1000, alloc: [{ policyId: 'P-2025', pct: 100 }], installments: [inst('2025-01-10', 1000)] }),
      doc({ issueDate: '2025-12-20', net: 1200, alloc: [{ policyId: 'P-2026', pct: 100 }], installments: [inst('2026-01-10', 1200)] }),
    ]
    const c = detectRenewalCycleByCuota(A, docs, policies, NOW)
    assert.equal(c.cycleLengthMonths, 12)
    close(c.defaultNetUsd, 1200)
    assert.equal(c.lastRenewalStartMonthKey, '2026-01')
    assert.equal(c.periodInvoiceCount, 1)
  })

  test('misma póliza con facturas en vigencias distintas (fechas editadas): dos períodos, no uno', () => {
    const policies = [policy('MISMA', '2025-01-01', '2026-01-01')]
    const docs = [
      doc({ issueDate: '2025-01-10', net: 1000, alloc: [{ policyId: 'MISMA', pct: 100 }], installments: [inst('2025-01-20', 1000)] }),
      doc({ issueDate: '2026-01-08', net: 1100, alloc: [{ policyId: 'MISMA', pct: 100 }], installments: [inst('2026-01-20', 1100)] }),
    ]
    for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
      const c = detect(A, docs, policies, NOW)
      assert.equal(c.cycleLengthMonths, 12)
      assert.equal(c.periodInvoiceCount, 1)
      close(c.defaultNetUsd, 1100)
      assert.equal(c.lastRenewalStartMonthKey, '2026-01')
      assert.equal(c.outOfTermCount, 0)
    }
  })

  test('mezcla de renovación anual con factura extra 37 días después: ciclo 12, no 7', () => {
    const policies = [policy('P-2025', '2025-07-01', '2026-07-01'), policy('P-2026', '2026-07-01', '2027-07-01')]
    const docs = [
      doc({ issueDate: '2025-07-05', net: 900, alloc: [{ policyId: 'P-2025', pct: 100 }], installments: [inst('2025-07-15', 900)] }),
      doc({ issueDate: '2026-07-14', net: 1000, alloc: [{ policyId: 'P-2026', pct: 100 }], installments: [inst('2026-07-20', 1000)] }),
      doc({ issueDate: '2026-08-20', net: 150, alloc: [{ policyId: 'P-2026', pct: 100 }], installments: [inst('2026-08-30', 150)] }),
    ]
    const c = detectRenewalCycleByCuota(A, docs, policies, NOW)
    assert.equal(c.cycleLengthMonths, 12)
    close(c.defaultNetUsd, 1150)
    assert.equal(c.periodInvoiceCount, 2)
  })

  test('pólizas legítimas de 1, 3 y 6 meses respetan su plazo; renovaciones mensuales no se suman entre sí', () => {
    const monthly = [policy('M1', '2026-01-01', '2026-02-01'), policy('M2', '2026-02-01', '2026-03-01')]
    const docsM = [
      doc({ issueDate: '2026-01-03', net: 100, alloc: [{ policyId: 'M1', pct: 100 }], installments: [inst('2026-01-10', 100)] }),
      doc({ issueDate: '2026-02-03', net: 110, alloc: [{ policyId: 'M2', pct: 100 }], installments: [inst('2026-02-10', 110)] }),
    ]
    const m = detectRenewalCycleByCuota(A, docsM, monthly, NOW)
    assert.equal(m.cycleLengthMonths, 1)
    close(m.defaultNetUsd, 110)
    for (const [end, months] of [['2026-04-01', 3], ['2026-07-01', 6]] as const) {
      const c = detectRenewalCycleByDocument(A, [doc({ issueDate: '2026-01-02', net: 300, alloc: [{ policyId: 'Q', pct: 100 }] })], [policy('Q', '2026-01-01', end)], NOW)
      assert.equal(c.cycleLengthMonths, months)
    }
  })
})

// ── Financiero vs Económico, cuotas, concurrencia, TC y ajustes ─────────────

describe('reparto, concurrencia, confiabilidad y ajustes', () => {
  test('Financiero reparte por vencimiento de cuotas; Económico por emisión — y ninguno pierde importe', () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const d = doc({ issueDate: '2026-01-05', net: 1200, alloc: [{ policyId: 'ANUAL', pct: 100 }],
      installments: [inst('2026-02-10', 400), inst('2026-06-10', 400), inst('2026-10-10', 400)] })
    const fin = detectRenewalCycleByCuota(A, [d], policies, NOW)
    assert.deepEqual(Object.keys(fin.originalShare).map(Number).sort((a, b) => a - b), [1, 5, 9])
    const eco = detectRenewalCycleByDocument(A, [d], policies, NOW)
    assert.deepEqual(eco.originalShare, { 0: 1 })
    assertCycleSumsToBase(fin)
    assertCycleSumsToBase(eco)
  })

  test('cuotas posteriores a la vigencia: se conservan en su mes (offset 13), sin pérdida, y se informan con comprobante y fecha', () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const d = doc({ number: 'F-13', issueDate: '2026-01-05', net: 1300, alloc: [{ policyId: 'ANUAL', pct: 100 }],
      installments: [inst('2026-03-10', 1000), inst('2027-02-10', 300)] })
    const c = detectRenewalCycleByCuota(A, [d], policies, NOW)
    assert.equal(c.outOfTermCount, 1)
    assert.deepEqual(c.outOfTermItems, [{ documentNumber: 'F-13', date: '2027-02-10', kind: 'cuota' }])
    close(c.offsetShare[2], 1000 / 1300)
    close(c.offsetShare[13], 300 / 1300, 'la cuota de 2027-02 queda 13 meses después del inicio (no se pliega)')
    close(c.originalShare[1], 300 / 1300, 'el resumen por posición del ciclo la cuenta en la posición 1')
    assertCycleSumsToBase(c)
  })

  test('coberturas concurrentes: mismo plazo se suman; otro plazo se excluye y se informa', () => {
    const same = [policy('RC', '2026-03-01', '2027-03-01'), policy('TR', '2026-03-15', '2027-03-15')]
    const docs = [
      doc({ issueDate: '2026-03-02', net: 500, alloc: [{ policyId: 'RC', pct: 100 }] }),
      doc({ issueDate: '2026-03-16', net: 700, alloc: [{ policyId: 'TR', pct: 100 }] }),
    ]
    const merged = detectRenewalCycleByDocument(A, docs, same, NOW)
    close(merged.defaultNetUsd, 1200)
    assert.equal(merged.concurrentPeriodsExcluded, 0)

    const different = [policy('RC', '2026-03-01', '2027-03-01'), policy('TR', '2026-03-15', '2026-09-15')]
    const excluded = detectRenewalCycleByDocument(A, docs, different, NOW)
    assert.equal(excluded.concurrentPeriodsExcluded, 1)
    close(excluded.defaultNetUsd, 700, 'solo el último período (TR, 6 meses)')
    assert.equal(excluded.cycleLengthMonths, 6)
  })

  test('una factura del período sin cierre USD confiable bloquea la base completa (no una base parcial)', () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const docs = [
      doc({ issueDate: '2026-01-05', net: 1000, alloc: [{ policyId: 'ANUAL', pct: 100 }] }),
      doc({ issueDate: '2026-02-05', currency: 'ARS', net: 300_000, rate: 1, totalUsd: 300_000, alloc: [{ policyId: 'ANUAL', pct: 100 }] }),
    ]
    const c = detectRenewalCycleByDocument(A, docs, policies, NOW)
    assert.equal(c.baseStatus, 'UNRELIABLE_FX')
    assert.equal(c.defaultNetUsd, null)
    assert.equal(resolveRowBase(c, null).projectionBlocked, true)
  })

  test('NC, ND y endosos no son renovaciones: no cambian período, base ni ciclo; siguen ajustando lo real', () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const invoice = doc({ issueDate: '2026-01-05', net: 1000, alloc: [{ policyId: 'ANUAL', pct: 100 }], installments: [inst('2026-01-20', 1000)] })
    const adjustments = [
      doc({ type: 'CREDIT_NOTE', issueDate: '2026-01-25', net: 100, alloc: [{ policyId: 'ANUAL', pct: 100, amount: -100 }] }),
      doc({ type: 'DEBIT_NOTE', issueDate: '2026-02-02', net: 50, alloc: [{ policyId: 'ANUAL', pct: 100 }] }),
      doc({ type: 'ENDORSEMENT', issueDate: '2026-03-02', net: 80, alloc: [{ policyId: 'ANUAL', pct: 100 }], installments: [inst('2026-03-10', 80)] }),
    ]
    for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
      const base = detect(A, [invoice], policies, NOW)
      const withAdj = detect(A, [invoice, ...adjustments], policies, NOW)
      assert.deepEqual(withAdj, base)
    }
    const t = buildAssetRealTimelineByDocument(A, [invoice, ...adjustments])
    close(t.get('2026-01')!.byCurrency.USD.total, 900, 'la NC compensa la factura en Económico')
    close(t.get('2026-02')!.byCurrency.USD.total, 50)
  })

  test('sin póliza conocida: la factura es su propio período con el plazo de respaldo (12)', () => {
    const c = detectRenewalCycleByDocument(A, [doc({ issueDate: '2026-04-10', net: 800, alloc: [{ policyId: 'desconocida', pct: 100 }] })], [], NOW)
    assert.equal(c.cycleLengthMonths, 12)
    close(c.defaultNetUsd, 800)
    assert.equal(c.lastRenewalStartMonthKey, '2026-04')
  })

  test('coincidencia exacta: base × ciclo = suma de celdas proyectadas = total de fila (Trafic, Financiero)', () => {
    const policies = [policy('N-01', '2026-07-30', '2026-08-30')]
    const docs = [
      doc({ issueDate: '2026-07-30', net: 49_999.98, alloc: [{ policyId: 'N-01', pct: 50 }], installments: [inst('2026-08-02', 24_999.99), inst('2026-08-30', 20_000)] }),
      doc({ issueDate: '2026-08-10', net: 2000, alloc: [{ policyId: 'N-01', pct: 50 }], installments: [inst('2026-08-30', 1000), inst('2026-09-06', 1000)] }),
    ]
    const cycle = detectRenewalCycleByCuota(A, docs, policies, NOW)
    const base = resolveRowBase(cycle, null)
    const realTimeline = buildAssetRealTimelineByCuota(A, docs)
    const projected = projectAssetRow(cycle, NOW, '2027-10', base.netUsd!, base.vatUsd ?? 0, base.otherUsd ?? 0, 0)
    const row: RowProjectionInputs = { realTimeline, projectedByMonth: new Map(projected.map((c) => [c.monthKey, c])), netUsd: base.netUsd, vatUsd: base.vatUsd, otherUsd: base.otherUsd }
    const axis = ['2026-08', '2026-09', ...projected.map((c) => c.monthKey)]
    const [cells] = buildDisplayMatrix([row], axis, 'USD', null)
    const totals = sumDisplayCells(cells)
    close(totals.projected, 25_999.99 * projected.length, 'cada mes proyecta la renovación completa (ciclo de 1 mes)')
    close(totals.total, (12_499.995 + 10_000 + 500) + 500 + 25_999.99 * projected.length, 'real (agosto: 2 cuotas DOC-01 + 1 de N-01; septiembre: 1 de N-01) + proyectado')
    assert.ok(!cells.some((c, i) => c?.real && axis[i] >= NOW), 'en este caso no hay meses mixtos: lo real termina antes del mes actual')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// C1–C3: proyección por período, agrupación de facturas y trazabilidad
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verificación INDEPENDIENTE de projectAssetRow: libro mayor período por
 * período (k = …, -1, 0, 1, …), cada fracción en su mes real. Solo cuentan los
 * períodos que empiezan después del último real (o desde el ancla, sin
 * historial) y los meses entre `from` y `to`.
 */
function ledger(cycle: RenewalCycle, from: string, to: string, total: number, pct: number): Map<string, number> {
  const out = new Map<string, number>()
  const L = cycle.cycleLengthMonths
  for (let k = -300; k <= 300; k++) {
    const start = addMonthsToKey(cycle.lastRenewalStartMonthKey, k * L)
    const real = cycle.realLastRenewalStartMonthKey
    if (real !== null ? start <= real : k < 0) continue
    const n = real !== null ? Math.floor((monthsBetweenKeys(real, start) - 1) / L) + 1 : k
    for (const [off, share] of Object.entries(cycle.offsetShare)) {
      const m = addMonthsToKey(start, Number(off))
      if (m < from || m > to) continue
      out.set(m, (out.get(m) ?? 0) + total * Math.pow(1 + pct / 100, n) * share)
    }
  }
  return out
}

function assertMatchesLedger(cycle: RenewalCycle, from: string, to: string, total: number, pct = 0) {
  const expected = ledger(cycle, from, to, total, pct)
  const got = projectAssetRow(cycle, from, to, total, 0, 0, pct)
  assert.deepEqual(got.map((c) => c.monthKey), buildMonthRange(from, to), 'un valor por mes, desde `from`')
  for (const c of got) close(c.amountUsd, expected.get(c.monthKey) ?? 0, `mes ${c.monthKey}`)
}

/** Fila lista para matriz/Excel a partir de documentos reales (mismo armado que el hook). */
function rowFrom(docs: DocumentForFinancial[], policies: Policy[], mode: 'FIN' | 'ECO', to: string, name = 'Activo'): AssetRowData {
  const cycle = mode === 'FIN' ? detectRenewalCycleByCuota(A, docs, policies, NOW) : detectRenewalCycleByDocument(A, docs, policies, NOW)
  const realTimeline = mode === 'FIN' ? buildAssetRealTimelineByCuota(A, docs) : buildAssetRealTimelineByDocument(A, docs)
  const base = resolveRowBase(cycle, null)
  const projected = projectAssetRow(cycle, NOW, to, base.netUsd ?? 0, base.vatUsd ?? 0, base.otherUsd ?? 0, base.pct)
  return {
    assetId: A, name, code: 'X',
    realTimeline, projectedByMonth: new Map(projected.map((c) => [c.monthKey, c])),
    netUsd: base.netUsd, vatUsd: base.vatUsd, otherUsd: base.otherUsd, pct: base.pct,
    cycleLengthMonths: cycle.cycleLengthMonths, installmentsCount: 1, startMonthKey: cycle.lastRenewalStartMonthKey,
    baseStatus: cycle.baseStatus, projectionBlocked: base.projectionBlocked,
    periodInvoiceCount: cycle.periodInvoiceCount, outOfTermCount: cycle.outOfTermCount, outOfTermItems: cycle.outOfTermItems,
    ambiguousPeriodItems: cycle.ambiguousPeriodItems, allocationIssues: inconsistentAllocationsForAsset(A, docs),
    excludedAdjustments: [],
    concurrentPeriodsExcluded: cycle.concurrentPeriodsExcluded,
    isOverridden: false, hasLegacy: false, legacyPendingFields: [], override: null,
  }
}

const annual = () => [policy('P1', '2026-01-01', '2027-01-01')]
const monthlyInst = (fromMonth: string, n: number, amount: number, day = '10') =>
  Array.from({ length: n }, (_, i) => inst(`${addMonthsToKey(fromMonth, i)}-${day}`, amount))

describe('C1 · proyección por período (sin plegar, sin omitir, sin duplicar)', () => {
  test('1. Trafic: cada renovación mensual repite sus cuotas (incluida la del 06/09 fuera de vigencia) y suma la base completa', () => {
    const policies = [policy('N-01', '2026-07-30', '2026-08-30')]
    const docs = [
      doc({ number: 'DOC-01', issueDate: '2026-07-30', net: 49_999.98, alloc: [{ policyId: 'N-01', pct: 50 }], installments: [inst('2026-08-02', 24_999.99), inst('2026-08-30', 20_000)] }),
      doc({ number: 'N-01', issueDate: '2026-08-10', net: 2000, alloc: [{ policyId: 'N-01', pct: 50 }], installments: [inst('2026-08-30', 1000), inst('2026-09-06', 1000)] }),
    ]
    const c = detectRenewalCycleByCuota(A, docs, policies, NOW)
    assert.deepEqual(c.outOfTermItems, [{ documentNumber: 'N-01', date: '2026-09-06', kind: 'cuota' }])
    close(c.offsetShare[1] + c.offsetShare[2], 1)
    const p = projectAssetRow(c, NOW, '2027-10', c.defaultNetUsd!, 0, 0, 0)
    for (const cell of p) close(cell.amountUsd, 25_999.99, `mes ${cell.monthKey}: renovación completa`)
    assertMatchesLedger(c, NOW, '2028-12', 25_999.99)
  })

  test('2. cuota posterior a la vigencia: el período real no se vuelve a proyectar y la cuota tardía de cada renovación cae en su mes', () => {
    const d = doc({ number: 'F-13', issueDate: '2026-01-05', net: 1300, alloc: [{ policyId: 'P1', pct: 100 }], installments: [inst('2026-03-10', 1000), inst('2027-02-10', 300)] })
    const c = detectRenewalCycleByCuota(A, [d], annual(), NOW)
    const p = new Map(projectAssetRow(c, NOW, '2028-12', 1300, 0, 0, 0).map((x) => [x.monthKey, x.amountUsd]))
    assert.equal(p.get('2027-02'), 0, '2027-02 es la cuota REAL del período 2026: no se proyecta otra vez')
    close(p.get('2027-03'), 1000, 'renovación 2027: cuota de marzo')
    close(p.get('2028-02'), 300, 'renovación 2027: cuota tardía 13 meses después')
    close(p.get('2028-03'), 1000, 'renovación 2028')
    close([...p.values()].reduce((a, b) => a + b, 0), 1000 + 300 + 1000, 'dentro del horizonte: renovación 2027 completa + marzo de 2028')
    assertMatchesLedger(c, NOW, '2030-12', 1300)
  })

  test('3. Auto 02: el mes de la cuota tardía tiene real y proyectado como partes separadas (celda, totales, KPI y Excel)', async () => {
    const assets = Array.from({ length: 10 }, (_, i) => (i === 0 ? A : `flota-${i}`))
    const policies = [policy('AUTO-0102', '2026-08-12', '2026-09-13', assets)]
    const docs = [
      doc({ number: 'N-0101', issueDate: '2026-08-20', net: 20_000, alloc: assets.map((assetId) => ({ assetId, policyId: 'AUTO-0102', pct: 10 })), installments: [inst('2027-08-30', 20_000, 'USD', 1500, true)] }),
      doc({ number: 'N-0102', issueDate: '2026-08-21', net: 100_000, alloc: [{ policyId: 'AUTO-0102', pct: 100 }], installments: [inst('2026-09-06', 100_000)] }),
    ]
    const row = rowFrom(docs, policies, 'FIN', '2027-12', 'Auto 02')
    const axis = buildMonthRange('2026-09', '2027-12')
    const [cells] = buildDisplayMatrix([row], axis, 'USD', null)
    const aug = cells[axis.indexOf('2027-08')]!
    close(aug.real!.amounts!.total, 2000, 'real: la parte de N-0101')
    assert.equal(aug.real!.status, 'paid')
    close(aug.projected!.amounts!.total, 100_000, 'proyectado: renovación mensual')
    // Ningún mes desde noviembre queda vacío.
    for (const m of buildMonthRange(NOW, '2027-12')) assert.ok(cells[axis.indexOf(m)]?.projected, `mes ${m} con proyección`)

    const totals = sumRowTotals(cells)
    const projectedParts = cells.reduce((s, c) => s + (c?.projected?.amounts?.total ?? 0), 0)
    const realParts = cells.reduce((s, c) => s + (c?.real?.amounts?.total ?? 0), 0)
    close(totals.projected.total, projectedParts)
    close(totals.real.total, realParts)
    close(totals.all.total, projectedParts + realParts)
    close(totals.all.projected, projectedParts, 'el total combinado igual separa lo proyectado')
    close(sumDisplayCells(cells, 'projected').total, projectedParts, 'KPI = suma de partes proyectadas')

    const { buildRenewalProjectionExport } = await import('../../src/modules/insurance/renewal-projections/renewalProjectionExport')
    const xlsx = buildRenewalProjectionExport({ rows: [row], matrix: [cells], rowTotals: [totals], axis, breakdownFields: [], hideAssetPanel: true, horizonEndMonthKey: '2027-12', filenamePrefix: 'p' })
    const [header, realRow, projRow] = xlsx.rows
    const col = header.indexOf('2027-08')
    close(realRow[col] as number, 2000)
    close(projRow[col] as number, 100_000)
    close(realRow[header.length - 2] as number, realParts)
    close(projRow[header.length - 2] as number, projectedParts)
    assert.match(String(realRow[header.length - 1]), /Meses con importes reales y proyectados \(en filas separadas\)/)
    assert.match(String(realRow[header.length - 1]), /N-0101 · cuota vence 30\/08\/2027/)
  })

  test('4. sin doble proyección: el período real (y una renovación ya registrada) nunca se proyecta, aunque se edite el inicio', () => {
    // Renovación 2027 ya registrada con póliza nueva: lo próximo a proyectar es 2028.
    const policies = [policy('P-2026', '2026-01-01', '2027-01-01'), policy('P-2027', '2027-01-01', '2028-01-01')]
    const docs = [
      doc({ issueDate: '2026-01-05', net: 1200, alloc: [{ policyId: 'P-2026', pct: 100 }], installments: monthlyInst('2026-01', 12, 100) }),
      doc({ issueDate: '2026-12-20', net: 1200, alloc: [{ policyId: 'P-2027', pct: 100 }], installments: monthlyInst('2027-01', 12, 100) }),
    ]
    const c = detectRenewalCycleByCuota(A, docs, policies, NOW)
    assert.equal(c.realLastRenewalStartMonthKey, '2027-01')
    const p = projectAssetRow(c, NOW, '2028-12', 1200, 0, 0, 0)
    for (const x of p) {
      if (x.monthKey < '2028-01') assert.equal(x.amountUsd, 0, `${x.monthKey} pertenece a períodos registrados`)
      else close(x.amountUsd, 100)
    }
    // Inicio editado hacia atrás o hacia adelante: tampoco se vuelve a proyectar 2027.
    for (const start of ['2025-07', '2027-06']) {
      const eff = resolveEffectiveCycle(c, null, null, start)
      const firstProjected = projectAssetRow(eff, NOW, '2029-12', 1200, 0, 0, 0).find((x) => x.amountUsd > 0)!.monthKey
      assert.ok(firstProjected > '2027-01', `inicio ${start}: primer mes proyectado ${firstProjected}`)
      assertMatchesLedger(eff, NOW, '2029-12', 1200, 5)
    }
  })

  test('no se proyecta nada antes del mes actual; una renovación atrasada solo aporta sus meses desde hoy', () => {
    const d = doc({ issueDate: '2025-10-01', net: 1200, alloc: [{ policyId: 'Q', pct: 100 }], installments: monthlyInst('2025-10', 12, 100) })
    const c = detectRenewalCycleByCuota(A, [d], [policy('Q', '2025-10-01', '2026-10-01')], NOW)
    const p = projectAssetRow(c, NOW, '2027-12', 1200, 0, 0, 0)
    assert.equal(p[0].monthKey, NOW)
    close(p[0].amountUsd, 100, 'la renovación de 2026-10 (sin facturar) aporta noviembre')
    assertMatchesLedger(c, NOW, '2027-12', 1200)
  })

  test('8. pólizas de 1, 3, 6 y 12 meses: cada período aporta exactamente su base, en sus meses', () => {
    for (const months of [1, 3, 6, 12]) {
      const end = addMonthsToKey('2026-01', months) + '-01'
      const d = doc({ issueDate: '2026-01-02', net: 600 * months, alloc: [{ policyId: 'T', pct: 100 }], installments: monthlyInst('2026-01', months, 600) })
      const c = detectRenewalCycleByCuota(A, [d], [policy('T', '2026-01-01', end)], NOW)
      assert.equal(c.cycleLengthMonths, months)
      assertCycleSumsToBase(c)
      assertMatchesLedger(c, NOW, '2029-12', 600 * months, 3)
    }
  })

  test('9. factura consolidada: la suma de lo proyectado de todos los activos es la factura, sin duplicar', () => {
    const assets = [A, 'b', 'c', 'd']
    const d = doc({ number: 'FLOTA', issueDate: '2026-06-01', net: 4000, alloc: assets.map((assetId, i) => ({ assetId, policyId: 'F', pct: [40, 30, 20, 10][i] })), installments: monthlyInst('2026-06', 2, 2000) })
    const policies = [policy('F', '2026-06-01', '2026-12-01', assets)]
    let sum = 0
    for (const assetId of assets) {
      const c = detectRenewalCycleByCuota(assetId, [d], policies, NOW)
      sum += projectAssetRow(c, NOW, '2027-11', c.defaultNetUsd!, 0, 0, 0).reduce((s, x) => s + x.amountUsd, 0)
    }
    close(sum, 4000 * 2, 'renovaciones 2026-12 y 2027-06 de la factura completa')
  })

  test('7. cuota con fecha mal cargada (año equivocado): no cambia el período de la factura; se informa y no duplica', () => {
    const d = doc({ number: 'TYPO', issueDate: '2026-01-05', net: 1200, alloc: [{ policyId: 'P1', pct: 100 }], installments: [...monthlyInst('2026-01', 11, 100), inst('2028-12-10', 100)] })
    const c = detectRenewalCycleByCuota(A, [d], annual(), NOW)
    assert.equal(c.lastRenewalStartMonthKey, '2026-01')
    assert.deepEqual(c.ambiguousPeriodItems, [], 'la factura se emitió dentro de la vigencia: no es ambigua')
    assert.deepEqual(c.outOfTermItems, [{ documentNumber: 'TYPO', date: '2028-12-10', kind: 'cuota' }])
    close(c.offsetShare[35], 100 / 1200)
    assertCycleSumsToBase(c)
    assertMatchesLedger(c, NOW, '2031-12', 1200)
  })

  test('crecimiento por renovación (no por mes calendario): la cuota tardía lleva el % de SU renovación', () => {
    const d = doc({ issueDate: '2026-08-01', net: 1000, alloc: [{ policyId: 'M', pct: 100 }], installments: [inst('2026-08-10', 500), inst('2027-08-10', 500)] })
    const c = detectRenewalCycleByCuota(A, [d], [policy('M', '2026-08-01', '2026-09-01')], NOW)
    const p = new Map(projectAssetRow(c, NOW, '2027-09', 1000, 0, 0, 10).map((x) => [x.monthKey, x.amountUsd]))
    // 2027-09: renovación 13 (inicio 2027-09) + cola de la renovación 1 (inicio 2026-09).
    close(p.get('2027-09'), 500 * Math.pow(1.1, 13) + 500 * Math.pow(1.1, 1))
    assertMatchesLedger(c, NOW, '2028-12', 1000, 10)
  })
})

describe('C2 · agrupación de facturas por período', () => {
  const main = (installments = monthlyInst('2026-01', 12, 1000)) => doc({ number: 'PRINCIPAL', issueDate: '2026-01-05', net: 12_000, alloc: [{ policyId: 'P1', pct: 100 }], installments })

  test('5. complementaria en el último cuarto de la vigencia: mismo período, base sumada, sin renovación ficticia', () => {
    const comp = doc({ number: 'COMP', issueDate: '2026-10-15', net: 600, alloc: [{ policyId: 'P1', pct: 100 }], installments: monthlyInst('2026-11', 2, 300) })
    for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
      const c = detect(A, [main(), comp], annual(), NOW)
      assert.equal(c.lastRenewalStartMonthKey, '2026-01')
      assert.equal(c.periodInvoiceCount, 2)
      close(c.defaultNetUsd, 12_600)
      assert.deepEqual(c.ambiguousPeriodItems, [], 'las cuotas resuelven el período')
    }
  })

  test('5b. complementaria del último cuarto SIN cuotas: se informa como ambigua y queda en la vigencia que ya tiene facturas', () => {
    const comp = doc({ number: 'COMP-SC', issueDate: '2026-11-20', net: 600, alloc: [{ policyId: 'P1', pct: 100 }] })
    const c = detectRenewalCycleByDocument(A, [main(), comp], annual(), NOW)
    assert.equal(c.lastRenewalStartMonthKey, '2026-01')
    close(c.defaultNetUsd, 12_600)
    assert.deepEqual(c.ambiguousPeriodItems, [{ documentNumber: 'COMP-SC', date: '2026-11-20', kind: 'factura' }])
  })

  test('6a. facturación anticipada (2 y 5 meses antes) + complementaria: todo en la vigencia contractual', () => {
    for (const issueDate of ['2025-11-01', '2025-08-01']) {
      const adv = doc({ number: 'ANT', issueDate, net: 12_000, alloc: [{ policyId: 'P1', pct: 100 }], installments: monthlyInst('2026-01', 12, 1000) })
      const comp = doc({ number: 'COMP', issueDate: '2026-03-01', net: 600, alloc: [{ policyId: 'P1', pct: 100 }], installments: [inst('2026-03-10', 600)] })
      for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
        const c = detect(A, [adv, comp], annual(), NOW)
        assert.equal(c.lastRenewalStartMonthKey, '2026-01', `emitida ${issueDate}`)
        close(c.defaultNetUsd, 12_600)
        assert.deepEqual(c.ambiguousPeriodItems, [])
      }
    }
  })

  test('6b. facturación posterior al vencimiento sin cuotas: ambigua, queda con las facturas de su vigencia (no abre otra)', () => {
    const late = doc({ number: 'TARDIA', issueDate: '2027-01-20', net: 400, alloc: [{ policyId: 'P1', pct: 100 }] })
    const c = detectRenewalCycleByDocument(A, [main(), late], annual(), NOW)
    assert.equal(c.lastRenewalStartMonthKey, '2026-01')
    close(c.defaultNetUsd, 12_400)
    assert.deepEqual(c.ambiguousPeriodItems.map((i) => i.documentNumber), ['TARDIA'])
  })

  test('6c. misma póliza, próxima vigencia facturada por adelantado (fechas aún sin editar): las cuotas la llevan al período siguiente', () => {
    const next = doc({ number: 'SIGUIENTE', issueDate: '2026-12-01', net: 13_000, alloc: [{ policyId: 'P1', pct: 100 }], installments: monthlyInst('2027-01', 12, 13_000 / 12) })
    const c = detectRenewalCycleByCuota(A, [main(), next], annual(), NOW)
    assert.equal(c.lastRenewalStartMonthKey, '2027-01')
    close(c.defaultNetUsd, 13_000, 'la base es solo la nueva vigencia — no se suma la anterior')
    assert.deepEqual(c.ambiguousPeriodItems, [])
  })

  test('misma póliza con varios períodos y varias facturas por período (fechas de la 1ª vigencia)', () => {
    const docs = [0, 12, 24].flatMap((m) => [
      doc({ issueDate: `${addMonthsToKey('2024-01', m)}-03`, net: 1000, alloc: [{ policyId: 'P0', pct: 100 }], installments: [inst(`${addMonthsToKey('2024-01', m)}-10`, 1000)] }),
      doc({ issueDate: `${addMonthsToKey('2024-01', m + 6)}-03`, net: 500, alloc: [{ policyId: 'P0', pct: 100 }], installments: [inst(`${addMonthsToKey('2024-01', m + 6)}-10`, 500)] }),
    ])
    for (const detect of [detectRenewalCycleByCuota, detectRenewalCycleByDocument]) {
      const c = detect(A, docs, [policy('P0', '2024-01-01', '2025-01-01')], NOW)
      assert.equal(c.lastRenewalStartMonthKey, '2026-01')
      assert.equal(c.periodInvoiceCount, 2)
      close(c.defaultNetUsd, 1500)
    }
  })

  test('fechas de vigencia editadas: las facturas de la vigencia anterior no se mezclan con la nueva', () => {
    const docs = [
      doc({ issueDate: '2026-01-05', net: 10_000, alloc: [{ policyId: 'ED', pct: 100 }], installments: monthlyInst('2026-01', 10, 1000) }),
      doc({ issueDate: '2027-01-05', net: 12_000, alloc: [{ policyId: 'ED', pct: 100 }], installments: monthlyInst('2027-01', 12, 1000) }),
    ]
    const c = detectRenewalCycleByCuota(A, docs, [policy('ED', '2027-01-01', '2028-01-01')], NOW)
    assert.equal(c.lastRenewalStartMonthKey, '2027-01')
    close(c.defaultNetUsd, 12_000)
  })
})

describe('C3 · trazabilidad y asignaciones incoherentes', () => {
  test('detecta % ≠ importe (A-001); respeta el signo de las NC y los redondeos', () => {
    const docs = [
      doc({ number: 'A-001', issueDate: '2026-07-14', net: 123_000_000, currency: 'ARS', alloc: [{ policyId: 'X', pct: 60, amount: 0.03 }] }),
      doc({ number: 'NC-1', type: 'CREDIT_NOTE', issueDate: '2026-07-20', net: 1000, alloc: [{ policyId: 'X', pct: 60, amount: -600 }] }),
      doc({ number: 'RED', issueDate: '2026-07-21', net: 300, alloc: [{ policyId: 'X', pct: 33.333333, amount: 100 }] }),
      doc({ number: 'OK', issueDate: '2026-07-22', net: 1000, alloc: [{ policyId: 'X', pct: 50, amount: 500 }, { assetId: 'otro', policyId: 'X', pct: 50, amount: 1 }] }),
    ]
    const issues = inconsistentAllocationsForAsset(A, docs)
    assert.deepEqual(issues.map((i) => i.documentNumber), ['A-001'])
    close(issues[0].storedPercentage, 60)
    assert.ok(issues[0].impliedPercentage < 0.001)
    assert.deepEqual(inconsistentAllocationsForAsset('otro', docs).map((i) => i.documentNumber), ['OK'], 'solo la asignación incoherente de ese activo')
  })

  test('la asignación incoherente no se corrige: Financiero usa el %, Económico el importe (se informa la diferencia)', () => {
    const d = doc({ number: 'A-001', issueDate: '2026-01-05', net: 1000, alloc: [{ policyId: 'P1', pct: 60, amount: 0.03 }], installments: [inst('2026-01-10', 1000)] })
    close(detectRenewalCycleByCuota(A, [d], annual(), NOW).defaultNetUsd, 600)
    close(detectRenewalCycleByDocument(A, [d], annual(), NOW).defaultNetUsd, 0.03)
    const row = rowFrom([d], annual(), 'FIN', '2027-12')
    assert.equal(row.allocationIssues.length, 1)
  })

  test('10. coherencia matriz = totales de fila = KPI = Excel (filas Real/Proyectado), con breakdown', async () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const docs = [doc({ number: 'F', issueDate: '2026-01-05', net: 1000, vat: 210, alloc: [{ policyId: 'ANUAL', pct: 100 }], installments: [inst('2026-02-10', 605, 'USD', 1500, true), inst('2027-02-10', 605)] })]
    const rows = [rowFrom(docs, policies, 'FIN', '2028-12', 'Uno'), rowFrom(docs, policies, 'ECO', '2028-12', 'Dos')]
    const axis = buildMonthRange('2026-01', '2028-12')
    // Las proyecciones se muestran y exportan solo en USD.
    for (const currency of ['USD'] as const) {
      const matrix = buildDisplayMatrix(rows, axis, currency, null)
      const rowTotals = matrix.map((cells) => sumRowTotals(cells))
      const kpi = sumDisplayCells(matrix.flat(), 'projected')
      close(kpi.total, rowTotals.reduce((s, t) => s + t.projected.total, 0), 'KPI = Σ totales proyectados de fila')
      const { buildRenewalProjectionExport } = await import('../../src/modules/insurance/renewal-projections/renewalProjectionExport')
      const xlsx = buildRenewalProjectionExport({ rows, matrix, rowTotals, axis, breakdownFields: ['net', 'vat', 'total'], hideAssetPanel: false, horizonEndMonthKey: '2028-12', filenamePrefix: 'p' })
      const [, ...data] = xlsx.rows
      assert.equal(data.length, 4)
      const header = xlsx.rows[0]
      const totalCols = header.length - 4 // Neto, IVA, Total + Observaciones
      for (const [i, r] of data.entries()) {
        const kind = i % 2 === 0 ? 'real' : 'projected'
        const t = rowTotals[Math.floor(i / 2)][kind]
        close(r[totalCols] as number, t.net)
        close(r[totalCols + 1] as number, t.vat)
        close(r[totalCols + 2] as number, t.total)
        // Σ de las celdas mensuales «Total» de la fila del Excel = total de la fila.
        const monthTotals = axis.map((_, m) => r[totalCols - axis.length * 3 + m * 3 + 2] as number)
        close(monthTotals.reduce((a, b) => a + b, 0), t.total, `${currency} ${kind}`)
      }
      close(data.filter((_, i) => i % 2 === 1).reduce((s, r) => s + (r[totalCols + 2] as number), 0), kpi.total, 'Excel proyectado = KPI')
    }
  })

  test('trazabilidad: fuera de vigencia y ambiguo identifican comprobante y fecha', () => {
    const c = detectRenewalCycleByCuota(A, [doc({ number: 'X-1', issueDate: '2026-01-05', net: 100, alloc: [{ policyId: 'P1', pct: 100 }], installments: [inst('2027-03-01', 100)] })], annual(), NOW)
    assert.deepEqual(c.outOfTermItems, [{ documentNumber: 'X-1', date: '2027-03-01', kind: 'cuota' }])
    const e = detectRenewalCycleByDocument(A, [doc({ number: 'E-1', issueDate: '2025-12-20', net: 100, alloc: [{ policyId: 'P1', pct: 100 }] })], annual(), NOW)
    assert.deepEqual(e.outOfTermItems, [{ documentNumber: 'E-1', date: '2025-12-20', kind: 'emisión' }])
  })

  test('celda mixta: cellParts devuelve real y proyectado sin fusionarlos', () => {
    const cell: DisplayCell = {
      real: { isReal: true, status: 'paid', amounts: { total: 10, net: 10, vat: 0, other: 0 }, excludedNative: { ARS: 0, USD: 0 }, incomplete: false },
      projected: { isReal: false, status: 'projected', amounts: { total: 5, net: 5, vat: 0, other: 0 }, excludedNative: { ARS: 0, USD: 0 }, incomplete: false },
    }
    const t = sumRowTotals([cell, null])
    assert.equal(t.real.total, 10)
    assert.equal(t.projected.total, 5)
    assert.equal(t.all.paid, 10)
    assert.equal(t.all.projected, 5)
    assert.equal(t.all.cellCount, 2)
  })
})
