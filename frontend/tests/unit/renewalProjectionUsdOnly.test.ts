import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { assetsApi } from '../../src/shared/api/assets.api'
import { policiesApi } from '../../src/shared/api/policies.api'
import { documentsApi, type DocumentForFinancial } from '../../src/shared/api/documents.api'
import { exchangeRateApi } from '../../src/shared/api/exchange-rate.api'
import { renewalProjectionsApi, type RenewalProjectionMode } from '../../src/shared/api/renewal-projections.api'
import { useRenewalProjectionData } from '../../src/modules/insurance/renewal-projections/useRenewalProjectionData'
import { buildRenewalProjectionExport } from '../../src/modules/insurance/renewal-projections/renewalProjectionExport'
import { RenewalObservationsPanel } from '../../src/modules/insurance/renewal-projections/RenewalObservationsPanel'
import type { Asset, Policy } from '../../src/shared/types'

// Proyecciones SOLO en USD, probado sobre el hook REAL de las dos páginas
// (Financiero y Económico): sin selector de moneda ni TC manual, lo real con
// su cierre USD histórico (sin cierre confiable: excluido y marcado, nunca
// convertido), KPI = tabla = Excel, Excel solo USD, observaciones con
// comprobante y fecha, y nada consulta ni escribe de más (APIs con stubs).

const A = 'asset-a'

const ASSET = { id: A, name: 'Camión 1', internalCode: 'C1', assetType: 'Camión' } as unknown as Asset
const POLICY = {
  id: 'pol-1', status: 'ACTIVE', startDate: '2026-01-01', endDate: '2027-01-01', coverages: [{ assetId: A }],
} as unknown as Policy

// Factura ARS a TC histórico 1000 → USD 1210 (1 cuota en el mismo mes).
const DOC = {
  id: 'doc-1', documentType: 'INVOICE', documentStatus: 'ISSUED', documentNumber: 'F-1',
  issueDate: '2026-01-05', currency: 'ARS', exchangeRate: 1000,
  netAmount: 1_000_000, vatAmount: 210_000, otherTaxesAmount: 0, totalAmount: 1_210_000,
  totalAmountArs: 1_210_000, totalAmountUsd: 1210, paymentStatus: 'PENDING',
  installments: [{
    id: 'i-1', accountingDocumentId: 'doc-1', installmentNumber: 1, dueDate: '2026-01-20',
    amount: 1_210_000, currency: 'ARS', amountArs: 1_210_000, amountUsd: 1210,
    paymentStatus: 'PENDING', paidAt: null, paymentMethod: null,
  }],
  allocations: [{
    id: 'al-1', accountingDocumentId: 'doc-1', policyAssetCoverageId: 'cov-1', policyId: 'pol-1',
    assetId: A, allocationPercentage: 100, allocatedAmount: 1_210_000,
  }],
} as unknown as DocumentForFinancial

// Factura vieja con TC 1 por default (USD = ARS): su cierre USD NO es confiable.
const OLD = {
  ...DOC, id: 'doc-old', documentNumber: 'F-OLD', issueDate: '2025-03-05', exchangeRate: 1,
  netAmount: 500_000, vatAmount: 0, totalAmount: 500_000, totalAmountArs: 500_000, totalAmountUsd: 500_000,
  installments: [{ ...DOC.installments[0], id: 'i-old', accountingDocumentId: 'doc-old', dueDate: '2025-03-20', amount: 500_000, amountArs: 500_000, amountUsd: 500_000 }],
  allocations: [{ ...DOC.allocations[0], id: 'al-old', accountingDocumentId: 'doc-old', allocatedAmount: 500_000 }],
} as unknown as DocumentForFinancial

// ND aplicada que ya volcó todo su importe en la factura y además tiene una
// cuota propia (caso ND01): Financiero la excluye para no duplicarla.
const ND = {
  ...DOC, id: 'doc-nd', documentType: 'DEBIT_NOTE', documentStatus: 'APPLIED', documentNumber: 'ND-01',
  issueDate: '2026-03-05', netAmount: 121_000, vatAmount: 0, totalAmount: 121_000, totalAmountArs: 121_000, totalAmountUsd: 121,
  appliedAdjustment: { count: 1, ars: 121_000, usd: 121 },
  installments: [{ ...DOC.installments[0], id: 'i-nd', accountingDocumentId: 'doc-nd', dueDate: '2026-04-10', amount: 121_000, amountArs: 121_000, amountUsd: 121 }],
  allocations: [{ ...DOC.allocations[0], id: 'al-nd', accountingDocumentId: 'doc-nd', allocatedAmount: 121_000 }],
} as unknown as DocumentForFinancial

const calls: Record<string, number> = {}
function count(name: string) {
  calls[name] = (calls[name] ?? 0) + 1
}

// Los queryFn resuelven el método del objeto al llamarse, así que pisarlo
// alcanza para interceptar cada consulta/escritura sin red.
Object.assign(assetsApi, { findAll: async () => { count('assets'); return [ASSET] } })
Object.assign(policiesApi, { findAll: async () => { count('policies'); return [POLICY] } })
Object.assign(documentsApi, {
  findAllForFinancialWithMeta: async () => { count('documents'); return { data: [OLD, DOC, ND], truncated: false, truncationKnown: true } },
})
Object.assign(exchangeRateApi, {
  getCurrent: async () => { count('systemRate'); return { rate: 1000, updatedBy: null, updatedAt: null, isPlaceholder: true } },
  setCurrent: async () => { count('WRITE systemRate'); throw new Error('no debería escribirse') },
})
Object.assign(renewalProjectionsApi, {
  findAll: async () => { count('overrides'); return [] },
  upsert: async () => { count('WRITE upsert'); throw new Error('no debería escribirse') },
  reset: async () => { count('WRITE reset'); throw new Error('no debería escribirse') },
  convertLegacy: async () => { count('WRITE convertLegacy'); throw new Error('no debería escribirse') },
})

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Mismo armado que globalSearch.test.ts: react-dom se carga recién después
// de instalar los globals de jsdom.
const requireFromTest = createRequire(import.meta.url)
let freshReactDomClient: typeof import('react-dom/client') | undefined
function reactDomClient(): typeof import('react-dom/client') {
  if (!freshReactDomClient) {
    for (const key of Object.keys(requireFromTest.cache)) {
      if (/[\\/]node_modules[\\/]react-dom[\\/]/.test(key)) delete requireFromTest.cache[key]
    }
    freshReactDomClient = requireFromTest('react-dom/client') as typeof import('react-dom/client')
  }
  return freshReactDomClient
}

type HookState = ReturnType<typeof useRenewalProjectionData>

async function mountHook(mode: RenewalProjectionMode) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const globals = ['window', 'document', 'HTMLElement', 'navigator'] as const
  const allGlobals = [...globals, 'IS_REACT_ACT_ENVIRONMENT'] as const
  const previous = new Map(allGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of globals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'window' ? dom.window : name === 'document' ? dom.window.document : name === 'navigator' ? dom.window.navigator : dom.window[name],
    })
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

  const state: { current: HookState | null } = { current: null }
  function Probe() {
    state.current = useRenewalProjectionData(mode)
    return null
  }

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = dom.window.document.createElement('div')
  dom.window.document.body.append(container)
  const root = reactDomClient().createRoot(container)
  act(() => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(Probe)))
  })
  await act(async () => { await wait(30) })
  await act(async () => { await wait(10) })

  return {
    get: () => state.current!,
    async run(fn: (s: HookState) => void) {
      act(() => fn(state.current!))
      await act(async () => { await wait(10) })
    },
    unmount() {
      act(() => root.unmount())
      queryClient.clear()
      dom.window.close()
      for (const name of allGlobals) {
        const descriptor = previous.get(name)
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else delete (globalThis as Record<string, unknown>)[name]
      }
    },
  }
}

function cellAt(s: HookState, monthKey: string) {
  const index = s.axis.indexOf(monthKey)
  assert.ok(index >= 0, `el eje debería incluir ${monthKey}`)
  return s.matrix[0][index]
}

for (const mode of ['FINANCIAL', 'ECONOMIC'] as const) {
  test(`${mode}: solo USD — sin selector ni TC, real con su cierre USD, KPI = tabla = Excel, observaciones con comprobante y fecha`, async () => {
    for (const key of Object.keys(calls)) delete calls[key]
    const page = await mountHook(mode)
    try {
      const s = page.get()
      assert.equal(s.rows.length, 1, 'la fila del activo debería cargar')
      // 1. No hay moneda elegible ni TC manual en el estado de la pantalla.
      for (const key of ['currency', 'setCurrency', 'manualRateInput', 'setManualRateInput', 'projectionRate']) {
        assert.ok(!(key in s), `no debería exponer ${key}`)
      }
      // La página no consulta el TC del sistema (solo lo hace el modal de valores anteriores).
      assert.equal(calls.systemRate, undefined)

      // 2. Lo real usa el cierre USD guardado, sin recalcular (F-1: USD 1210).
      assert.equal(cellAt(s, '2026-01')!.real!.amounts!.total, 1210)
      // Sin cierre USD confiable (TC 1): no se convierte, queda en ARS nativo y excluido.
      const old = cellAt(s, '2025-03')!.real!
      assert.equal(old.amounts, null)
      assert.equal(old.excludedNative.ARS, 500_000)
      assert.equal(old.incomplete, true)
      assert.equal(s.rowTotals[0].real.incomplete, true, 'el total real queda marcado incompleto')
      // Lo proyectado sale de la base USD.
      const projectedCellsSum = s.matrix[0].reduce((acc, c) => acc + (c?.projected?.amounts?.total ?? 0), 0)
      assert.ok(projectedCellsSum > 0)

      // 3. KPI = Σ celdas = total de fila = Excel.
      assert.equal(s.kpis.projected.total, projectedCellsSum)
      assert.equal(s.rowTotals[0].projected.total, projectedCellsSum)
      const xlsx = buildRenewalProjectionExport({
        rows: s.rows, matrix: s.matrix, rowTotals: s.rowTotals, axis: s.axis,
        breakdownFields: [], hideAssetPanel: false, horizonEndMonthKey: s.horizonEndMonthKey, filenamePrefix: 'proy',
      })
      const [header, realRow, projRow] = xlsx.rows
      assert.match(xlsx.filename, /^proy-USD-/)
      assert.ok(header.every((h) => !String(h).includes('ARS')), `encabezados solo USD: ${header.join(' | ')}`)
      assert.equal(header[header.length - 2], 'Total (USD)')
      assert.equal(projRow[header.length - 2], projectedCellsSum, 'Excel proyectado = KPI')
      assert.equal(realRow[header.length - 2], s.rowTotals[0].real.total, 'Excel real = total real de la tabla')
      assert.equal(realRow[header.indexOf('2026-01')], 1210)
      assert.match(String(realRow[header.indexOf('2025-03')]), /^AR\$ .*\(sin TC\)$/, 'sin cierre confiable va como texto nativo, no convertido')
      assert.match(String(realRow[header.length - 1]), /TOTAL INCOMPLETO — excluye AR\$/)

      // 4. Observaciones agrupadas: revisión vs informativas, con detalle.
      const byKey = new Map(s.observations.map((o) => [o.key, o]))
      assert.ok(byKey.has('unreliable-real'), 'categoría de importes sin cierre USD confiable')
      const unreliable = byKey.get('unreliable-real')!
      assert.equal(unreliable.severity, 'review')
      assert.equal(unreliable.count, 1)
      assert.match(unreliable.details[0].text, /MAR 25 — excluye AR\$/)
      const adjustment = byKey.get('excluded-adjustments')
      if (mode === 'FINANCIAL') {
        assert.ok(adjustment, 'Financiero informa la cuota de ajuste excluida')
        if (!adjustment) return
        assert.equal(adjustment.severity, 'info', 'una exclusión correcta es informativa, no un error')
        assert.match(adjustment.details[0].text, /ND-01 \(Nota de Débito\) · emitida 05\/03\/2026 · cuota 10\/04\/2026/)
        assert.match(String(realRow[header.length - 1]), /Cuotas de ajustes ya aplicados.*ND-01/)
        // El ajuste excluido no aparece como importe real en abril.
        assert.equal(cellAt(s, '2026-04')?.real ?? null, null)
      } else {
        assert.equal(adjustment, undefined, 'Económico no excluye cuotas de ajustes')
      }

      // 5. El panel arranca cerrado y resume revisión / informativas.
      const html = renderToStaticMarkup(createElement(RenewalObservationsPanel, { observations: s.observations }))
      assert.match(html, /^<details(?![^>]*\bopen\b)/, 'cerrado por defecto')
      assert.match(html, /requiere(n)? revisión/)
      assert.match(html, /F-OLD|MAR 25/)

      // 6. Nada consultó de más ni escribió.
      assert.ok(!Object.keys(calls).some((k) => k.startsWith('WRITE')), `escrituras inesperadas: ${JSON.stringify(calls)}`)
    } finally {
      page.unmount()
    }
  })
}
