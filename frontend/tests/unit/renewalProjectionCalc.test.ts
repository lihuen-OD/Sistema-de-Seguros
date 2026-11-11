import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  closureIn,
  buildAssetRealTimelineByCuota,
  buildAssetRealTimelineByDocument,
  detectRenewalCycleByCuota,
  detectRenewalCycleByDocument,
  resolveEffectiveCycle,
  resolveRowBase,
  projectAssetRow,
  convertibleLegacyFields,
  hasLegacyValues,
  hasCurrentOverrides,
  buildDisplayMatrix,
  resolveDisplayCell,
  sumDisplayCells,
  currentRateIssue,
  usableCurrentRate,
  usdIn,
  parseManualRate,
  type RenewalCycle,
  type RenewalOverrideValues,
  type RowProjectionInputs,
} from '../../src/shared/utils/renewalProjectionCalc'
import type { DocumentForFinancial } from '../../src/shared/api/documents.api'
import type { Currency, Installment } from '../../src/shared/types'
import type { AssetRowData } from '../../src/modules/insurance/renewal-projections/RenewalProjectionTable'

// Base USD de la proyección de renovaciones (Financiero por cuota / Económico
// por documento). Los asserts comparan VALORES numéricos, no solo símbolos.

const A = 'asset-a'
const B = 'asset-b'
const NOW = '2026-11'

function close(actual: number | null | undefined, expected: number, msg?: string) {
  assert.ok(actual !== null && actual !== undefined, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg ?? 'valor'}: esperaba ${expected}, llegó ${actual}`)
}

let seq = 0

function inst(p: { dueDate: string; amount: number; currency?: Currency; amountArs?: number | null; amountUsd?: number | null; paid?: boolean }): Installment {
  seq += 1
  return {
    id: `inst-${seq}`,
    accountingDocumentId: 'doc',
    installmentNumber: seq,
    dueDate: p.dueDate,
    amount: p.amount,
    currency: p.currency ?? 'ARS',
    amountArs: p.amountArs === undefined ? null : p.amountArs,
    amountUsd: p.amountUsd === undefined ? null : p.amountUsd,
    paymentStatus: p.paid ? 'PAID' : 'PENDING',
    paidAt: null,
    paymentMethod: null,
  } as Installment
}

interface DocInput {
  type?: string
  issueDate: string
  currency: Currency
  net: number
  vat?: number
  other?: number
  /** ARS por USD — se usa para cerrar la otra moneda como lo hace computeDualAmounts. */
  rate: number
  /** Pisa el cierre calculado (para simular datos viejos / nulos). */
  totalArs?: number | null
  totalUsd?: number | null
  allocations?: { assetId: string; pct: number; amount?: number }[]
  installments?: Installment[]
}

function doc(p: DocInput): DocumentForFinancial {
  seq += 1
  const vat = p.vat ?? 0
  const other = p.other ?? 0
  const total = p.net + vat + other
  const computedArs = p.currency === 'ARS' ? total : total * p.rate
  const computedUsd = p.currency === 'USD' ? total : p.rate > 0 ? total / p.rate : 0
  return {
    id: `doc-${seq}`,
    documentType: p.type ?? 'INVOICE',
    documentStatus: 'ISSUED',
    documentNumber: `N-${seq}`,
    issueDate: p.issueDate,
    currency: p.currency,
    exchangeRate: p.rate,
    netAmount: p.net,
    vatAmount: vat,
    otherTaxesAmount: other,
    totalAmount: total,
    totalAmountArs: p.totalArs === undefined ? computedArs : p.totalArs,
    totalAmountUsd: p.totalUsd === undefined ? computedUsd : p.totalUsd,
    paymentStatus: 'PENDING',
    installments: p.installments ?? [],
    allocations: (p.allocations ?? [{ assetId: A, pct: 100 }]).map((a, i) => ({
      id: `al-${seq}-${i}`,
      accountingDocumentId: `doc-${seq}`,
      policyAssetCoverageId: `cov-${i}`,
      policyId: 'pol',
      assetId: a.assetId,
      allocationPercentage: a.pct,
      allocatedAmount: a.amount ?? (total * a.pct) / 100,
    })),
  } as unknown as DocumentForFinancial
}

function noOverride(): RenewalOverrideValues {
  return {
    netOverride: null, vatOverride: null, otherOverride: null, growthPercentOverride: null,
    netOverrideUsd: null, vatOverrideUsd: null, otherOverrideUsd: null, growthPercentUsdOverride: null,
    cycleLengthMonthsOverride: null, installmentsCountOverride: null, startMonthOverride: null,
    legacyConvertedAt: null,
  }
}

function annualCycle(start = '2026-01'): RenewalCycle {
  return {
    cycleLengthMonths: 12,
    originalShare: { 0: 1 },
    lastRenewalStartMonthKey: start,
    baseStatus: 'OK',
    defaultNetUsd: 1000,
    defaultVatUsd: 0,
    defaultOtherUsd: 0,
  }
}

function projectedValues(cells: { monthKey: string; amountUsd: number }[], months: string[]) {
  const byMonth = new Map(cells.map((c) => [c.monthKey, c.amountUsd]))
  return months.map((m) => byMonth.get(m) ?? 0)
}

// ── 1-2. Base USD desde documentos ARS y USD ────────────────────────────────

describe('base USD de la última renovación', () => {
  test('1. documento en ARS: usa SU cierre histórico (TC 1000), no el TC actual', () => {
    const d = doc({ issueDate: '2026-01-10', currency: 'ARS', net: 1_000_000, vat: 210_000, rate: 1000 })
    for (const cycle of [detectRenewalCycleByDocument(A, [d], [], NOW), detectRenewalCycleByCuota(A, [{ ...d, installments: [inst({ dueDate: '2026-01-20', amount: 1_210_000, amountArs: 1_210_000, amountUsd: 1210 })] }], [], NOW)]) {
      assert.equal(cycle.baseStatus, 'OK')
      close(cycle.defaultNetUsd, 1000, 'neto USD')
      close(cycle.defaultVatUsd, 210, 'IVA USD')
      close(cycle.defaultOtherUsd, 0, 'otros USD')
    }
  })

  test('2. documento en USD: la base es el importe nativo', () => {
    const d = doc({ issueDate: '2026-02-01', currency: 'USD', net: 1000, vat: 210, other: 15, rate: 1100 })
    const cycle = detectRenewalCycleByDocument(A, [d], [], NOW)
    assert.equal(cycle.baseStatus, 'OK')
    close(cycle.defaultNetUsd, 1000)
    close(cycle.defaultVatUsd, 210)
    close(cycle.defaultOtherUsd, 15)
  })

  test('3. TC históricos distintos: cada celda real USD usa su propio cierre; la base sale de la última', () => {
    const d1 = doc({ issueDate: '2025-01-05', currency: 'ARS', net: 960_000, rate: 800 }) // USD 1200
    const d2 = doc({ issueDate: '2026-01-05', currency: 'ARS', net: 1_440_000, rate: 1200 }) // USD 1200
    const timeline = buildAssetRealTimelineByDocument(A, [d1, d2])
    close(timeline.get('2025-01')!.byCurrency.USD.total, 1200)
    close(timeline.get('2026-01')!.byCurrency.USD.total, 1200)
    close(timeline.get('2025-01')!.byCurrency.ARS.total, 960_000)
    close(timeline.get('2026-01')!.byCurrency.ARS.total, 1_440_000)

    const cycle = detectRenewalCycleByDocument(A, [d1, d2], [], NOW)
    close(cycle.defaultNetUsd, 1200)
    assert.equal(cycle.cycleLengthMonths, 12)
    // Sin % automático: en pesos creció 50 %, pero la proyección parte de 0 %.
    assert.equal(resolveRowBase(cycle, null).pct, 0)
    assert.ok(!('autoGrowthPercent' in cycle))
  })

  test('11. activo con varias facturas y flota 60/40: cada activo toma su porción en USD', () => {
    const fleet = doc({
      issueDate: '2026-03-01', currency: 'ARS', net: 2_000_000, vat: 420_000, rate: 1210,
      allocations: [{ assetId: A, pct: 60 }, { assetId: B, pct: 40 }],
    }) // total USD 2000
    const older = doc({ issueDate: '2025-03-01', currency: 'USD', net: 5000, rate: 1000, allocations: [{ assetId: A, pct: 100 }] })
    const a = detectRenewalCycleByDocument(A, [older, fleet], [], NOW)
    const b = detectRenewalCycleByDocument(B, [fleet], [], NOW)
    close(a.defaultNetUsd, (2_000_000 / 1210) * 0.6)
    close(a.defaultVatUsd, (420_000 / 1210) * 0.6)
    close(b.defaultNetUsd, (2_000_000 / 1210) * 0.4)
    const fa = detectRenewalCycleByCuota(A, [{ ...fleet, installments: [inst({ dueDate: '2026-03-10', amount: 2_420_000, amountArs: 2_420_000, amountUsd: 2000 })] }], [], NOW)
    close(fa.defaultNetUsd, (2_000_000 / 1210) * 0.6)
  })
})

// ── 4. Tipos de cambio faltantes, cero o inválidos ──────────────────────────

describe('cierres no confiables', () => {
  test('closureIn: nativa siempre confiable; la otra exige un TC implícito > 1', () => {
    const base = { currency: 'ARS' as Currency, amount: 1000 }
    close(closureIn({ ...base, amountArs: 1000, amountUsd: 1 }, 'USD'), 1) // TC 1000
    assert.equal(closureIn({ ...base, amountArs: 1000, amountUsd: 1000 }, 'USD'), null) // TC 1 por default
    assert.equal(closureIn({ ...base, amountArs: 1000, amountUsd: null }, 'USD'), null) // nulo (TC 0 en el backfill)
    assert.equal(closureIn({ ...base, amountArs: 1000, amountUsd: 0 }, 'USD'), null) // 0 con importe ≠ 0
    assert.equal(closureIn({ ...base, amountArs: 1000, amountUsd: Number.NaN }, 'USD'), null)
    assert.equal(closureIn({ ...base, amountArs: 1000, amountUsd: 2000 }, 'USD'), null) // TC 0,5
    close(closureIn({ ...base, amountArs: 1000, amountUsd: 1000 }, 'ARS'), 1000) // la nativa no depende del TC
    close(closureIn({ currency: 'USD', amount: 50, amountArs: null, amountUsd: null }, 'USD'), 50)
    close(closureIn({ currency: 'ARS', amount: 0, amountArs: 0, amountUsd: 0 }, 'USD'), 0)
    // NC con importes negativos: se compara en valor absoluto.
    close(closureIn({ currency: 'ARS', amount: -1000, amountArs: -1000, amountUsd: -1 }, 'USD'), -1)
  })

  for (const [label, totalUsd] of [['TC 1 por default', 1_210_000], ['cierre USD nulo', null], ['cierre USD 0', 0]] as const) {
    test(`4. ${label}: base UNRELIABLE_FX, sin proyección, el ARS nativo sigue visible y no se suma en USD`, () => {
      const d = doc({ issueDate: '2026-01-10', currency: 'ARS', net: 1_000_000, vat: 210_000, rate: 1, totalUsd })
      const cycle = detectRenewalCycleByDocument(A, [d], [], NOW)
      assert.equal(cycle.baseStatus, 'UNRELIABLE_FX')
      assert.equal(cycle.defaultNetUsd, null)
      const base = resolveRowBase(cycle, null)
      assert.equal(base.projectionBlocked, true)

      const timeline = buildAssetRealTimelineByDocument(A, [d])
      const cell = timeline.get('2026-01')!
      assert.equal(cell.byCurrency.USD.total, 0)
      assert.equal(cell.byCurrency.USD.excludedCount, 1)
      close(cell.byCurrency.USD.excludedNative.ARS, 1_210_000)
      close(cell.byCurrency.ARS.total, 1_210_000)
      assert.equal(cell.byCurrency.ARS.excludedCount, 0)

      const row: RowProjectionInputs = { realTimeline: timeline, projectedByMonth: new Map(), netUsd: null, vatUsd: null, otherUsd: null }
      // 16. En USD se muestra en moneda nativa, marcado incompleto — nunca convertido.
      const usd = resolveDisplayCell(row, '2026-01', 'USD', 1400)!
      assert.equal(usd.amounts, null)
      assert.equal(usd.incomplete, true)
      close(usd.excludedNative.ARS, 1_210_000)
      const ars = resolveDisplayCell(row, '2026-01', 'ARS', 1400)!
      close(ars.amounts!.total, 1_210_000)
      assert.equal(ars.incomplete, false)
      const totals = sumDisplayCells([usd])
      assert.equal(totals.total, 0)
      assert.equal(totals.incomplete, true)
      close(totals.excludedNative.ARS, 1_210_000)
    })
  }

  test('4b. con un Neto USD manual la fila sin TC confiable vuelve a proyectar (IVA/Otros sin cargar = 0)', () => {
    const d = doc({ issueDate: '2026-01-10', currency: 'ARS', net: 1_000_000, rate: 1, totalUsd: 1_000_000 })
    const cycle = detectRenewalCycleByDocument(A, [d], [], NOW)
    const base = resolveRowBase(cycle, { ...noOverride(), netOverrideUsd: 800 })
    assert.equal(base.projectionBlocked, false)
    close(base.netUsd, 800)
    assert.equal(base.vatUsd, null)
    const projected = projectAssetRow(cycle, '2026-02', '2027-01', base.netUsd!, base.vatUsd ?? 0, base.otherUsd ?? 0, base.pct)
    assert.deepEqual(projectedValues(projected, ['2027-01']), [800])
  })

  test('cuota pagada con TC del día de pago: se usa ese cierre; una cuota pendiente con TC 1 se excluye en USD', () => {
    const d = doc({
      issueDate: '2026-01-01', currency: 'ARS', net: 2_000_000, rate: 1,
      installments: [
        inst({ dueDate: '2026-01-15', amount: 1_000_000, amountArs: 1_000_000, amountUsd: 800, paid: true }), // TC pago 1250
        inst({ dueDate: '2026-02-15', amount: 1_000_000, amountArs: 1_000_000, amountUsd: 1_000_000 }), // TC heredado 1
      ],
    })
    const t = buildAssetRealTimelineByCuota(A, [d])
    close(t.get('2026-01')!.byCurrency.USD.total, 800)
    close(t.get('2026-01')!.byCurrency.USD.paid, 800)
    assert.equal(t.get('2026-02')!.byCurrency.USD.total, 0)
    assert.equal(t.get('2026-02')!.byCurrency.USD.excludedCount, 1)
    close(t.get('2026-02')!.byCurrency.ARS.pending, 1_000_000)
  })
})

// ── 5-7. Porcentaje y crecimiento compuesto por ciclo ────────────────────────

describe('proyección USD con % por ciclo', () => {
  const months = ['2027-01', '2028-01', '2029-01']

  test('5. 0 %: USD 1.000, 1.000, 1.000', () => {
    const p = projectAssetRow(annualCycle(), '2026-02', '2029-12', 1000, 0, 0, 0)
    assert.deepEqual(projectedValues(p, months), [1000, 1000, 1000])
  })

  test('6. +10 %: 1.100, 1.210, 1.331 — y −10 %: 900, 810, 729', () => {
    const up = projectedValues(projectAssetRow(annualCycle(), '2026-02', '2029-12', 1000, 0, 0, 10), months)
    ;[1100, 1210, 1331].forEach((v, i) => close(up[i], v))
    const down = projectedValues(projectAssetRow(annualCycle(), '2026-02', '2029-12', 1000, 0, 0, -10), months)
    ;[900, 810, 729].forEach((v, i) => close(down[i], v))
  })

  test('7. cuotas editadas: el crecimiento es compuesto por CICLO, no por mes', () => {
    const cycle = resolveEffectiveCycle(annualCycle(), null, 2, null)
    assert.deepEqual(cycle.originalShare, { 0: 0.5, 6: 0.5 })
    const p = projectedValues(projectAssetRow(cycle, '2026-02', '2028-12', 1000, 0, 0, 10), ['2026-07', '2027-01', '2027-07', '2028-01', '2028-07'])
    ;[500, 550, 550, 605, 605].forEach((v, i) => close(p[i], v))
  })

  test('el % vigente es growthPercentUsdOverride ?? 0 — el % anterior (pesos) nunca se aplica', () => {
    const cycle = annualCycle()
    assert.equal(resolveRowBase(cycle, { ...noOverride(), growthPercentOverride: 85 }).pct, 0)
    assert.equal(resolveRowBase(cycle, { ...noOverride(), growthPercentOverride: 85, growthPercentUsdOverride: 4 }).pct, 4)
  })
})

// ── 8-10. Financiero por cuota / Económico por documento / NC-ND ────────────

describe('Financiero vs Económico', () => {
  test('8. Financiero: reparto desparejo desde el importe NATIVO, pagado/pendiente por moneda, Neto+IVA+Otros = Total', () => {
    const d = doc({
      issueDate: '2026-01-01', currency: 'ARS', net: 800_000, vat: 168_000, other: 32_000, rate: 1000,
      installments: [
        inst({ dueDate: '2026-01-10', amount: 600_000, amountArs: 600_000, amountUsd: 480, paid: true }), // pagada a TC 1250
        inst({ dueDate: '2026-05-10', amount: 300_000, amountArs: 300_000, amountUsd: 300 }),
        inst({ dueDate: '2026-09-10', amount: 100_000, amountArs: 100_000, amountUsd: 100 }),
      ],
    })
    const cycle = detectRenewalCycleByCuota(A, [d], [], NOW)
    assert.equal(cycle.lastRenewalStartMonthKey, '2026-01')
    close(cycle.originalShare[0], 0.6)
    close(cycle.originalShare[4], 0.3)
    close(cycle.originalShare[8], 0.1)
    // Base: cierre del DOCUMENTO (TC 1000), no el de las cuotas pagadas.
    close(cycle.defaultNetUsd, 800)

    const t = buildAssetRealTimelineByCuota(A, [d])
    const jan = t.get('2026-01')!
    assert.equal(jan.hasPaymentStatus, true)
    close(jan.byCurrency.USD.total, 480)
    close(jan.byCurrency.USD.paid, 480)
    close(jan.byCurrency.USD.pending, 0)
    close(jan.byCurrency.ARS.paid, 600_000)
    for (const cur of ['ARS', 'USD'] as Currency[]) {
      for (const month of ['2026-01', '2026-05', '2026-09']) {
        const c = t.get(month)!.byCurrency[cur]
        close(c.net + c.vat + c.other, c.total, `${cur} ${month} desglose`)
      }
    }
    close(t.get('2026-05')!.byCurrency.USD.net, 300 * 0.8)

    const row: RowProjectionInputs = { realTimeline: t, projectedByMonth: new Map(), netUsd: 800, vatUsd: 168, otherUsd: 32 }
    assert.equal(resolveDisplayCell(row, '2026-01', 'USD', null)!.status, 'paid')
    assert.equal(resolveDisplayCell(row, '2026-05', 'USD', null)!.status, 'pending')
  })

  test('9. Económico: reconocido en el mes de emisión, sin estado de cobro', () => {
    const d = doc({ issueDate: '2026-04-20', currency: 'USD', net: 1000, vat: 210, rate: 1000, installments: [inst({ dueDate: '2026-07-01', amount: 1210, currency: 'USD', amountArs: 1_210_000, amountUsd: 1210 })] })
    const t = buildAssetRealTimelineByDocument(A, [d])
    assert.deepEqual([...t.keys()], ['2026-04'])
    const cell = t.get('2026-04')!
    assert.equal(cell.hasPaymentStatus, false)
    close(cell.byCurrency.USD.total, 1210)
    close(cell.byCurrency.ARS.total, 1_210_000)
    const row: RowProjectionInputs = { realTimeline: t, projectedByMonth: new Map(), netUsd: 1000, vatUsd: 210, otherUsd: 0 }
    assert.equal(resolveDisplayCell(row, '2026-04', 'ARS', null)!.status, 'recognized')
  })

  test('10. NC negativa compensa en Económico; la ND suma; la base sigue siendo la factura', () => {
    const invoice = doc({ issueDate: '2026-03-01', currency: 'USD', net: 1000, vat: 210, rate: 1000 })
    const nc = doc({ type: 'CREDIT_NOTE', issueDate: '2026-03-15', currency: 'USD', net: 210, rate: 1000, allocations: [{ assetId: A, pct: 100, amount: -210 }] })
    const nd = doc({ type: 'DEBIT_NOTE', issueDate: '2026-04-02', currency: 'ARS', net: 50_000, rate: 1000 })
    const t = buildAssetRealTimelineByDocument(A, [invoice, nc, nd])
    close(t.get('2026-03')!.byCurrency.USD.total, 1000)
    close(t.get('2026-04')!.byCurrency.USD.total, 50)
    const cycle = detectRenewalCycleByDocument(A, [invoice, nc, nd], [], NOW)
    close(cycle.defaultNetUsd, 1000)
  })

  test('10b. Financiero: una NC aplicada ya está en las cuotas de la factura; un documento sin cuotas no aporta', () => {
    const invoice = doc({
      issueDate: '2026-03-01', currency: 'USD', net: 1000, vat: 210, rate: 1000,
      // Cuota ya ajustada por la NC aplicada (1210 − 210).
      installments: [inst({ dueDate: '2026-03-20', amount: 1000, currency: 'USD', amountArs: 1_000_000, amountUsd: 1000 })],
    })
    const nc = doc({ type: 'CREDIT_NOTE', issueDate: '2026-03-15', currency: 'USD', net: 210, rate: 1000 })
    const t = buildAssetRealTimelineByCuota(A, [invoice, nc])
    assert.deepEqual([...t.keys()], ['2026-03'])
    close(t.get('2026-03')!.byCurrency.USD.total, 1000)
  })
})

// ── 12. Overrides anteriores en ARS ─────────────────────────────────────────

describe('overrides anteriores (histórico protegido)', () => {
  const cycle = annualCycle()

  test('12. Neto/IVA en ARS sin convertir: no se aplican, la fila usa el automático y quedan pendientes', () => {
    const o = { ...noOverride(), netOverride: 1_500_000, vatOverride: 315_000, growthPercentOverride: 85 }
    const base = resolveRowBase(cycle, o)
    close(base.netUsd, 1000) // automático, NO 1.500.000 reinterpretado como USD
    assert.equal(base.pct, 0)
    assert.deepEqual(convertibleLegacyFields(o), ['net', 'vat'])
    assert.equal(hasLegacyValues(o), true)
    assert.equal(hasCurrentOverrides(o), false) // nada que "Volver al automático" deba limpiar
  })

  test('12b. un USD ya cargado no es convertible (no se pisa); tras convertir, se usa el USD y no queda pendiente', () => {
    const manual = { ...noOverride(), netOverride: 1_500_000, vatOverride: 315_000, netOverrideUsd: 1300 }
    assert.deepEqual(convertibleLegacyFields(manual), ['vat'])
    close(resolveRowBase(cycle, manual).netUsd, 1300)

    const converted = { ...manual, vatOverrideUsd: 262.5, legacyConvertedAt: '2026-11-10T12:00:00.000Z' }
    assert.deepEqual(convertibleLegacyFields(converted), [])
    close(resolveRowBase(cycle, converted).vatUsd, 262.5)
    assert.equal(hasLegacyValues(converted), true)
    assert.equal(hasCurrentOverrides(converted), true)
  })
})

// ── 13-15. Selector ARS/USD, totales y TC actual ────────────────────────────

describe('presentación ARS/USD', () => {
  function sampleRow(): RowProjectionInputs {
    const d1 = doc({ issueDate: '2026-01-05', currency: 'ARS', net: 1_000_000, vat: 210_000, rate: 1000 })
    const legacy = doc({ issueDate: '2025-06-05', currency: 'ARS', net: 500_000, rate: 1, totalUsd: 500_000 })
    const realTimeline = buildAssetRealTimelineByDocument(A, [legacy, d1])
    const projected = projectAssetRow(annualCycle(), '2026-02', '2027-12', 1000, 210, 0, 0)
    return { realTimeline, projectedByMonth: new Map(projected.map((c) => [c.monthKey, c])), netUsd: 1000, vatUsd: 210, otherUsd: 0 }
  }
  const axis = ['2025-06', '2026-01', '2027-01']

  test('13. alternar ARS → USD → ARS no altera valores ni los datos de entrada', () => {
    const row = sampleRow()
    const snapshot = JSON.stringify([...row.realTimeline.entries()])
    const ars1 = buildDisplayMatrix([row], axis, 'ARS', 1400)
    const usd = buildDisplayMatrix([row], axis, 'USD', 1400)
    const ars2 = buildDisplayMatrix([row], axis, 'ARS', 1400)
    for (let i = 0; i < 5; i++) buildDisplayMatrix([row], axis, i % 2 ? 'USD' : 'ARS', 1400)
    assert.deepEqual(ars1, ars2)
    assert.deepEqual(usd, buildDisplayMatrix([row], axis, 'USD', 1400))
    assert.equal(JSON.stringify([...row.realTimeline.entries()]), snapshot)

    // Real: TC histórico; proyectado: USD × TC actual.
    close(ars1[0][1]!.amounts!.total, 1_210_000)
    close(usd[0][1]!.amounts!.total, 1210)
    close(usd[0][2]!.amounts!.total, 1210)
    close(ars1[0][2]!.amounts!.total, 1210 * 1400)
    close(ars1[0][2]!.amounts!.vat, 210 * 1400)
  })

  test('14. los totales salen de la misma matriz; en ARS sin TC actual lo proyectado es null (nunca USD × 1)', () => {
    const row = sampleRow()
    const [cells] = buildDisplayMatrix([row], axis, 'USD', 1400)
    const totals = sumDisplayCells(cells)
    close(totals.total, 1210 + 1210)
    close(totals.recognized, 1210)
    close(totals.projected, 1210)
    assert.equal(totals.incomplete, true) // el documento de 2025 con TC 1 quedó excluido
    close(totals.excludedNative.ARS, 500_000)

    const [noRate] = buildDisplayMatrix([row], axis, 'ARS', null)
    assert.equal(noRate[2]!.amounts, null)
    assert.equal(noRate[2]!.incomplete, true)
    const arsTotals = sumDisplayCells(noRate)
    close(arsTotals.total, 500_000 + 1_210_000) // solo lo real, con su TC histórico
    assert.equal(arsTotals.projected, 0)
    assert.equal(arsTotals.incomplete, true)
    assert.equal(usdIn(1000, 'ARS', null), null)
    close(usdIn(1000, 'ARS', 1400), 1_400_000)
    close(usdIn(1000, 'USD', null), 1000)
  })

  test('15. TC actual: placeholder, faltante o ≤ 1 no son utilizables', () => {
    assert.equal(currentRateIssue({ rate: 1000, isPlaceholder: true }), 'placeholder')
    assert.equal(usableCurrentRate({ rate: 1000, isPlaceholder: true }), null)
    assert.equal(currentRateIssue({ rate: null }), 'missing')
    assert.equal(currentRateIssue(undefined), 'missing')
    assert.equal(currentRateIssue({ rate: 1 }), 'invalid')
    assert.equal(currentRateIssue({ rate: 0 }), 'invalid')
    assert.equal(currentRateIssue({ rate: 1435.5, isPlaceholder: false }), null)
    assert.equal(usableCurrentRate({ rate: 1435.5, isPlaceholder: false }), 1435.5)
  })
})

// ── 14b. Excel: misma matriz, moneda elegida, nada no convertible como número ─

describe('exportación Excel', () => {
  async function loadExport() {
    return import('../../src/modules/insurance/renewal-projections/renewalProjectionExport')
  }

  function assetRow(overrides: Partial<AssetRowData> = {}): AssetRowData {
    const good = doc({ issueDate: '2026-01-05', currency: 'ARS', net: 1_000_000, vat: 210_000, rate: 1000 })
    const legacy = doc({ issueDate: '2025-06-05', currency: 'ARS', net: 500_000, rate: 1, totalUsd: 500_000 })
    const projected = projectAssetRow(annualCycle(), '2026-02', '2027-12', 1000, 210, 0, 0)
    return {
      assetId: A, name: 'Camión 1', code: 'C1 · Camión',
      realTimeline: buildAssetRealTimelineByDocument(A, [legacy, good]),
      projectedByMonth: new Map(projected.map((c) => [c.monthKey, c])),
      netUsd: 1000, vatUsd: 210, otherUsd: 0, pct: 0,
      cycleLengthMonths: 12, installmentsCount: 1, startMonthKey: '2026-01',
      baseStatus: 'OK', projectionBlocked: false, isOverridden: false,
      hasLegacy: true, legacyPendingFields: ['net'],
      override: { ...noOverride(), assetId: A, mode: 'ECONOMIC', netOverride: 1_500_000, growthPercentOverride: 85, legacyConvertedRate: null, legacyConvertedBy: null, updatedAt: '2026-08-01T00:00:00Z' },
      ...overrides,
    }
  }
  const axis = ['2025-06', '2026-01', '2027-01']

  function build(currency: Currency, projectionRate: number | null, row = assetRow()) {
    const matrix = buildDisplayMatrix([row], axis, currency, projectionRate)
    return loadExport().then(({ buildRenewalProjectionExport }) =>
      buildRenewalProjectionExport({
        rows: [row], matrix, rowTotals: matrix.map((c) => sumDisplayCells(c)), axis, currency, projectionRate,
        breakdownFields: [], hideAssetPanel: false, horizonEndMonthKey: '2027-12', filenamePrefix: 'proy',
      }),
    )
  }

  test('USD: base y meses en USD; la celda con TC 1 va como texto nativo; total marcado incompleto', async () => {
    const xlsx = await build('USD', 1400)
    const [header, data] = xlsx.rows
    assert.equal(xlsx.filename, 'proy-USD-2027-12.xlsx')
    assert.equal(header[1], 'Neto (USD)')
    assert.equal(header[header.length - 2], 'Total (USD)')
    const col = (label: string) => header.indexOf(label)
    assert.equal(data[col('Neto (USD)')], 1000)
    assert.equal(data[col('Total (USD)')], 1210)
    assert.equal(data[col('% renov. (USD)')], 0)
    assert.equal(data[col('% anterior (hist.)')], 85)
    assert.match(String(data[col('2025-06')]), /^AR\$ .*\(sin TC\)$/)
    close(data[col('2026-01')] as number, 1210)
    close(data[col('2027-01')] as number, 1210)
    close(data[header.length - 2] as number, 2420)
    const obs = String(data[header.length - 1])
    assert.match(obs, /^TOTAL INCOMPLETO — excluye AR\$/)
    assert.match(obs, /Valores anteriores en ARS sin convertir \(no aplicados\): Neto AR\$/)
    // Las columnas de texto no se declaran numéricas.
    assert.ok(!xlsx.options.numericColumnIndexes!.includes(header.length - 1))
  })

  test('ARS con TC manual: real a TC histórico, proyectado al TC ingresado, y el TC queda en el encabezado', async () => {
    const xlsx = await build('ARS', 1400)
    const [header, data] = xlsx.rows
    assert.equal(xlsx.filename, 'proy-ARS-2027-12.xlsx')
    assert.equal(data[header.indexOf('Neto (ARS)')], 1_400_000)
    close(data[header.indexOf('2025-06')] as number, 500_000)
    close(data[header.indexOf('2026-01')] as number, 1_210_000)
    close(data[header.indexOf('2027-01')] as number, 1210 * 1400)
    assert.match(String(header[header.length - 2]), /^Total \(ARS · proy\. TC manual AR\$ 1\.400/)
  })

  test('ARS sin TC manual: base vacía y proyectado "Sin TC", nunca USD × 1', async () => {
    const xlsx = await build('ARS', null)
    const [header, data] = xlsx.rows
    assert.equal(data[header.indexOf('Neto (ARS)')], null)
    assert.equal(data[header.indexOf('2027-01')], 'Sin TC')
    close(data[header.indexOf('2026-01')] as number, 1_210_000)
    assert.match(String(data[header.length - 1]), /TOTAL INCOMPLETO.*proyectado en ARS sin TC/)
    assert.equal(header[header.length - 2], 'Total (ARS)')
  })
})


// ── TC manual de la proyección ──────────────────────────────────────────────

describe('TC manual (ARS por USD) para ver lo proyectado en ARS', () => {
  test('vacío, cero, negativo, texto o no finito → inválido (null); un número > 0 → válido', () => {
    for (const raw of ['', '   ', '0', '-0', '-1500', 'abc', 'NaN', 'Infinity', '1e999']) {
      assert.equal(parseManualRate(raw), null, `"${raw}" debería ser inválido`)
    }
    assert.equal(parseManualRate(null), null)
    assert.equal(parseManualRate(undefined), null)
    assert.equal(parseManualRate('1500'), 1500)
    assert.equal(parseManualRate(' 1435.75 '), 1435.75)
  })

  function row(): RowProjectionInputs {
    const real = doc({ issueDate: '2026-01-05', currency: 'ARS', net: 1_000_000, vat: 210_000, rate: 1000 })
    const projected = projectAssetRow(annualCycle(), '2026-02', '2027-12', 1000, 210, 0, 0)
    return {
      realTimeline: buildAssetRealTimelineByDocument(A, [real]),
      projectedByMonth: new Map(projected.map((c) => [c.monthKey, c])),
      netUsd: 1000, vatUsd: 210, otherUsd: 0,
    }
  }
  const axis = ['2026-01', '2027-01']

  test('USD es independiente del TC manual (vacío, válido o cualquiera da lo mismo)', () => {
    const r = row()
    const base = buildDisplayMatrix([r], axis, 'USD', null)
    for (const rate of [parseManualRate('1500'), parseManualRate('0.5'), parseManualRate('abc')]) {
      assert.deepEqual(buildDisplayMatrix([r], axis, 'USD', rate), base)
    }
    close(base[0][1]!.amounts!.total, 1210)
  })

  test('ARS: lo proyectado es base USD × TC ingresado; lo real usa su ARS registrado aunque cambie el TC', () => {
    const r = row()
    for (const rate of [1500, 2000]) {
      const [cells] = buildDisplayMatrix([r], axis, 'ARS', rate)
      close(cells[0]!.amounts!.total, 1_210_000) // real: no se recalcula
      close(cells[1]!.amounts!.total, 1210 * rate)
      close(cells[1]!.amounts!.net, 1000 * rate)
      close(cells[1]!.amounts!.vat, 210 * rate)
      const totals = sumDisplayCells(cells)
      close(totals.total, 1_210_000 + 1210 * rate)
      close(totals.projected, 1210 * rate)
      assert.equal(totals.incomplete, false)
    }
    // Sin TC válido: el futuro en ARS no tiene importe (se muestra «Sin TC»).
    const [noRate] = buildDisplayMatrix([r], axis, 'ARS', parseManualRate('-3'))
    assert.equal(noRate[1]!.amounts, null)
    assert.equal(noRate[1]!.incomplete, true)
    close(noRate[0]!.amounts!.total, 1_210_000)
  })
})
