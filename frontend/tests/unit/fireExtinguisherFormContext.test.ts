import test from 'node:test'
import assert from 'node:assert/strict'
import { fireExtinguisherFormCapabilities } from '../../src/shared/utils/fireExtinguisherFormContext'

test('alta normal conserva el selector y la consulta general de activos', () => {
  assert.equal(fireExtinguisherFormCapabilities('inventory').canSelectAssociatedAsset, true)
})

test('solicitud de auditor con permisos limitados no monta ni consulta el selector de activos', () => {
  assert.equal(fireExtinguisherFormCapabilities('audit-request').canSelectAssociatedAsset, false)
})
