import {
  toISODate,
  isReasonableDate,
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

  it('returns proximo_vencer for a date within 30 days', () => {
    expect(computeExpirationStatus(isoDateOffset(1))).toBe('proximo_vencer')
    expect(computeExpirationStatus(isoDateOffset(15))).toBe('proximo_vencer')
    expect(computeExpirationStatus(isoDateOffset(30))).toBe('proximo_vencer')
  })

  it('returns vigente for a date beyond the warning window', () => {
    expect(computeExpirationStatus(isoDateOffset(31))).toBe('vigente')
    expect(computeExpirationStatus('2099-12-31')).toBe('vigente')
  })

  it('respects custom daysWarning parameter', () => {
    // Con daysWarning=10, fecha en 15 días debería ser vigente
    expect(computeExpirationStatus(isoDateOffset(15), 10)).toBe('vigente')
    // Con daysWarning=10, fecha en 8 días debería ser proximo_vencer
    expect(computeExpirationStatus(isoDateOffset(8), 10)).toBe('proximo_vencer')
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

  it('returns deactivatedAt not-null filter for de_baja', () => {
    expect(buildPolicyStatusFilter('de_baja')).toEqual({ deactivatedAt: { not: null } })
  })

  it('excludes dadas de baja from vigente/proxima_a_vencer/vencida (deactivatedAt: null)', () => {
    expect(buildPolicyStatusFilter('vigente')).toHaveProperty('deactivatedAt', null)
    expect(buildPolicyStatusFilter('proxima_a_vencer')).toHaveProperty('deactivatedAt', null)
    expect(buildPolicyStatusFilter('vencida')).toHaveProperty('deactivatedAt', null)
  })

  it('generates Date objects (not strings) in filter values, as required by Prisma for @db.Date filtering', () => {
    const filter = buildPolicyStatusFilter('vencida') as { endDate: { lt: Date } }
    expect(filter.endDate.lt).toBeInstanceOf(Date)
    expect(filter.endDate.lt.toISOString()).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/)
  })
})

// ── isReasonableDate ────────────────────────────────────────────────────────

describe('isReasonableDate', () => {
  const currentYear = new Date().getFullYear()

  it('accepts a normal recent date', () => {
    expect(isReasonableDate('2025-08-15')).toBe(true)
  })

  it('accepts today', () => {
    const today = toISODate()
    expect(isReasonableDate(today)).toBe(true)
  })

  it('accepts a date exactly at the future boundary (today + 10 years)', () => {
    expect(isReasonableDate(`${currentYear + 10}-12-31`)).toBe(true)
  })

  it('rejects a date one year beyond the future boundary (today + 11 years)', () => {
    expect(isReasonableDate(`${currentYear + 11}-01-01`)).toBe(false)
  })

  it('rejects the production bug date 2206-10-17', () => {
    expect(isReasonableDate('2206-10-17')).toBe(false)
  })

  it('rejects year 2099', () => {
    expect(isReasonableDate('2099-12-31')).toBe(false)
  })

  it('rejects year 3026', () => {
    expect(isReasonableDate('3026-01-01')).toBe(false)
  })

  it('accepts an old valid date like 2015-01-01', () => {
    expect(isReasonableDate('2015-01-01')).toBe(true)
  })

  it('accepts the minimum boundary 1900-01-01', () => {
    expect(isReasonableDate('1900-01-01')).toBe(true)
  })

  it('rejects dates before 1900', () => {
    expect(isReasonableDate('1899-12-31')).toBe(false)
  })

  it('rejects invalid format', () => {
    expect(isReasonableDate('')).toBe(false)
    expect(isReasonableDate('not-a-date')).toBe(false)
    expect(isReasonableDate('2025/08/15')).toBe(false)
  })

  it('rejects non-existent dates like 2025-02-30', () => {
    expect(isReasonableDate('2025-02-30')).toBe(false)
  })

  it('respects custom minYear', () => {
    expect(isReasonableDate('1950-01-01', { minYear: 1950 })).toBe(true)
    expect(isReasonableDate('1949-12-31', { minYear: 1950 })).toBe(false)
  })

  it('respects custom maxYearsFromNow', () => {
    expect(isReasonableDate(`${currentYear + 3}-06-15`, { maxYearsFromNow: 5 })).toBe(true)
    expect(isReasonableDate(`${currentYear + 6}-01-01`, { maxYearsFromNow: 5 })).toBe(false)
  })
})
