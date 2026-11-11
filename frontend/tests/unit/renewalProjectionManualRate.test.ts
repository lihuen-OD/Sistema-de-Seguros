import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { assetsApi } from '../../src/shared/api/assets.api'
import { policiesApi } from '../../src/shared/api/policies.api'
import { documentsApi, type DocumentForFinancial } from '../../src/shared/api/documents.api'
import { exchangeRateApi } from '../../src/shared/api/exchange-rate.api'
import { renewalProjectionsApi, type RenewalProjectionMode } from '../../src/shared/api/renewal-projections.api'
import { useRenewalProjectionData } from '../../src/modules/insurance/renewal-projections/useRenewalProjectionData'
import type { Asset, Policy } from '../../src/shared/types'

// TC manual de la proyección, probado sobre el hook REAL de las dos páginas
// (Financiero y Económico): arranca vacío, solo convierte lo proyectado a ARS,
// sobrevive a cambiar de moneda, no se guarda, y cambiarlo no dispara
// ninguna consulta ni escritura (las APIs se cuentan con stubs).

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

const calls: Record<string, number> = {}
function count(name: string) {
  calls[name] = (calls[name] ?? 0) + 1
}
function totalCalls() {
  return Object.values(calls).reduce((a, b) => a + b, 0)
}

// Los queryFn resuelven el método del objeto al llamarse, así que pisarlo
// alcanza para interceptar cada consulta/escritura sin red.
Object.assign(assetsApi, { findAll: async () => { count('assets'); return [ASSET] } })
Object.assign(policiesApi, { findAll: async () => { count('policies'); return [POLICY] } })
Object.assign(documentsApi, {
  findAllForFinancialWithMeta: async () => { count('documents'); return { data: [DOC], truncated: false, truncationKnown: true } },
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
  test(`${mode}: TC manual vacío al entrar, solo convierte lo futuro, se mantiene al cambiar de moneda y no consulta ni escribe`, async () => {
    for (const key of Object.keys(calls)) delete calls[key]
    const page = await mountHook(mode)
    try {
      const loaded = page.get()
      assert.equal(loaded.rows.length, 1, 'la fila del activo debería cargar')
      // La página no consulta el TC del sistema (solo lo hace el modal de valores anteriores).
      assert.equal(calls.systemRate, undefined)

      // 1. Vacío por defecto: en ARS lo futuro queda «Sin TC», lo real con su ARS registrado.
      assert.equal(loaded.manualRateInput, '')
      assert.equal(loaded.projectionRate, null)
      assert.equal(loaded.currency, 'ARS')
      const realMonth = mode === 'FINANCIAL' ? '2026-01' : '2026-01'
      assert.equal(cellAt(loaded, realMonth)!.amounts!.total, 1_210_000)
      assert.equal(cellAt(loaded, '2027-01')!.amounts, null)
      assert.equal(loaded.kpis.projectedAvailable, false)
      const callsAfterLoad = totalCalls()

      // 2. TC válido: lo futuro = base USD × TC; lo real no cambia.
      await page.run((s) => s.setManualRateInput('1500'))
      let s = page.get()
      assert.equal(s.projectionRate, 1500)
      assert.equal(cellAt(s, '2027-01')!.amounts!.total, 1210 * 1500)
      assert.equal(cellAt(s, realMonth)!.amounts!.total, 1_210_000)
      assert.equal(s.kpis.projectedAvailable, true)
      // KPI y totales de fila salen de la misma matriz que la tabla.
      const projectedCellsSum = s.matrix[0].reduce((acc, c, i) => (c && !c.isReal && s.axis[i] > s.lastRealMonthKey && c.amounts ? acc + c.amounts.total : acc), 0)
      assert.equal(s.kpis.projected.total, projectedCellsSum)
      assert.equal(s.rowTotals[0].total, 1_210_000 + projectedCellsSum)

      // 3. TC inválido, cero o negativo: vuelve a «Sin TC».
      for (const bad of ['0', '-20', 'abc']) {
        await page.run((st) => st.setManualRateInput(bad))
        assert.equal(page.get().projectionRate, null, `"${bad}" debería ser inválido`)
        assert.equal(cellAt(page.get(), '2027-01')!.amounts, null)
      }

      // 4. Cambiar de moneda mantiene el TC; USD no depende de él.
      await page.run((st) => st.setManualRateInput('1500'))
      await page.run((st) => st.setCurrency('USD'))
      s = page.get()
      assert.equal(s.manualRateInput, '1500')
      assert.equal(cellAt(s, '2027-01')!.amounts!.total, 1210)
      assert.equal(cellAt(s, realMonth)!.amounts!.total, 1210)
      await page.run((st) => st.setManualRateInput('9999'))
      assert.equal(cellAt(page.get(), '2027-01')!.amounts!.total, 1210)
      await page.run((st) => st.setCurrency('ARS'))
      assert.equal(page.get().manualRateInput, '9999')
      assert.equal(cellAt(page.get(), '2027-01')!.amounts!.total, 1210 * 9999)

      // 5. Nada de lo anterior consultó ni escribió.
      assert.equal(totalCalls(), callsAfterLoad, `llamadas inesperadas: ${JSON.stringify(calls)}`)
      assert.ok(!Object.keys(calls).some((k) => k.startsWith('WRITE')), `escrituras inesperadas: ${JSON.stringify(calls)}`)
    } finally {
      page.unmount()
    }

    // 6. Al volver a entrar, el TC arranca vacío otra vez (no se persiste).
    const again = await mountHook(mode)
    try {
      assert.equal(again.get().manualRateInput, '')
      assert.equal(again.get().projectionRate, null)
    } finally {
      again.unmount()
    }
  })
}
