import assert from 'node:assert/strict'
import { test } from 'node:test'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { JSDOM } from 'jsdom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { policiesApi } from '../../src/shared/api/policies.api'
import type { CurrentUser } from '../../src/shared/api/auth.api'
import type { Policy } from '../../src/shared/types'
import { PolicyRenewalAction, type RenewablePolicy } from '../../src/modules/insurance/policies/renewals/PolicyRenewalAction'
import { MarkRenewedModal } from '../../src/modules/insurance/policies/renewals/MarkRenewedModal'

const user: CurrentUser = {
  id: 'user-1',
  name: 'Usuario de prueba',
  email: 'test@example.invalid',
  role: 'USER',
  mustChangePassword: false,
  accessProfileId: 'profile-1',
  accessProfileName: 'Operaciones',
  modules: ['policies', 'policy_renewals'],
}

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    policyNumber: 'POL-001',
    insuranceCompany: 'Aseguradora',
    producerId: 'producer-1',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    description: '',
    status: 'vigente',
    effectiveStatus: 'vigente',
    ...overrides,
  }
}

function mountAction(
  policy: Policy,
  currentUser: CurrentUser | null,
  onOpen: (policy: Policy) => void,
) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const globals = ['window', 'document', 'HTMLElement', 'MouseEvent', 'navigator'] as const
  const allGlobals = [...globals, 'IS_REACT_ACT_ENVIRONMENT'] as const
  const previous = new Map(allGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))

  for (const name of globals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'window' || name === 'document'
        ? (name === 'window' ? dom.window : dom.window.document)
        : name === 'navigator' ? dom.window.navigator : dom.window[name],
    })
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

  const row = dom.window.document.createElement('div')
  const container = dom.window.document.createElement('div')
  row.append(container)
  dom.window.document.body.append(row)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(PolicyRenewalAction, { policy, user: currentUser, onOpen }))
  })

  return {
    container,
    dom,
    row,
    unmount() {
      act(() => root.unmount())
      dom.window.close()
      for (const name of allGlobals) {
        const descriptor = previous.get(name)
        if (descriptor) Object.defineProperty(globalThis, name, descriptor)
        else Reflect.deleteProperty(globalThis, name)
      }
    },
  }
}

test('acción de renovación respeta permisos/estado y abre el flujo para pólizas elegibles', () => {
  const opened: RenewablePolicy[] = []
  let rowClicked = false
  const policy = makePolicy({ status: 'vencida', effectiveStatus: 'vencida' })
  const mounted = mountAction(policy, user, (target) => opened.push(target))
  const button = mounted.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Marcar como renovada"]',
  )

  assert.ok(button, 'la póliza vencida debe mostrar la acción')
  assert.equal(button.title, 'Marcar como renovada')
  mounted.row.addEventListener('click', () => { rowClicked = true })
  act(() => button.dispatchEvent(new mounted.dom.window.MouseEvent('click', { bubbles: true })))
  assert.deepEqual(opened, [policy], 'el clic debe abrir el flujo con la póliza seleccionada')
  assert.equal(rowClicked, false, 'el clic no debe activar la navegación de la fila')
  mounted.unmount()

  const withoutPermission = mountAction(policy, { ...user, modules: ['policies'] }, () => {})
  assert.equal(withoutPermission.container.querySelector('button'), null)
  withoutPermission.unmount()

  const manuallyDeactivated = mountAction(makePolicy({ status: 'de_baja' }), user, () => {})
  assert.equal(manuallyDeactivated.container.querySelector('button'), null)
  manuallyDeactivated.unmount()

  const alreadyRenewed = mountAction(
    makePolicy({ renewal: { isMarked: true, renewedBy: { id: 'policy-2', policyNumber: 'POL-002' } } }),
    user,
    () => {},
  )
  assert.equal(alreadyRenewed.container.querySelector('button'), null)
  alreadyRenewed.unmount()

  const currentPolicy = mountAction(makePolicy(), user, () => {})
  assert.ok(currentPolicy.container.querySelector('button[aria-label="Marcar como renovada"]'))
  currentPolicy.unmount()
})

test('confirmar la marca manual ignora dobles clics mientras la solicitud está en curso', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
  const globals = ['window', 'document', 'HTMLElement', 'MouseEvent', 'KeyboardEvent', 'navigator'] as const
  const allGlobals = [...globals, 'IS_REACT_ACT_ENVIRONMENT'] as const
  const previous = new Map(allGlobals.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))

  for (const name of globals) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: name === 'window' || name === 'document'
        ? (name === 'window' ? dom.window : dom.window.document)
        : name === 'navigator' ? dom.window.navigator : dom.window[name],
    })
  }
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })

  const originalCreateRenewal = policiesApi.createRenewal
  let calls = 0
  policiesApi.createRenewal = async () => {
    calls += 1
    return new Promise<never>(() => {})
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const container = dom.window.document.createElement('div')
  dom.window.document.body.append(container)
  const root = createRoot(container)
  try {
    act(() => {
      root.render(createElement(QueryClientProvider, { client },
        createElement(MarkRenewedModal, { policy: { id: 'policy-1', policyNumber: 'POL-001' }, onClose: () => {} }),
      ))
    })

    const confirm = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Marcar como renovada'))
    assert.ok(confirm, 'debe solicitar confirmación explícita')
    assert.match(container.textContent ?? '', /¿Querés marcar esta póliza como renovada\?/)
    await act(async () => {
      confirm.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      confirm.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    assert.equal(calls, 1)
  } finally {
    act(() => root.unmount())
    client.clear()
    policiesApi.createRenewal = originalCreateRenewal
    dom.window.close()
    for (const name of allGlobals) {
      const descriptor = previous.get(name)
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
