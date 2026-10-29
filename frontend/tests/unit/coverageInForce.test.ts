import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coverageAsOfToday, isCoverageLineInForceOn, isPolicyInForceOn } from '../../src/shared/utils/coverageInForce'

// Vigencia efectiva del frontend (R4-A), mismos bordes que el backend.

const TODAY = '2026-11-15'
const policy = (startDate: string, endDate: string, status: 'vigente' | 'proximo_vencer' | 'vencida' | 'de_baja' | 'desconocido' = 'vigente') =>
  ({ startDate, endDate, status })
const line = (effectiveDate: string, bajaDate: string | null = null) => ({ effectiveDate, bajaDate })
const IN_FORCE = policy('2026-01-01', '2026-12-31')

test('póliza: futura no aporta, empieza hoy y vence hoy aportan, vencida y de baja no', () => {
  assert.equal(isPolicyInForceOn(policy('2026-11-16', '2027-11-15'), TODAY), false)
  assert.equal(isPolicyInForceOn(policy('2026-11-15', '2027-11-14'), TODAY), true)
  assert.equal(isPolicyInForceOn(policy('2025-11-16', '2026-11-15'), TODAY), true)
  assert.equal(isPolicyInForceOn(policy('2025-11-15', '2026-11-14', 'vencida'), TODAY), false)
  assert.equal(isPolicyInForceOn(policy('2026-01-01', '2026-12-31', 'de_baja'), TODAY), false)
  assert.equal(isPolicyInForceOn(policy('2026-01-01', '2026-12-31', 'desconocido'), TODAY), false)
})

test('línea: futura no, empieza hoy sí, baja pasada no, baja hoy sí (inclusiva), baja futura sí', () => {
  assert.equal(isCoverageLineInForceOn(IN_FORCE, line('2026-11-16'), TODAY), false)
  assert.equal(isCoverageLineInForceOn(IN_FORCE, line('2026-11-15'), TODAY), true)
  assert.equal(isCoverageLineInForceOn(IN_FORCE, line('2026-01-01', '2026-11-14'), TODAY), false)
  assert.equal(isCoverageLineInForceOn(IN_FORCE, line('2026-01-01', '2026-11-15'), TODAY), true)
  assert.equal(isCoverageLineInForceOn(IN_FORCE, line('2026-01-01', '2026-11-16'), TODAY), true)
  assert.equal(isCoverageLineInForceOn(IN_FORCE, line('2026-01-01', '2026-11-15'), '2026-11-16'), false)
})

test('día de Argentina: a las 23:30 del 30/11 (UTC ya es 01/12) sigue siendo 30/11', () => {
  assert.equal(coverageAsOfToday(new Date('2026-12-01T02:30:00Z')), '2026-11-30')
  assert.equal(coverageAsOfToday(new Date('2026-12-01T03:00:00Z')), '2026-12-01')
})
