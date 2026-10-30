import test from 'node:test'
import assert from 'node:assert/strict'
import { creationRequestTabs, hasRequiredRejectionReason, invalidateCreationRequestReviewQueries } from '../../src/shared/utils/fireExtinguisherCreationRequests'

test('auditor ve Cobertura y Solicitudes, pero no la cola de revisión', () => {
  assert.deepEqual(creationRequestTabs(false, true, 4).map((tab) => tab.id), ['cobertura', 'solicitudes'])
})

test('revisor ve Auditorías y Solicitudes, pero no Cobertura sin permiso', () => {
  assert.deepEqual(creationRequestTabs(true, false, 4).map((tab) => tab.id), ['auditorias', 'solicitudes'])
})

test('ADMIN con ambos permisos ve las tres pestañas y conserva el contador', () => {
  const tabs = creationRequestTabs(true, true, 7)
  assert.deepEqual(tabs.map((tab) => tab.id), ['auditorias', 'cobertura', 'solicitudes'])
  assert.equal(tabs[1].count, 7)
})

test('el rechazo exige un motivo no vacío', () => {
  assert.equal(hasRequiredRejectionReason('   '), false)
  assert.equal(hasRequiredRejectionReason('Duplicado'), true)
})

test('aprobar invalida solo solicitudes, inventario, cobertura y dashboards afectados', async () => {
  const calls: Array<{ queryKey: readonly unknown[]; exact?: boolean }> = []
  await invalidateCreationRequestReviewQueries(
    { invalidateQueries: async (filters) => { calls.push(filters) } },
    'request-1',
    'APPROVE',
  )

  assert.deepEqual(calls, [
    { queryKey: ['fire-extinguisher-creation-requests', 'list'] },
    { queryKey: ['fire-extinguisher-creation-requests', 'detail', 'request-1'], exact: true },
    { queryKey: ['fire-extinguishers'], exact: true },
    { queryKey: ['fire-extinguishers', 'paginated'] },
    { queryKey: ['fire-extinguishers', 'dashboard-summary'], exact: true },
    { queryKey: ['fire-extinguisher-audits', 'coverage'] },
    { queryKey: ['fire-extinguisher-audits', 'audit-dashboard'] },
  ])
})

test('rechazar no refresca inventario, cobertura ni dashboards', async () => {
  const calls: Array<{ queryKey: readonly unknown[]; exact?: boolean }> = []
  await invalidateCreationRequestReviewQueries(
    { invalidateQueries: async (filters) => { calls.push(filters) } },
    'request-2',
    'REJECT',
  )

  assert.deepEqual(calls, [
    { queryKey: ['fire-extinguisher-creation-requests', 'list'] },
    { queryKey: ['fire-extinguisher-creation-requests', 'detail', 'request-2'], exact: true },
  ])
})
