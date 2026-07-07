import {
  computeManufacturingLifeStatus,
  computeFireExtinguisherStatus,
  buildFireExtinguisherStatusFilter,
  buildFireExtinguisherAtRiskFilter,
  manufacturingExpirationYear,
  MANUFACTURING_LIFESPAN_YEARS,
} from '../fire-extinguishers.expiration'

function isoDateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const currentYear = new Date().getUTCFullYear()

// ── computeManufacturingLifeStatus ─────────────────────────────────────────────

describe('computeManufacturingLifeStatus', () => {
  it('returns null when manufacturingYear is not provided', () => {
    expect(computeManufacturingLifeStatus(null)).toBeNull()
    expect(computeManufacturingLifeStatus(undefined)).toBeNull()
  })

  it('returns vigente when the 20-year anniversary is in the future', () => {
    expect(computeManufacturingLifeStatus(currentYear - (MANUFACTURING_LIFESPAN_YEARS - 1))).toBe('vigente')
  })

  it('returns proximo_vencer during the calendar year the 20-year anniversary falls in', () => {
    expect(computeManufacturingLifeStatus(currentYear - MANUFACTURING_LIFESPAN_YEARS)).toBe('proximo_vencer')
  })

  it('returns vencido starting the year after the 20-year anniversary', () => {
    expect(computeManufacturingLifeStatus(currentYear - MANUFACTURING_LIFESPAN_YEARS - 1)).toBe('vencido')
  })
})

// ── manufacturingExpirationYear ────────────────────────────────────────────────

describe('manufacturingExpirationYear', () => {
  it('adds MANUFACTURING_LIFESPAN_YEARS to the manufacturing year', () => {
    expect(manufacturingExpirationYear(2020)).toBe(2020 + MANUFACTURING_LIFESPAN_YEARS)
  })

  it('returns null when manufacturingYear is not provided', () => {
    expect(manufacturingExpirationYear(null)).toBeNull()
    expect(manufacturingExpirationYear(undefined)).toBeNull()
  })
})

// ── computeFireExtinguisherStatus (combinado: carga + vida útil) ──────────────

describe('computeFireExtinguisherStatus', () => {
  it('behaves exactly like the charge-only calculation when manufacturingYear is null', () => {
    expect(computeFireExtinguisherStatus(isoDateOffset(-1), null)).toBe('vencido')
    expect(computeFireExtinguisherStatus(isoDateOffset(15), null)).toBe('proximo_vencer')
    expect(computeFireExtinguisherStatus(isoDateOffset(60), null)).toBe('vigente')
  })

  it('returns vencido when only manufacturing life is expired but charge is vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(365), currentYear - MANUFACTURING_LIFESPAN_YEARS - 1)
    expect(status).toBe('vencido')
  })

  it('returns vencido when only charge is expired but manufacturing life is vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(-5), currentYear - 1)
    expect(status).toBe('vencido')
  })

  it('returns proximo_vencer when manufacturing life is at risk and charge is vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(365), currentYear - MANUFACTURING_LIFESPAN_YEARS)
    expect(status).toBe('proximo_vencer')
  })

  it('returns vigente only when both charge and manufacturing life are vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(365), currentYear - (MANUFACTURING_LIFESPAN_YEARS - 1))
    expect(status).toBe('vigente')
  })

  it('respects the boundary at exactly 30 days for the charge component', () => {
    expect(computeFireExtinguisherStatus(isoDateOffset(30), null)).toBe('proximo_vencer')
    expect(computeFireExtinguisherStatus(isoDateOffset(31), null)).toBe('vigente')
  })
})

// ── buildFireExtinguisherStatusFilter ──────────────────────────────────────────

describe('buildFireExtinguisherStatusFilter', () => {
  it('returns an OR filter for vencido combining charge and manufacturing year', () => {
    const filter = buildFireExtinguisherStatusFilter('vencido') as { OR: unknown[] }
    expect(filter.OR).toHaveLength(2)
  })

  it('returns an AND filter for proximo_vencer', () => {
    const filter = buildFireExtinguisherStatusFilter('proximo_vencer') as { AND: unknown[] }
    expect(filter.AND).toHaveLength(3)
  })

  it('returns an AND filter for vigente', () => {
    const filter = buildFireExtinguisherStatusFilter('vigente') as { AND: unknown[] }
    expect(filter.AND).toHaveLength(2)
  })

  it('returns an empty object for unknown status', () => {
    expect(buildFireExtinguisherStatusFilter('unknown')).toEqual({})
  })

  // Invariante: los 3 filtros deben ser mutuamente excluyentes y exhaustivos
  // sobre cualquier combinación de expirationDate/manufacturingYear (incluido
  // manufacturingYear null, el caso de los registros legacy).
  describe('mutual exclusivity across fixtures', () => {
    type Fixture = { expirationDate: string; manufacturingYear: number | null }

    const fixtures: Fixture[] = [
      { expirationDate: isoDateOffset(-10), manufacturingYear: null },
      { expirationDate: isoDateOffset(10), manufacturingYear: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: currentYear - MANUFACTURING_LIFESPAN_YEARS - 1 },
      { expirationDate: isoDateOffset(60), manufacturingYear: currentYear - MANUFACTURING_LIFESPAN_YEARS },
      { expirationDate: isoDateOffset(60), manufacturingYear: currentYear - (MANUFACTURING_LIFESPAN_YEARS - 1) },
      { expirationDate: isoDateOffset(-1), manufacturingYear: currentYear - (MANUFACTURING_LIFESPAN_YEARS - 1) },
    ]

    function matchesFilter(fixture: Fixture, status: string): boolean {
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const in30Days = new Date()
      in30Days.setUTCDate(in30Days.getUTCDate() + 30)
      in30Days.setUTCHours(0, 0, 0, 0)
      const exp = new Date(fixture.expirationDate + 'T00:00:00.000Z')
      const lifeLimitYear = currentYear - MANUFACTURING_LIFESPAN_YEARS

      const chargeExpired = exp < today
      const chargeAtRisk = !chargeExpired && exp <= in30Days
      const lifeExpired = fixture.manufacturingYear != null && fixture.manufacturingYear < lifeLimitYear
      const lifeAtRisk = fixture.manufacturingYear === lifeLimitYear

      if (status === 'vencido') return chargeExpired || lifeExpired
      if (status === 'proximo_vencer') return !chargeExpired && !lifeExpired && (chargeAtRisk || lifeAtRisk)
      if (status === 'vigente') return !chargeExpired && !chargeAtRisk && !lifeExpired && !lifeAtRisk
      return false
    }

    it('each fixture matches exactly one of vencido/proximo_vencer/vigente', () => {
      for (const fixture of fixtures) {
        const matches = ['vencido', 'proximo_vencer', 'vigente'].filter((s) => matchesFilter(fixture, s))
        expect(matches).toHaveLength(1)
      }
    })

    it('each fixture status matches computeFireExtinguisherStatus for the same inputs', () => {
      for (const fixture of fixtures) {
        const computed = computeFireExtinguisherStatus(fixture.expirationDate, fixture.manufacturingYear)
        const filterMatch = ['vencido', 'proximo_vencer', 'vigente'].find((s) => matchesFilter(fixture, s))
        expect(computed).toBe(filterMatch)
      }
    })
  })
})

// ── buildFireExtinguisherAtRiskFilter ──────────────────────────────────────────

describe('buildFireExtinguisherAtRiskFilter', () => {
  it('returns an OR filter combining charge and manufacturing year thresholds', () => {
    const filter = buildFireExtinguisherAtRiskFilter(30) as { OR: unknown[] }
    expect(filter.OR).toHaveLength(2)
  })
})
