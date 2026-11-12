import { addMonthsToKey, buildMonthRange } from './renewalProjectionCalc'

// ═══════════════════════════════════════════════════════════════════════════
// Presupuestos — carga anual y montos mensuales.
//
// El presupuesto se guarda SOLO por mes ('YYYY-MM'). "Anual" no es una
// entidad: es esta operación de UI que reparte un total entre 12 meses
// consecutivos (desde cualquier mes de inicio: año calendario o ejercicio
// julio–junio). El total anual nunca se guarda — siempre es Σ meses, así que
// no puede quedar inconsistente. Todo se calcula en centavos enteros.
// ═══════════════════════════════════════════════════════════════════════════

export interface BudgetMonthAmount {
  month: string
  amountUsd: number
}

export function toCents(amount: number): number {
  return Math.round(amount * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

/**
 * Reparte `totalUsd` en `count` meses consecutivos desde `startMonth`, en
 * centavos: cada mes recibe la parte entera y el resto de centavos va al
 * ÚLTIMO mes. Σ meses = total siempre (exacto al centavo).
 */
export function distributeAnnualAmount(totalUsd: number, startMonth: string, count = 12): BudgetMonthAmount[] {
  if (!Number.isFinite(totalUsd) || totalUsd < 0) throw new Error('El total a distribuir debe ser un importe ≥ 0')
  if (!Number.isInteger(count) || count < 1) throw new Error('La cantidad de meses debe ser un entero ≥ 1')
  const totalCents = toCents(totalUsd)
  const baseCents = Math.floor(totalCents / count)
  const remainder = totalCents - baseCents * count
  const months = buildMonthRange(startMonth, addMonthsToKey(startMonth, count - 1))
  return months.map((month, i) => ({
    month,
    amountUsd: fromCents(baseCents + (i === months.length - 1 ? remainder : 0)),
  }))
}

/** Σ de importes mensuales (null = mes sin presupuesto, no suma), exacta al centavo. */
export function sumMonthAmounts(values: Iterable<number | null | undefined>): number {
  let cents = 0
  for (const v of values) if (v != null) cents += toCents(v)
  return fromCents(cents)
}

/**
 * Meses que una distribución SOBRESCRIBE: los que ya tienen un importe
 * guardado (incluido 0) distinto del nuevo. Se listan en la confirmación
 * antes de guardar — nunca se crea una segunda fila para el mismo mes.
 */
export function monthsToOverwrite(next: BudgetMonthAmount[], stored: Map<string, number>): { month: string; previous: number; next: number }[] {
  const result: { month: string; previous: number; next: number }[] = []
  for (const { month, amountUsd } of next) {
    const previous = stored.get(month)
    if (previous !== undefined && toCents(previous) !== toCents(amountUsd)) result.push({ month, previous, next: amountUsd })
  }
  return result
}

export type ParsedAmount = { kind: 'empty' } | { kind: 'value'; amountUsd: number } | { kind: 'invalid'; message: string }

/**
 * Valor tipeado en un input de importe. Vacío = "sin presupuesto" (distinto
 * de 0). Acepta como máximo 2 decimales y nunca negativos — mismas reglas
 * que valida el backend.
 */
export function parseBudgetAmount(raw: string): ParsedAmount {
  const text = raw.trim()
  if (text === '') return { kind: 'empty' }
  const value = Number(text)
  if (!Number.isFinite(value)) return { kind: 'invalid', message: 'No es un número válido' }
  if (value < 0) return { kind: 'invalid', message: 'No puede ser negativo' }
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return { kind: 'invalid', message: 'Como máximo 2 decimales' }
  return { kind: 'value', amountUsd: fromCents(toCents(value)) }
}
