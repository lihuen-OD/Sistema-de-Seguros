import { computeExpirationStatus, todayDate, dateOffset, type ExpirationStatus } from '../../shared/utils/dates'

export type FireExtStatus = ExpirationStatus

export const MANUFACTURING_LIFESPAN_YEARS = 20

const STATUS_RANK: Record<FireExtStatus, number> = {
  vigente: 0,
  proximo_vencer: 1,
  vencido: 2,
}

function worseStatus(a: FireExtStatus, b: FireExtStatus): FireExtStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b
}

/**
 * Status de vida útil a partir del año de fabricación.
 *
 * Fase 1 solo captura el AÑO de fabricación (no día/mes), por lo que la
 * granularidad es anual: se considera "próximo a vencer" durante todo el
 * año calendario en que se cumplen los MANUFACTURING_LIFESPAN_YEARS años,
 * y "vencido" recién a partir del 1 de enero del año siguiente.
 *
 * `manufacturingDate` queda preparado para una fase futura en la que se
 * capture la fecha exacta de fabricación: si se provee, tiene precedencia
 * y permite un cálculo con precisión de día (rolling window, igual que
 * `computeExpirationStatus`). Hoy siempre es `undefined`.
 */
export function computeManufacturingLifeStatus(
  manufacturingYear?: number | null,
  manufacturingDate?: Date | string | null,
  daysWarning = 30,
): FireExtStatus | null {
  if (manufacturingDate) {
    const limit = new Date(manufacturingDate)
    limit.setFullYear(limit.getFullYear() + MANUFACTURING_LIFESPAN_YEARS)
    return computeExpirationStatus(limit, daysWarning)
  }

  if (manufacturingYear == null) return null

  const limitYear = manufacturingYear + MANUFACTURING_LIFESPAN_YEARS
  const currentYear = new Date().getUTCFullYear()

  if (currentYear > limitYear) return 'vencido'
  if (currentYear === limitYear) return 'proximo_vencer'
  return 'vigente'
}

export function manufacturingExpirationYear(manufacturingYear?: number | null): number | null {
  return manufacturingYear != null ? manufacturingYear + MANUFACTURING_LIFESPAN_YEARS : null
}

/**
 * Status general de un matafuego: el peor entre el status de carga
 * (vencimiento de recarga) y el status de vida útil por fabricación.
 * Única fuente de verdad — reemplaza los cálculos duplicados que existían
 * en fire-extinguishers.service.ts, dashboard.service.ts y notifications.service.ts.
 */
export function computeFireExtinguisherStatus(
  expirationDate: Date | string,
  manufacturingYear?: number | null,
  daysWarning = 30,
): FireExtStatus {
  const chargeStatus = computeExpirationStatus(expirationDate, daysWarning)
  const lifeStatus = computeManufacturingLifeStatus(manufacturingYear, null, daysWarning)
  if (!lifeStatus) return chargeStatus
  return worseStatus(chargeStatus, lifeStatus)
}

/**
 * Filtro WHERE de Prisma para status general (carga + vida útil combinados).
 * Reemplaza el `buildStatusFilter` local de fire-extinguishers.service.ts.
 */
export function buildFireExtinguisherStatusFilter(
  status: string,
  daysWarning = 30,
): Record<string, unknown> {
  const today = todayDate()
  const inNDays = dateOffset(daysWarning)
  const currentYear = new Date().getUTCFullYear()
  const lifeLimitYear = currentYear - MANUFACTURING_LIFESPAN_YEARS // manufacturingYear cuyo 20º aniversario es este año

  if (status === 'vencido') {
    return {
      OR: [{ expirationDate: { lt: today } }, { manufacturingYear: { lt: lifeLimitYear } }],
    }
  }
  if (status === 'proximo_vencer') {
    return {
      AND: [
        { NOT: { expirationDate: { lt: today } } },
        { NOT: { manufacturingYear: { lt: lifeLimitYear } } },
        { OR: [{ expirationDate: { lte: inNDays } }, { manufacturingYear: lifeLimitYear }] },
      ],
    }
  }
  if (status === 'vigente') {
    return {
      AND: [
        { expirationDate: { gt: inNDays } },
        { OR: [{ manufacturingYear: null }, { manufacturingYear: { gt: lifeLimitYear } }] },
      ],
    }
  }
  return {}
}

/**
 * Filtro de conveniencia: "vencido o próximo a vencer" combinado (carga o
 * vida útil), usado por notifications.service.ts que necesita una sola
 * lista de matafuegos en riesgo, no tres buckets separados.
 */
export function buildFireExtinguisherAtRiskFilter(daysWarning = 30): Record<string, unknown> {
  const inNDays = dateOffset(daysWarning)
  const currentYear = new Date().getUTCFullYear()
  const lifeLimitYear = currentYear - MANUFACTURING_LIFESPAN_YEARS

  return {
    OR: [{ expirationDate: { lte: inNDays } }, { manufacturingYear: { lte: lifeLimitYear } }],
  }
}
