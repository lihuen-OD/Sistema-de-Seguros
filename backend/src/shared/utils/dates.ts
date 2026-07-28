export type ExpirationStatus = 'vigente' | 'proximo_vencer' | 'vencido'
export type PolicyStatus = 'vigente' | 'proxima_a_vencer' | 'vencida' | 'de_baja'

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
