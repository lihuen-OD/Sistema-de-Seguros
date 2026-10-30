import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { JSDOM } from 'jsdom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { searchApi, type GlobalSearchResults } from '../../src/shared/api/search.api'
import type { AssetSearchResult } from '../../src/shared/api/assets.api'
import type { PolicySearchResult } from '../../src/shared/api/policies.api'
import type { CurrentUser } from '../../src/shared/api/auth.api'
import { GlobalSearch } from '../../src/shared/components/topbar/GlobalSearch'
import {
  buildGlobalSearchPlaceholder,
  buildGlobalSearchSections,
  canRunGlobalSearch,
  flattenGlobalSearchSections,
  globalSearchCategoriesFor,
  normalizeGlobalSearchQuery,
  type GlobalSearchCategory,
} from '../../src/shared/utils/globalSearch'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAsset(overrides: Partial<AssetSearchResult> = {}): AssetSearchResult {
  return {
    id: 'asset-1',
    name: 'Toyota Hilux',
    code: 'ACT-00001',
    status: 'activo',
    assetType: 'camioneta',
    plate: 'AB 123 CD',
    fixedAssetCode: 'BU-01',
    fixedAssetName: 'Rodados',
    ...overrides,
  }
}

function makePolicy(overrides: Partial<PolicySearchResult> = {}): PolicySearchResult {
  return {
    id: 'policy-1',
    policyNumber: 'POL-1000',
    insuranceCompany: 'La Segunda',
    status: 'vigente',
    effectiveStatus: 'vigente',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    producerName: 'Productor Demo',
    insuranceTypeNames: ['Automotor'],
    ...overrides,
  }
}

const results: GlobalSearchResults = {
  assets: { items: [makeAsset(), makeAsset({ id: 'asset-2', name: 'Hilux vieja', code: null, status: 'baja', plate: null })], hasMore: false },
  policies: { items: [makePolicy()], hasMore: true },
  documents: {
    items: [{
      id: 'doc-1',
      documentNumber: 'FAC-001',
      type: 'INVOICE',
      issueDate: '2026-01-01',
      insuranceCompany: 'MAPFRE',
      currency: 'ARS',
      totalAmount: 1260,
      paymentStatus: 'PENDING',
      paymentMethod: null,
      documentStatus: 'CANCELLED',
    }],
    hasMore: false,
  },
}

const baseUser: CurrentUser = {
  id: 'user-1',
  name: 'Usuario de prueba',
  email: 'test@example.invalid',
  role: 'USER',
  mustChangePassword: false,
  accessProfileId: 'profile-1',
  accessProfileName: 'Operaciones',
  modules: [],
}

// ── Lógica pura ───────────────────────────────────────────────────────────────

test('mínimo de 2 caracteres reales y máximo de 100', () => {
  assert.equal(canRunGlobalSearch(normalizeGlobalSearchQuery(' a ')), false)
  assert.equal(canRunGlobalSearch(normalizeGlobalSearchQuery(' ab ')), true)
  assert.equal(canRunGlobalSearch('a'.repeat(100)), true)
  assert.equal(canRunGlobalSearch('a'.repeat(101)), false)
})

test('las categorías siguen el módulo del detalle de cada grupo', () => {
  assert.deepEqual(globalSearchCategoriesFor({ ...baseUser, role: 'ADMIN' }), ['assets', 'policies', 'documents'])
  assert.deepEqual(globalSearchCategoriesFor({ ...baseUser, modules: ['policies', 'documents'] }), ['policies', 'documents'])
  assert.deepEqual(globalSearchCategoriesFor({ ...baseUser, modules: ['renewal_projections', 'claims'] }), [])
  assert.deepEqual(globalSearchCategoriesFor(null), [])
})

test('el placeholder nombra solo lo que el usuario puede buscar', () => {
  assert.equal(buildGlobalSearchPlaceholder(['assets', 'policies', 'documents']), 'Buscar activos, pólizas y documentos…')
  assert.equal(buildGlobalSearchPlaceholder(['documents', 'policies']), 'Buscar pólizas y documentos…')
  assert.equal(buildGlobalSearchPlaceholder(['assets']), 'Buscar activos…')
})

test('arma las secciones en orden fijo con enlace al detalle y el estado visible', () => {
  const sections = buildGlobalSearchSections(results)

  assert.deepEqual(sections.map((s) => [s.category, s.label, s.hasMore]), [
    ['assets', 'Activos', false],
    ['policies', 'Pólizas', true],
    ['documents', 'Documentos', false],
  ])
  const [asset, legacyAsset] = sections[0].entries
  assert.equal(asset.href, '/assets/asset-1')
  assert.equal(asset.subtitle, 'ACT-00001 · AB 123 CD · Rodados')
  assert.equal(legacyAsset.status, 'baja', 'un activo dado de baja muestra su estado')
  assert.equal(legacyAsset.subtitle, 'ACT-ASSET-2 · Rodados', 'sin código usa el derivado estable del id')
  assert.equal(sections[1].entries[0].href, '/insurance/policies/policy-1')
  assert.equal(sections[1].entries[0].status, 'vigente')
  const doc = sections[2].entries[0]
  assert.equal(doc.href, '/insurance/documents/doc-1')
  assert.equal(doc.title, 'Factura FAC-001')
  assert.equal(doc.status, 'CANCELLED', 'un anulado se marca como anulado, no por su estado de pago')

  assert.deepEqual(
    flattenGlobalSearchSections(sections).map((e) => e.key),
    ['assets:asset-1', 'assets:asset-2', 'policies:policy-1', 'documents:doc-1'],
  )
})

test('omite los grupos que el backend no devolvió (sin permiso) o que vinieron vacíos', () => {
  const sections = buildGlobalSearchSections({ policies: { items: [makePolicy()], hasMore: false }, documents: { items: [], hasMore: false } })
  assert.deepEqual(sections.map((s) => s.category), ['policies'])
})

// ── Componente ────────────────────────────────────────────────────────────────

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const DEBOUNCE_WAIT = 400

interface ApiCall { q: string; signal?: AbortSignal }

// react-dom decide al cargarse si el entorno soporta el evento `input`
// (canUseDOM): los imports estáticos lo cargan antes de que existan los
// globals de jsdom, y sin DOM React cae al polyfill de IE para onChange —
// tipear en un input no dispararía nada. Se carga una copia limpia recién
// después de instalar los globals (los clicks de otros tests no lo notan).
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

function mountSearch(categories: GlobalSearchCategory[] = ['assets', 'policies', 'documents']) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const globals = ['window', 'document', 'HTMLElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'navigator'] as const
  const allGlobals = [...globals, 'IS_REACT_ACT_ENVIRONMENT'] as const
  const previous = new Map(allGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  for (const name of globals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'window' ? dom.window : name === 'document' ? dom.window.document : name === 'navigator' ? dom.window.navigator : dom.window[name],
    })
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

  const location = { pathname: '/dashboard' }
  function LocationProbe() {
    location.pathname = useLocation().pathname
    return null
  }

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = dom.window.document.createElement('div')
  const outside = dom.window.document.createElement('button')
  dom.window.document.body.append(container, outside)
  const root = reactDomClient().createRoot(container)
  act(() => {
    root.render(
      createElement(QueryClientProvider, { client: queryClient },
        createElement(MemoryRouter, { initialEntries: ['/dashboard'] },
          createElement(GlobalSearch, { categories }),
          createElement(LocationProbe),
        ),
      ),
    )
  })

  const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')!
  const valueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!

  // Con IS_REACT_ACT_ENVIRONMENT React aplica los updates al cerrar cada
  // act(): el debounce vence dentro de la espera, pero la query recién
  // arranca al salir — una segunda vuelta corta deja que la respuesta llegue
  // y se renderice.
  async function settle(ms: number) {
    await act(async () => { await wait(ms) })
    await act(async () => { await wait(20) })
  }

  return {
    dom,
    container,
    input,
    location,
    async type(value: string, settleMs = 0) {
      act(() => {
        valueSetter.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      if (settleMs) await settle(settleMs)
    },
    settle: (ms = DEBOUNCE_WAIT) => settle(ms),
    key(key: string) {
      act(() => { input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })) })
    },
    click(el: Element) {
      act(() => {
        el.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }))
        el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      })
    },
    text: () => container.textContent ?? '',
    options: () => [...container.querySelectorAll<HTMLElement>('[role="option"]')],
    outside,
    unmount() {
      act(() => root.unmount())
      queryClient.clear()
      dom.window.close()
      for (const name of allGlobals) {
        const descriptor = previous.get(name)
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
      }
    },
  }
}

function stubSearchApi(impl: (call: ApiCall) => Promise<GlobalSearchResults>) {
  const original = searchApi.global
  const calls: ApiCall[] = []
  searchApi.global = (q, signal) => {
    const call = { q, signal }
    calls.push(call)
    return impl(call)
  }
  return { calls, restore: () => { searchApi.global = original } }
}

test('no consulta por cada pulsación: debounce, mínimo de 2 caracteres y un solo request', async () => {
  const api = stubSearchApi(async () => results)
  const ui = mountSearch()
  try {
    assert.equal(ui.input.placeholder, 'Buscar activos, pólizas y documentos…')

    await ui.type('h', DEBOUNCE_WAIT)
    assert.equal(api.calls.length, 0, 'con 1 carácter no se consulta')
    assert.match(ui.text(), /al menos 2 caracteres/)

    for (const value of ['hi', 'hil', 'hilu', 'hilux']) await ui.type(value, 50)
    assert.equal(api.calls.length, 0, 'mientras se tipea no sale ningún request')
    await ui.settle()
    assert.deepEqual(api.calls.map((c) => c.q), ['hilux'], 'un único request con el término final')

    const text = ui.text()
    assert.ok(text.indexOf('Activos') < text.indexOf('Pólizas') && text.indexOf('Pólizas') < text.indexOf('Documentos'))
    assert.match(text, /Baja/, 'el activo dado de baja muestra su estado')
    assert.match(text, /Anulado/, 'el documento anulado muestra su estado')
    assert.match(text, /Hay más coincidencias/, 'el grupo con hasMore lo indica')

    await ui.type('  hilux  ', DEBOUNCE_WAIT)
    assert.equal(api.calls.length, 1, 'espacios alrededor no cambian el término')
  } finally {
    ui.unmount()
    api.restore()
  }
})

test('navega al detalle con teclado (↓ + Enter) y con click', async () => {
  const api = stubSearchApi(async () => results)
  const ui = mountSearch()
  try {
    await ui.type('hilux', DEBOUNCE_WAIT)
    assert.equal(ui.options().length, 4)
    assert.equal(ui.options()[0].getAttribute('aria-selected'), 'true', 'la primera fila arranca resaltada')

    ui.key('ArrowDown')
    ui.key('ArrowDown')
    assert.equal(ui.options()[2].getAttribute('aria-selected'), 'true')
    assert.equal(ui.input.getAttribute('aria-activedescendant'), ui.options()[2].id)
    ui.key('Enter')
    assert.equal(ui.location.pathname, '/insurance/policies/policy-1')
    assert.equal(ui.input.value, '', 'al navegar se limpia el buscador')
    assert.equal(ui.options().length, 0, 'y se cierra el panel')

    await ui.type('hilux', DEBOUNCE_WAIT)
    ui.click(ui.options()[3])
    assert.equal(ui.location.pathname, '/insurance/documents/doc-1')
  } finally {
    ui.unmount()
    api.restore()
  }
})

test('Escape y click afuera cierran el panel', async () => {
  const api = stubSearchApi(async () => results)
  const ui = mountSearch()
  try {
    await ui.type('hilux', DEBOUNCE_WAIT)
    assert.ok(ui.options().length > 0)
    ui.key('Escape')
    assert.equal(ui.options().length, 0)
    assert.equal(ui.input.value, 'hilux', 'el primer Escape solo cierra')
    ui.key('ArrowDown')
    assert.ok(ui.options().length > 0, 'la flecha lo vuelve a abrir')
    ui.click(ui.outside)
    assert.equal(ui.options().length, 0)
    ui.key('Escape')
    assert.equal(ui.input.value, '', 'Escape con el panel cerrado limpia el texto')
  } finally {
    ui.unmount()
    api.restore()
  }
})

test('estados de vacío y error, con reintento', async () => {
  let fail = true
  const api = stubSearchApi(async () => {
    if (fail) throw new Error('boom')
    return { assets: { items: [], hasMore: false }, policies: { items: [], hasMore: false } }
  })
  const ui = mountSearch()
  try {
    await ui.type('zzzz', DEBOUNCE_WAIT)
    assert.match(ui.text(), /No se pudo completar la búsqueda/)

    fail = false
    const retry = [...ui.container.querySelectorAll('button')].find((b) => b.textContent === 'Reintentar')
    assert.ok(retry)
    ui.click(retry)
    await ui.settle(50)
    assert.equal(api.calls.length, 2)
    assert.match(ui.text(), /Sin resultados/)
    assert.match(ui.text(), /«zzzz»/)
  } finally {
    ui.unmount()
    api.restore()
  }
})

test('cancela el request anterior y reutiliza la caché para un término repetido', async () => {
  const pending: Array<() => void> = []
  const api = stubSearchApi(({ q }) => new Promise((resolve) => {
    pending.push(() => resolve({ assets: { items: [makeAsset({ id: `asset-${q}`, name: `Resultado ${q}` })], hasMore: false } }))
  }))
  const resolvePending = () => act(async () => { pending.forEach((resolve) => resolve()); await wait(20) })
  const ui = mountSearch()
  try {
    await ui.type('hilux', DEBOUNCE_WAIT)
    assert.equal(api.calls.length, 1)
    assert.equal(api.calls[0].signal?.aborted, false)

    await ui.type('ford', DEBOUNCE_WAIT)
    assert.equal(api.calls.length, 2)
    assert.equal(api.calls[0].signal?.aborted, true, 'el request de "hilux" quedó abortado')

    await resolvePending()
    assert.match(ui.text(), /Resultado ford/)
    assert.doesNotMatch(ui.text(), /Resultado hilux/, 'no aparecen resultados del término abandonado')

    await ui.type('toyota', DEBOUNCE_WAIT)
    assert.equal(api.calls.length, 3)
    await resolvePending()
    assert.match(ui.text(), /Resultado toyota/)

    await ui.type('ford', DEBOUNCE_WAIT)
    assert.equal(api.calls.length, 3, 'volver a un término reciente sale de la caché, sin request')
    assert.match(ui.text(), /Resultado ford/)
  } finally {
    ui.unmount()
    api.restore()
  }
})

test('solo muestra los grupos que devuelve el backend', async () => {
  const api = stubSearchApi(async () => ({ policies: { items: [makePolicy()], hasMore: false } }))
  const ui = mountSearch(['policies'])
  try {
    assert.equal(ui.input.placeholder, 'Buscar pólizas…')
    await ui.type('pol', DEBOUNCE_WAIT)
    assert.match(ui.text(), /Pólizas/)
    assert.doesNotMatch(ui.text(), /Activos|Documentos/)
  } finally {
    ui.unmount()
    api.restore()
  }
})

test('⌘K / Ctrl+K enfoca el buscador, salvo desde otro campo editable', () => {
  const api = stubSearchApi(async () => results)
  const ui = mountSearch()
  try {
    const { document, KeyboardEvent } = ui.dom.window
    const field = document.createElement('input')
    document.body.append(field)
    field.focus()
    act(() => { field.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })) })
    assert.equal(document.activeElement, field, 'no le roba el foco a otro campo')

    act(() => { ui.outside.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })) })
    assert.equal(document.activeElement, ui.input)
  } finally {
    ui.unmount()
    api.restore()
  }
})
