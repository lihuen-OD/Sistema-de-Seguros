export type ExpirationStatus = 'vigente' | 'proximo_vencer' | 'vencido'
export type PolicyStatus = 'vigente' | 'proxima_a_vencer' | 'vencida' | 'de_baja'

// Estado ADMINISTRATIVO de una póliza (presentación, filtros, gráficos y
// notificaciones). Nunca reemplaza a PolicyStatus en cálculos económicos:
// una póliza Renovada sigue contractualmente vigente hasta su vencimiento.
export const POLICY_EFFECTIVE_STATUSES = [
  'vigente', 'proxima_a_vencer', 'renovada', 'vencida', 'de_baja',
] as const
export type PolicyEffectiveStatus = (typeof POLICY_EFFECTIVE_STATUSES)[number]

/**
 * Checks whether a date string (YYYY-MM-DD) falls within a reasonable
 * operational range.  Used by Zod schemas and business logic to reject
 * absurdly future (or historically impossible) dates before they reach
 * the database.
 *
 * Rules:
 *  - Must be a valid date.
 *  - Must not be earlier than `minYear`-01-01 (default 1900).
 *  - Must not be more than `maxYearsFromNow` years in the future (default 10).
 *
 * Returns `true` when the date is acceptable.
 */
export function isReasonableDate(
  dateStr: string,
  opts?: { minYear?: number; maxYearsFromNow?: number },
): boolean {
  const minYear = opts?.minYear ?? 1900
  const maxYearsFromNow = opts?.maxYearsFromNow ?? 10

  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false

  const year = Number(dateStr.slice(0, 4))
  const currentYear = new Date().getFullYear()

  if (year < minYear) return false
  if (year > currentYear + maxYearsFromNow) return false

  // Verify the date actually exists (reject e.g. 2025-02-30)
  const parsed = new Date(dateStr + 'T00:00:00.000Z')
  if (parsed.toISOString().slice(0, 10) !== dateStr) return false

  return true
}

export function toISODate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

/**
 * Devuelve el año/mes actual en formato "YYYY-MM" (UTC), usado para
 * derivar `auditPeriod` en el servidor — nunca se confía en lo que
 * mande el cliente para este valor.
 */
export function currentYearMonth(): string {
  return toISODate().slice(0, 7)
}

/**
 * Normalizes a Prisma DateTime (Date object) or a YYYY-MM-DD string to YYYY-MM-DD.
 * Use this in mappers before including date fields in API responses.
 */
export function toDateStr(d: Date | string | null | undefined): string {
  if (!d) return ''
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}

/**
 * Returns a Date object at midnight UTC, N days from today.
 * Use this for Prisma WHERE filter values on DateTime @db.Date fields.
 */
export function dateOffset(days: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * Returns today as a Date at midnight UTC.
 * Use this for Prisma WHERE filter values on DateTime @db.Date fields.
 */
export function todayDate(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Status para matafuegos y adjuntos con vencimiento.
 * Acepta Date (de Prisma) o string YYYY-MM-DD.
 */
export function computeExpirationStatus(
  expirationDate: Date | string,
  daysWarning = 30,
): ExpirationStatus {
  const exp = toDateStr(expirationDate)
  const today = toISODate()
  const inNDays = toISODate(addDays(new Date(), daysWarning))

  if (exp < today) return 'vencido'
  if (exp <= inNDays) return 'proximo_vencer'
  return 'vigente'
}

/**
 * Status para pólizas.
 * Acepta Date (de Prisma) o string YYYY-MM-DD.
 */
export function computePolicyStatus(endDate: Date | string, daysWarning = 30): PolicyStatus {
  const end = toDateStr(endDate)
  const today = toISODate()
  const inNDays = toISODate(addDays(new Date(), daysWarning))

  if (end < today) return 'vencida'
  if (end <= inNDays) return 'proxima_a_vencer'
  return 'vigente'
}

/**
 * ¿Una línea de cobertura (PolicyAssetCoverage) estaba vigente en la fecha dada?
 * Regla: effectiveDate <= asOfDate && (bajaDate es null || bajaDate >= asOfDate).
 * Comparación por string YYYY-MM-DD (vía toDateStr), sin husos horarios.
 */
export function isCoverageActiveOn(
  coverage: { effectiveDate: Date | string; bajaDate: Date | string | null },
  asOfDate: Date | string,
): boolean {
  const effective = toDateStr(coverage.effectiveDate)
  const baja = coverage.bajaDate ? toDateStr(coverage.bajaDate) : null
  const asOf = toDateStr(asOfDate)
  return effective <= asOf && (baja === null || baja >= asOf)
}

/**
 * Filtro Prisma WHERE para pólizas por status.
 * Usa Date objects (requerido por DateTime @db.Date en Prisma).
 *
 * "de_baja" es manual (deactivatedAt seteado por el admin) y tiene prioridad
 * sobre el status calculado por fecha — por eso los otros 3 status excluyen
 * explícitamente las pólizas dadas de baja, aunque sus fechas coincidan.
 */
export function buildPolicyStatusFilter(status: string): Record<string, unknown> {
  const today = todayDate()
  const in30Days = dateOffset(30)

  if (status === 'de_baja') return { deactivatedAt: { not: null } }
  if (status === 'vigente') return { endDate: { gt: in30Days }, deactivatedAt: null }
  if (status === 'proxima_a_vencer') return { endDate: { gte: today, lte: in30Days }, deactivatedAt: null }
  if (status === 'vencida') return { endDate: { lt: today }, deactivatedAt: null }
  return {}
}

// ── Estado administrativo de pólizas (effectiveStatus) ───────────────────────

/**
 * Los estados administrativos visibles usan el día calendario de Argentina:
 * una póliza que vence el 30/11 se muestra vigente hasta las 23:59 de Buenos
 * Aires, no hasta las 21:00 (medianoche UTC). La cobertura activa actual usa
 * el mismo día (ver coverageAsOfDate, R4-A); computePolicyStatus/todayDate
 * siguen en UTC — alinear el estado contractual queda fuera de R4-A.
 */
export const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Día administrativo (Argentina) en formato YYYY-MM-DD. */
export function businessDateStr(now: Date = new Date()): string {
  const parts = Object.fromEntries(businessDateFormatter.formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/**
 * Día administrativo + N días como Date a medianoche UTC — el formato que
 * espera Prisma para comparar contra columnas @db.Date.
 */
export function businessDateOffset(days: number, now: Date = new Date()): Date {
  const d = new Date(`${businessDateStr(now)}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

// ── Vigencia efectiva (cobertura activa para indicadores económicos) ─────────
//
// Una sola regla para "¿esta póliza / esta línea aporta suma asegurada en la
// fecha X?" — versión pura (isPolicyInForceOn / isCoverageLineInForceOn) y su
// equivalente Prisma (policyInForceWhere / coverageLineInForceWhere), así el
// cálculo en memoria y el agregado en base nunca divergen:
// - póliza: startDate <= X <= endDate (ambas inclusivas) y sin baja manual;
// - línea: además, effectiveDate <= X y (bajaDate null o bajaDate >= X) —
//   bajaDate es inclusiva: el día de la baja todavía cubre.
// No usa effectiveStatus ni las renovaciones: registrar una renovación no
// cambia qué suma asegurada está activa.
//
// deactivatedAt (baja manual) no tiene una fecha contractual: es cuándo el
// admin marcó la baja. Acá invalida la vigencia en cualquier fecha consultada.
// Hoy esta regla solo se usa para la cobertura activa ACTUAL; si un cálculo
// histórico ("as of" una fecha pasada) la necesitara, decidir antes si la
// baja manual corta desde deactivatedAt — eso sería una regla nueva.

/**
 * Día de referencia de la cobertura activa actual: el día calendario de
 * Argentina, como Date a medianoche UTC (lo que Prisma compara contra
 * columnas @db.Date). Entre las 21:00 y las 24:00 de Buenos Aires el día UTC
 * ya es el siguiente — usar todayDate() acá hacía que una póliza o línea que
 * vence ese día dejara de sumar 3 horas antes.
 */
export function coverageAsOfDate(now: Date = new Date()): Date {
  return businessDateOffset(0, now)
}

/** ¿La póliza está contractualmente vigente en la fecha dada? (inicio y fin inclusivos, sin baja manual) */
export function isPolicyInForceOn(
  policy: { startDate: Date | string; endDate: Date | string; deactivatedAt: Date | string | null },
  asOfDate: Date | string,
): boolean {
  if (policy.deactivatedAt) return false
  const asOf = toDateStr(asOfDate)
  return toDateStr(policy.startDate) <= asOf && toDateStr(policy.endDate) >= asOf
}

/** ¿La línea aporta cobertura en la fecha dada? Su póliza vigente + la línea vigente (isCoverageActiveOn). */
export function isCoverageLineInForceOn(
  policy: { startDate: Date | string; endDate: Date | string; deactivatedAt: Date | string | null },
  coverage: { effectiveDate: Date | string; bajaDate: Date | string | null },
  asOfDate: Date | string,
): boolean {
  return isPolicyInForceOn(policy, asOfDate) && isCoverageActiveOn(coverage, asOfDate)
}

/** Filtro Prisma (Policy) equivalente a isPolicyInForceOn. `asOfDate` a medianoche UTC (ver coverageAsOfDate). */
export function policyInForceWhere(asOfDate: Date): Record<string, unknown> {
  return { deactivatedAt: null, startDate: { lte: asOfDate }, endDate: { gte: asOfDate } }
}

/** Filtro Prisma (PolicyAssetCoverage) equivalente a isCoverageActiveOn — combinarlo con policyInForceWhere. */
export function coverageLineInForceWhere(asOfDate: Date): Record<string, unknown> {
  return { effectiveDate: { lte: asOfDate }, OR: [{ bajaDate: null }, { bajaDate: { gte: asOfDate } }] }
}

/**
 * Prioridad: baja manual > vencida > renovada > próxima a vencer > vigente.
 * La renovación activa es una marca administrativa, no altera la vigencia.
 */
export function computeEffectivePolicyStatus(
  policy: { endDate: Date | string; deactivatedAt: Date | string | null; hasActiveRenewal: boolean },
  now: Date = new Date(),
  daysWarning = 30,
): PolicyEffectiveStatus {
  if (policy.deactivatedAt) return 'de_baja'
  const end = toDateStr(policy.endDate)
  if (end < businessDateStr(now)) return 'vencida'
  if (policy.hasActiveRenewal) return 'renovada'
  return end <= toDateStr(businessDateOffset(daysWarning, now)) ? 'proxima_a_vencer' : 'vigente'
}

/**
 * Filtro Prisma WHERE por estado administrativo — misma prioridad que
 * computeEffectivePolicyStatus, así que los 5 filtros son excluyentes y cubren
 * todas las pólizas. La renovación se resuelve con un EXISTS sobre
 * policy_renewals (índice por previousPolicyId), sin traer filas.
 */
export function buildEffectivePolicyStatusFilter(status: PolicyEffectiveStatus, now: Date = new Date()): Record<string, unknown> {
  const today = businessDateOffset(0, now)
  const in30Days = businessDateOffset(30, now)
  const renewed = { renewalLinksAsPrevious: { some: { revokedAt: null } } }
  const notRenewed = { renewalLinksAsPrevious: { none: { revokedAt: null } } }

  switch (status) {
    case 'de_baja': return { deactivatedAt: { not: null } }
    case 'vencida': return { deactivatedAt: null, endDate: { lt: today } }
    case 'renovada': return { deactivatedAt: null, endDate: { gte: today }, ...renewed }
    case 'proxima_a_vencer': return { deactivatedAt: null, endDate: { gte: today, lte: in30Days }, ...notRenewed }
    case 'vigente': return { deactivatedAt: null, endDate: { gt: in30Days }, ...notRenewed }
  }
}
