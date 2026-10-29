import {
  toISODate,
  isReasonableDate,
  computeExpirationStatus,
  computePolicyStatus,
  buildPolicyStatusFilter,
  businessDateStr,
  businessDateOffset,
  computeEffectivePolicyStatus,
  buildEffectivePolicyStatusFilter,
  POLICY_EFFECTIVE_STATUSES,
  coverageAsOfDate,
  isPolicyInForceOn,
  isCoverageLineInForceOn,
  policyInForceWhere,
  coverageLineInForceWhere,
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

// ── Estado administrativo de pólizas (effectiveStatus) ───────────────────────

describe('businessDateStr / businessDateOffset (día de Argentina)', () => {
  it('keeps the Argentine calendar day until 23:59 local time (02:59 UTC of the next day)', () => {
    expect(businessDateStr(new Date('2026-12-01T02:59:59.999Z'))).toBe('2026-11-30')
    expect(businessDateStr(new Date('2026-12-01T03:00:00.000Z'))).toBe('2026-12-01')
  })

  it('crosses month and year boundaries', () => {
    expect(businessDateStr(new Date('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
    expect(businessDateStr(new Date('2027-03-01T02:59:00Z'))).toBe('2027-02-28')
  })

  it('returns midnight UTC dates for Prisma @db.Date comparisons', () => {
    const now = new Date('2026-12-01T02:30:00Z') // 30/11 23:30 en Argentina
    expect(businessDateOffset(0, now).toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(businessDateOffset(30, now).toISOString()).toBe('2026-12-30T00:00:00.000Z')
  })
})

describe('computeEffectivePolicyStatus', () => {
  // 15/06/2026 12:00 en Argentina.
  const NOW = new Date('2026-06-15T15:00:00Z')
  const status = (endDate: string, opts: { renewed?: boolean; deBaja?: boolean } = {}) =>
    computeEffectivePolicyStatus(
      { endDate, deactivatedAt: opts.deBaja ? new Date('2026-01-10T12:00:00Z') : null, hasActiveRenewal: !!opts.renewed },
      NOW,
    )

  it.each([
    ['vigente', '2026-12-31', {}],
    ['proxima_a_vencer', '2026-07-10', {}],
    ['renovada', '2026-12-31', { renewed: true }],
    ['renovada', '2026-07-10', { renewed: true }],
    ['vencida', '2026-06-14', {}],
    ['vencida_renovada', '2026-06-14', { renewed: true }],
    ['de_baja', '2026-12-31', { deBaja: true }],
  ] as const)('returns %s for endDate %s %j', (expected, endDate, opts) => {
    expect(status(endDate, opts)).toBe(expected)
  })

  it('gives manual baja priority over a registered renewal (expired or not)', () => {
    expect(status('2026-12-31', { renewed: true, deBaja: true })).toBe('de_baja')
    expect(status('2026-01-31', { renewed: true, deBaja: true })).toBe('de_baja')
  })

  it('a renewed policy is Renovada (not Próxima a vencer) even inside the 30-day window', () => {
    expect(status('2026-06-20')).toBe('proxima_a_vencer')
    expect(status('2026-06-20', { renewed: true })).toBe('renovada')
  })

  it('reverting a renewal after expiry falls back to Vencida; before expiry to the date-based state', () => {
    expect(status('2026-06-14', { renewed: false })).toBe('vencida')
    expect(status('2026-07-10', { renewed: false })).toBe('proxima_a_vencer')
    expect(status('2026-12-31', { renewed: false })).toBe('vigente')
  })

  it('the end date itself is still in force (inclusive) — expires the next Argentine day', () => {
    expect(status('2026-06-15')).toBe('proxima_a_vencer')
    expect(status('2026-06-15', { renewed: true })).toBe('renovada')
  })

  it('switches Renovada → Vencida (renovada) exactly at Argentine midnight, not at UTC midnight', () => {
    const policy = { endDate: '2026-11-30', deactivatedAt: null, hasActiveRenewal: true }
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T00:30:00Z'))).toBe('renovada') // 30/11 21:30 AR
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T02:59:59Z'))).toBe('renovada') // 30/11 23:59 AR
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T03:00:00Z'))).toBe('vencida_renovada') // 01/12 00:00 AR
  })

  it('applies the same Argentine boundary to policies without renewal', () => {
    const policy = { endDate: '2026-11-30', deactivatedAt: null, hasActiveRenewal: false }
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T02:59:59Z'))).toBe('proxima_a_vencer')
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T03:00:00Z'))).toBe('vencida')
  })

  it('uses the Argentine day for the 30-day warning threshold', () => {
    const policy = { endDate: '2026-12-31', deactivatedAt: null, hasActiveRenewal: false }
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T02:59:59Z'))).toBe('vigente') // AR 30/11: límite 30/12
    expect(computeEffectivePolicyStatus(policy, new Date('2026-12-01T03:00:00Z'))).toBe('proxima_a_vencer') // AR 01/12: límite 31/12
  })
})

describe('buildEffectivePolicyStatusFilter', () => {
  const NOW = new Date('2026-12-01T02:30:00Z') // 30/11 23:30 en Argentina
  const today = new Date('2026-11-30T00:00:00.000Z')
  const in30 = new Date('2026-12-30T00:00:00.000Z')
  const renewed = { renewalLinksAsPrevious: { some: { revokedAt: null } } }
  const notRenewed = { renewalLinksAsPrevious: { none: { revokedAt: null } } }

  it.each([
    ['de_baja', { deactivatedAt: { not: null } }],
    ['vencida_renovada', { deactivatedAt: null, endDate: { lt: today }, ...renewed }],
    ['vencida', { deactivatedAt: null, endDate: { lt: today }, ...notRenewed }],
    ['renovada', { deactivatedAt: null, endDate: { gte: today }, ...renewed }],
    ['proxima_a_vencer', { deactivatedAt: null, endDate: { gte: today, lte: in30 }, ...notRenewed }],
    ['vigente', { deactivatedAt: null, endDate: { gt: in30 }, ...notRenewed }],
  ] as const)('builds %s with the Argentine day', (status, expected) => {
    expect(buildEffectivePolicyStatusFilter(status, NOW)).toEqual(expected)
  })

  it('only considers non-revoked renewal links', () => {
    for (const status of POLICY_EFFECTIVE_STATUSES) {
      const filter = buildEffectivePolicyStatusFilter(status, NOW) as { renewalLinksAsPrevious?: Record<string, { revokedAt: null }> }
      if (filter.renewalLinksAsPrevious) expect(Object.values(filter.renewalLinksAsPrevious)[0]).toEqual({ revokedAt: null })
    }
  })

  // Misma prioridad que computeEffectivePolicyStatus: evaluar cada filtro en
  // memoria sobre una grilla de casos debe dar exactamente un estado, el mismo.
  it('the six filters are mutually exclusive, cover every case and agree with computeEffectivePolicyStatus', () => {
    type Filter = {
      deactivatedAt?: null | { not: null }
      endDate?: { lt?: Date; gt?: Date; gte?: Date; lte?: Date }
      renewalLinksAsPrevious?: { some?: unknown; none?: unknown }
    }
    const matches = (raw: Record<string, unknown>, p: { endDate: Date; deactivatedAt: Date | null; renewed: boolean }) => {
      const filter = raw as Filter
      if ('deactivatedAt' in filter) {
        if (filter.deactivatedAt === null && p.deactivatedAt !== null) return false
        if (filter.deactivatedAt?.not === null && p.deactivatedAt === null) return false
      }
      const end = filter.endDate
      if (end?.lt && !(p.endDate < end.lt)) return false
      if (end?.gt && !(p.endDate > end.gt)) return false
      if (end?.gte && !(p.endDate >= end.gte)) return false
      if (end?.lte && !(p.endDate <= end.lte)) return false
      if (filter.renewalLinksAsPrevious?.some && !p.renewed) return false
      if (filter.renewalLinksAsPrevious?.none && p.renewed) return false
      return true
    }
    for (const endDate of ['2026-11-29', '2026-11-30', '2026-12-30', '2026-12-31']) {
      for (const deactivatedAt of [null, new Date('2026-05-01T00:00:00Z')]) {
        for (const renewed of [false, true]) {
          const p = { endDate: new Date(`${endDate}T00:00:00.000Z`), deactivatedAt, renewed }
          const hits = POLICY_EFFECTIVE_STATUSES.filter((s) => matches(buildEffectivePolicyStatusFilter(s, NOW), p))
          expect(hits).toEqual([computeEffectivePolicyStatus({ endDate: p.endDate, deactivatedAt, hasActiveRenewal: renewed }, NOW)])
        }
      }
    }
  })

  it('leaves the contractual status untouched (still UTC, no renewal concept)', () => {
    expect(buildPolicyStatusFilter('vencida')).not.toHaveProperty('renewalLinksAsPrevious')
    expect(buildPolicyStatusFilter('vigente')).not.toHaveProperty('renewalLinksAsPrevious')
  })
})

// ── Vigencia efectiva — cobertura activa para indicadores (R4-A) ─────────────

describe('isPolicyInForceOn / isCoverageLineInForceOn (R4-A)', () => {
  const TODAY = '2026-11-15'
  const policy = (startDate: string, endDate: string, deactivatedAt: Date | null = null) => ({ startDate, endDate, deactivatedAt })
  const line = (effectiveDate: string, bajaDate: string | null = null) => ({ effectiveDate, bajaDate })
  const IN_FORCE = policy('2026-01-01', '2026-12-31')

  it.each([
    ['1. a future policy (starts tomorrow) does not contribute', policy('2026-11-16', '2027-11-15'), false],
    ['2. a policy that starts today contributes', policy('2026-11-15', '2027-11-14'), true],
    ['3. a policy that ends today contributes', policy('2025-11-16', '2026-11-15'), true],
    ['4. an expired policy (ended yesterday) does not contribute', policy('2025-11-15', '2026-11-14'), false],
    ['5. a manually deactivated policy does not contribute, even within its dates', policy('2026-01-01', '2026-12-31', new Date('2026-06-01T12:00:00Z')), false],
  ])('%s', (_label, p, expected) => {
    expect(isPolicyInForceOn(p, TODAY)).toBe(expected)
    // Una línea perfectamente vigente no compensa una póliza fuera de vigencia.
    expect(isCoverageLineInForceOn(p, line('2025-01-01'), TODAY)).toBe(expected)
  })

  it.each([
    ['6. a future line does not contribute', line('2026-11-16'), false],
    ['7. a line that starts today contributes', line('2026-11-15'), true],
    ['8. a line with a past bajaDate does not contribute', line('2026-01-01', '2026-11-14'), false],
    ['9. a line with bajaDate = today still contributes (bajaDate is inclusive)', line('2026-01-01', '2026-11-15'), true],
    ['10. a line with a future bajaDate contributes', line('2026-01-01', '2026-11-30'), true],
  ])('%s', (_label, l, expected) => {
    expect(isCoverageLineInForceOn(IN_FORCE, l, TODAY)).toBe(expected)
  })

  it('9b. the day after bajaDate the line stops contributing', () => {
    expect(isCoverageLineInForceOn(IN_FORCE, line('2026-01-01', '2026-11-15'), '2026-11-16')).toBe(false)
  })

  it('11. two genuinely overlapping policies on the same asset both contribute (no deduplication in R4-A)', () => {
    const lines = [
      { p: policy('2026-01-01', '2026-12-31'), l: line('2026-01-01') },
      { p: policy('2026-11-01', '2027-10-31'), l: line('2026-11-01') },
    ]
    expect(lines.filter(({ p, l }) => isCoverageLineInForceOn(p, l, TODAY))).toHaveLength(2)
  })

  it('12. a registered renewal does not change, by itself, whether the lines are in force', () => {
    const renewed = { ...IN_FORCE, effectiveStatus: 'renovada', hasActiveRenewal: true }
    expect(isCoverageLineInForceOn(renewed, line('2026-01-01'), TODAY)).toBe(true)
    const expiredRenewed = { ...policy('2025-11-15', '2026-11-14'), effectiveStatus: 'vencida_renovada', hasActiveRenewal: true }
    expect(isCoverageLineInForceOn(expiredRenewed, line('2025-11-15'), TODAY)).toBe(false)
    expect(JSON.stringify([policyInForceWhere(new Date()), coverageLineInForceWhere(new Date())])).not.toMatch(/renewal/i)
  })

  it('accepts Prisma @db.Date values (midnight UTC) and YYYY-MM-DD strings alike', () => {
    const fromDb = { startDate: new Date('2026-11-15T00:00:00Z'), endDate: new Date('2027-11-14T00:00:00Z'), deactivatedAt: null }
    expect(isPolicyInForceOn(fromDb, new Date('2026-11-15T00:00:00Z'))).toBe(true)
    expect(isPolicyInForceOn(fromDb, '2026-11-14')).toBe(false)
  })
})

describe('coverageAsOfDate — día de Argentina (R4-A)', () => {
  it('13. between 21:00 and 23:59 in Argentina the UTC day already changed; the coverage day did not', () => {
    const lateNight = new Date('2026-12-01T02:30:00Z') // 30/11 23:30 en Argentina
    expect(toISODate(lateNight)).toBe('2026-12-01')
    expect(coverageAsOfDate(lateNight).toISOString()).toBe('2026-11-30T00:00:00.000Z')

    const endsNov30 = { startDate: '2025-12-01', endDate: '2026-11-30', deactivatedAt: null }
    expect(isPolicyInForceOn(endsNov30, coverageAsOfDate(lateNight))).toBe(true)
    // Con el día UTC (criterio anterior) dejaba de sumar 3 horas antes.
    expect(isPolicyInForceOn(endsNov30, toISODate(lateNight))).toBe(false)

    const startsDec1 = { startDate: '2026-12-01', endDate: '2027-11-30', deactivatedAt: null }
    expect(isPolicyInForceOn(startsDec1, coverageAsOfDate(lateNight))).toBe(false)
  })

  it('changes day at 00:00 in Argentina (03:00 UTC)', () => {
    expect(coverageAsOfDate(new Date('2026-12-01T02:59:59.999Z')).toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(coverageAsOfDate(new Date('2026-12-01T03:00:00.000Z')).toISOString()).toBe('2026-12-01T00:00:00.000Z')
  })
})

describe('policyInForceWhere / coverageLineInForceWhere (R4-A)', () => {
  // Evaluador mínimo de los operadores que usan estos filtros (null, lte/gte
  // sobre fechas a medianoche UTC, OR) — para probar que el agregado en base
  // decide exactamente igual que la versión pura.
  type Where = Record<string, unknown>
  function matches(record: Record<string, Date | null>, where: Where): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === 'OR') return (condition as Where[]).some((w) => matches(record, w))
      const value = record[key]
      if (condition === null) return value === null
      if (value === null) return false
      const { lte, gte } = condition as { lte?: Date; gte?: Date }
      return (lte === undefined || value.getTime() <= lte.getTime()) && (gte === undefined || value.getTime() >= gte.getTime())
    })
  }
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`)
  const ASOF = d('2026-11-15')
  const DAYS = ['2026-11-14', '2026-11-15', '2026-11-16']

  it('builds the expected Prisma shape', () => {
    expect(policyInForceWhere(ASOF)).toEqual({ deactivatedAt: null, startDate: { lte: ASOF }, endDate: { gte: ASOF } })
    expect(coverageLineInForceWhere(ASOF)).toEqual({ effectiveDate: { lte: ASOF }, OR: [{ bajaDate: null }, { bajaDate: { gte: ASOF } }] })
  })

  it('agrees with isPolicyInForceOn on every boundary combination', () => {
    for (const start of DAYS) {
      for (const end of DAYS.filter((e) => e >= start)) {
        for (const deactivatedAt of [null, new Date('2026-10-01T15:00:00Z')]) {
          const record = { startDate: d(start), endDate: d(end), deactivatedAt }
          expect(matches(record, policyInForceWhere(ASOF))).toBe(isPolicyInForceOn(record, ASOF))
        }
      }
    }
  })

  it('agrees with isCoverageLineInForceOn (line part) on every boundary combination', () => {
    for (const effective of DAYS) {
      for (const baja of [null, ...DAYS.filter((b) => b >= effective)]) {
        const record = { effectiveDate: d(effective), bajaDate: baja ? d(baja) : null }
        expect(matches(record, coverageLineInForceWhere(ASOF))).toBe(
          isCoverageLineInForceOn({ startDate: ASOF, endDate: ASOF, deactivatedAt: null }, record, ASOF),
        )
      }
    }
  })
})
