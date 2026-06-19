import {
  toISODate,
  computeExpirationStatus,
  computePolicyStatus,
  buildPolicyStatusFilter,
} from '../dates'

function isoDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── toISODate ─────────────────────────────────────────────────────────────────

describe('toISODate', () => {
  it('returns today in YYYY-MM-DD format when called without args', () => {
    const result = toISODate()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result).toBe(new Date().toISOString().slice(0, 10))
  })

  it('formats a specific date correctly', () => {
    const d = new Date('2024-06-15T12:00:00Z')
    expect(toISODate(d)).toBe('2024-06-15')
  })

  it('formats year boundary correctly', () => {
    const d = new Date('2023-12-31T23:59:59Z')
    expect(toISODate(d)).toBe('2023-12-31')
  })
})

// ── computeExpirationStatus ───────────────────────────────────────────────────

describe('computeExpirationStatus', () => {
  it('returns vencido for a date in the far past', () => {
    expect(computeExpirationStatus('2020-01-01')).toBe('vencido')
  })

  it('returns vencido for yesterday', () => {
    expect(computeExpirationStatus(isoDateOffset(-1))).toBe('vencido')
  })

  it('returns proximo_a_vencer for a date within 30 days', () => {
    expect(computeExpirationStatus(isoDateOffset(1))).toBe('proximo_a_vencer')
    expect(computeExpirationStatus(isoDateOffset(15))).toBe('proximo_a_vencer')
    expect(computeExpirationStatus(isoDateOffset(30))).toBe('proximo_a_vencer')
  })

  it('returns vigente for a date beyond the warning window', () => {
    expect(computeExpirationStatus(isoDateOffset(31))).toBe('vigente')
    expect(computeExpirationStatus('2099-12-31')).toBe('vigente')
  })

  it('respects custom daysWarning parameter', () => {
    // Con daysWarning=10, fecha en 15 días debería ser vigente
    expect(computeExpirationStatus(isoDateOffset(15), 10)).toBe('vigente')
    // Con daysWarning=10, fecha en 8 días debería ser proximo_a_vencer
    expect(computeExpirationStatus(isoDateOffset(8), 10)).toBe('proximo_a_vencer')
  })
})

// ── computePolicyStatus ───────────────────────────────────────────────────────

describe('computePolicyStatus', () => {
  it('returns vencida for a date in the far past', () => {
    expect(computePolicyStatus('2020-01-01')).toBe('vencida')
  })

  it('returns vencida for yesterday', () => {
    expect(computePolicyStatus(isoDateOffset(-1))).toBe('vencida')
  })

  it('returns proxima_a_vencer for a date within 30 days', () => {
    expect(computePolicyStatus(isoDateOffset(1))).toBe('proxima_a_vencer')
    expect(computePolicyStatus(isoDateOffset(20))).toBe('proxima_a_vencer')
    expect(computePolicyStatus(isoDateOffset(30))).toBe('proxima_a_vencer')
  })

  it('returns vigente for a date beyond the warning window', () => {
    expect(computePolicyStatus(isoDateOffset(31))).toBe('vigente')
    expect(computePolicyStatus('2099-12-31')).toBe('vigente')
  })

  it('uses feminine form (vencida, proxima_a_vencer) unlike ExpirationStatus', () => {
    const resultPast = computePolicyStatus('2020-01-01')
    const resultNear = computePolicyStatus(isoDateOffset(10))
    expect(resultPast).toBe('vencida')
    expect(resultNear).toBe('proxima_a_vencer')
    // Not vencido/proximo_a_vencer
    expect(resultPast).not.toBe('vencido')
  })
})

// ── buildPolicyStatusFilter ───────────────────────────────────────────────────

describe('buildPolicyStatusFilter', () => {
  it('returns gt filter for vigente', () => {
    const filter = buildPolicyStatusFilter('vigente')
    expect(filter).toHaveProperty('endDate')
    expect(filter.endDate).toHaveProperty('gt')
  })

  it('returns gte+lte range filter for proxima_a_vencer', () => {
    const filter = buildPolicyStatusFilter('proxima_a_vencer')
    expect(filter).toHaveProperty('endDate')
    expect(filter.endDate).toHaveProperty('gte')
    expect(filter.endDate).toHaveProperty('lte')
  })

  it('returns lt filter for vencida', () => {
    const filter = buildPolicyStatusFilter('vencida')
    expect(filter).toHaveProperty('endDate')
    expect(filter.endDate).toHaveProperty('lt')
  })

  it('returns empty object for unknown status', () => {
    expect(buildPolicyStatusFilter('unknown')).toEqual({})
    expect(buildPolicyStatusFilter('')).toEqual({})
  })

  it('generates ISO date strings in filter values', () => {
    const filter = buildPolicyStatusFilter('vencida') as { endDate: { lt: string } }
    expect(filter.endDate.lt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
