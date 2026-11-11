import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectRenewalCycleByCuota,
  detectRenewalCycleByDocument,
  buildAssetRealTimelineByCuota,
  buildAssetRealTimelineByDocument,
  projectAssetRow,
  projectionStartMonthKey,
  resolveRowBase,
  baseTotalUsd,
  buildDisplayMatrix,
  sumDisplayCells,
  addMonthsToKey,
  type RenewalCycle,
  type RowProjectionInputs,
} from '../../src/shared/utils/renewalProjectionCalc'
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
    id: `doc-${seq}`, documentType: p.type ?? 'INVOICE', documentStatus: 'ISSUED', documentNumber: p.number ?? `N-${seq}`,
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

  test('el vencimiento anómalo de 2027-08 solo corre el inicio de SU fila', () => {
    const t02 = buildAssetRealTimelineByCuota(A, [consolidated(), own()])
    const tOther = buildAssetRealTimelineByCuota('x', [doc({ issueDate: '2026-07-01', net: 500, alloc: [{ assetId: 'x', policyId: 'P', pct: 100 }], installments: [inst('2026-07-10', 500)] })])
    assert.equal(projectionStartMonthKey(t02, NOW), '2027-09')
    assert.equal(projectionStartMonthKey(tOther, NOW), NOW, 'la otra fila proyecta desde el mes actual')
    assert.equal(projectionStartMonthKey(new Map(), NOW), NOW)
    // Nunca se superpone: el inicio es posterior al último mes real de la fila.
    for (const k of t02.keys()) assert.ok(k < projectionStartMonthKey(t02, NOW))
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

  test('cuotas posteriores a la vigencia: se pliegan dentro del ciclo (sin pérdida) y se informan', () => {
    const policies = [policy('ANUAL', '2026-01-01', '2027-01-01')]
    const d = doc({ issueDate: '2026-01-05', net: 1300, alloc: [{ policyId: 'ANUAL', pct: 100 }],
      installments: [inst('2026-03-10', 1000), inst('2027-02-10', 300)] })
    const c = detectRenewalCycleByCuota(A, [d], policies, NOW)
    assert.equal(c.outOfTermCount, 1)
    close(c.originalShare[2], 1000 / 1300)
    close(c.originalShare[1], 300 / 1300, 'la cuota de 2027-02 (posición 13) cae en la posición 1 del ciclo')
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
    const from = projectionStartMonthKey(realTimeline, NOW)
    const projected = projectAssetRow(cycle, from, '2027-10', base.netUsd!, base.vatUsd ?? 0, base.otherUsd ?? 0, 0)
    const row: RowProjectionInputs = { realTimeline, projectedByMonth: new Map(projected.map((c) => [c.monthKey, c])), netUsd: base.netUsd, vatUsd: base.vatUsd, otherUsd: base.otherUsd }
    const axis = ['2026-08', '2026-09', ...projected.map((c) => c.monthKey)]
    const [cells] = buildDisplayMatrix([row], axis, 'USD', null)
    const totals = sumDisplayCells(cells)
    close(totals.projected, 25_999.99 * projected.length, 'cada mes proyecta la renovación completa (ciclo de 1 mes)')
    close(totals.total, (12_499.995 + 10_000 + 500) + 500 + 25_999.99 * projected.length, 'real (agosto: 2 cuotas DOC-01 + 1 de N-01; septiembre: 1 de N-01) + proyectado, sin superposición')
    assert.ok(!cells.some((c, i) => c?.isReal && axis[i] >= from), 'ningún mes proyectado coincide con uno real')
  })
})
