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

  it('behaves exactly like the charge-only calculation when hydraulicTestExpirationDate is not provided', () => {
    expect(computeFireExtinguisherStatus(isoDateOffset(365), null, null)).toBe('vigente')
    expect(computeFireExtinguisherStatus(isoDateOffset(365), null, undefined)).toBe('vigente')
  })

  it('returns vencido when only the hydraulic test is expired but charge and manufacturing life are vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(365), currentYear, isoDateOffset(-1))
    expect(status).toBe('vencido')
  })

  it('returns proximo_vencer when the hydraulic test is at risk and the rest are vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(365), currentYear, isoDateOffset(15))
    expect(status).toBe('proximo_vencer')
  })

  it('returns vigente only when charge, manufacturing life and hydraulic test are all vigente', () => {
    const status = computeFireExtinguisherStatus(isoDateOffset(365), currentYear, isoDateOffset(365))
    expect(status).toBe('vigente')
  })

  it('returns sin_fecha when expirationDate is null, regardless of the other fields', () => {
    expect(computeFireExtinguisherStatus(null, null, null)).toBe('sin_fecha')
    expect(computeFireExtinguisherStatus(null, currentYear - MANUFACTURING_LIFESPAN_YEARS - 1, isoDateOffset(-1))).toBe(
      'sin_fecha',
    )
  })
})

// ── buildFireExtinguisherStatusFilter ──────────────────────────────────────────

describe('buildFireExtinguisherStatusFilter', () => {
  it('returns an OR filter for vencido combining charge, manufacturing year and hydraulic test', () => {
    const filter = buildFireExtinguisherStatusFilter('vencido') as { OR: unknown[] }
    expect(filter.OR).toHaveLength(3)
  })

  it('returns an AND filter for proximo_vencer', () => {
    const filter = buildFireExtinguisherStatusFilter('proximo_vencer') as { AND: unknown[] }
    expect(filter.AND).toHaveLength(4)
  })

  it('returns an AND filter for vigente', () => {
    const filter = buildFireExtinguisherStatusFilter('vigente') as { AND: unknown[] }
    expect(filter.AND).toHaveLength(3)
  })

  it('returns an empty object for unknown status', () => {
    expect(buildFireExtinguisherStatusFilter('unknown')).toEqual({})
  })

  it('returns a plain expirationDate: null filter for sin_fecha', () => {
    expect(buildFireExtinguisherStatusFilter('sin_fecha')).toEqual({ expirationDate: null })
  })

  it('excludes null expirationDate from vencido/proximo_vencer/vigente', () => {
    const vencido = buildFireExtinguisherStatusFilter('vencido') as { expirationDate: unknown }
    const proximo = buildFireExtinguisherStatusFilter('proximo_vencer') as { expirationDate: unknown }
    const vigente = buildFireExtinguisherStatusFilter('vigente') as { expirationDate: unknown }
    expect(vencido.expirationDate).toEqual({ not: null })
    expect(proximo.expirationDate).toEqual({ not: null })
    expect(vigente.expirationDate).toEqual({ not: null })
  })

  // Invariante: los 4 filtros deben ser mutuamente excluyentes y exhaustivos
  // sobre cualquier combinación de expirationDate/manufacturingYear/
  // hydraulicTestExpirationDate (incluidos los null, el caso de los
  // registros legacy y de los matafuegos cargados sin fecha).
  describe('mutual exclusivity across fixtures', () => {
    type Fixture = { expirationDate: string | null; manufacturingYear: number | null; hydraulicTestExpirationDate: string | null }

    const fixtures: Fixture[] = [
      { expirationDate: isoDateOffset(-10), manufacturingYear: null, hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(10), manufacturingYear: null, hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: null, hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: currentYear - MANUFACTURING_LIFESPAN_YEARS - 1, hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: currentYear - MANUFACTURING_LIFESPAN_YEARS, hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: currentYear - (MANUFACTURING_LIFESPAN_YEARS - 1), hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(-1), manufacturingYear: currentYear - (MANUFACTURING_LIFESPAN_YEARS - 1), hydraulicTestExpirationDate: null },
      { expirationDate: isoDateOffset(60), manufacturingYear: null, hydraulicTestExpirationDate: isoDateOffset(-10) },
      { expirationDate: isoDateOffset(60), manufacturingYear: null, hydraulicTestExpirationDate: isoDateOffset(10) },
      { expirationDate: isoDateOffset(60), manufacturingYear: null, hydraulicTestExpirationDate: isoDateOffset(60) },
      { expirationDate: null, manufacturingYear: null, hydraulicTestExpirationDate: null },
      { expirationDate: null, manufacturingYear: currentYear - MANUFACTURING_LIFESPAN_YEARS - 1, hydraulicTestExpirationDate: isoDateOffset(-1) },
    ]

    function matchesFilter(fixture: Fixture, status: string): boolean {
      if (fixture.expirationDate == null) return status === 'sin_fecha'
      if (status === 'sin_fecha') return false

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

      const hydraulic = fixture.hydraulicTestExpirationDate ? new Date(fixture.hydraulicTestExpirationDate + 'T00:00:00.000Z') : null
      const hydraulicExpired = hydraulic != null && hydraulic < today
      const hydraulicAtRisk = hydraulic != null && !hydraulicExpired && hydraulic <= in30Days

      if (status === 'vencido') return chargeExpired || lifeExpired || hydraulicExpired
      if (status === 'proximo_vencer')
        return !chargeExpired && !lifeExpired && !hydraulicExpired && (chargeAtRisk || lifeAtRisk || hydraulicAtRisk)
      if (status === 'vigente')
        return !chargeExpired && !chargeAtRisk && !lifeExpired && !lifeAtRisk && !hydraulicExpired && !hydraulicAtRisk
      return false
    }

    const ALL_STATUSES = ['vencido', 'proximo_vencer', 'vigente', 'sin_fecha']

    it('each fixture matches exactly one of vencido/proximo_vencer/vigente/sin_fecha', () => {
      for (const fixture of fixtures) {
        const matches = ALL_STATUSES.filter((s) => matchesFilter(fixture, s))
        expect(matches).toHaveLength(1)
      }
    })

    it('each fixture status matches computeFireExtinguisherStatus for the same inputs', () => {
      for (const fixture of fixtures) {
        const computed = computeFireExtinguisherStatus(
          fixture.expirationDate,
          fixture.manufacturingYear,
          fixture.hydraulicTestExpirationDate,
        )
        const filterMatch = ALL_STATUSES.find((s) => matchesFilter(fixture, s))
        expect(computed).toBe(filterMatch)
      }
    })
  })
})

// ── buildFireExtinguisherAtRiskFilter ──────────────────────────────────────────

describe('buildFireExtinguisherAtRiskFilter', () => {
  it('returns an OR filter combining charge, manufacturing year and hydraulic test thresholds', () => {
    const filter = buildFireExtinguisherAtRiskFilter(30) as { OR: unknown[] }
    expect(filter.OR).toHaveLength(3)
  })

  it('excludes fire extinguishers without expirationDate — they never generate alerts', () => {
    const filter = buildFireExtinguisherAtRiskFilter(30) as { expirationDate: unknown }
    expect(filter.expirationDate).toEqual({ not: null })
  })
})
