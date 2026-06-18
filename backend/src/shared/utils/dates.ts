export type ExpirationStatus = 'vigente' | 'proximo_a_vencer' | 'vencido'
export type PolicyStatus = 'vigente' | 'proxima_a_vencer' | 'vencida'

export function toISODate(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Status para matafuegos y adjuntos con vencimiento.
 * Usa género masculino: vencido / proximo_a_vencer.
 */
export function computeExpirationStatus(
  expirationDate: string,
  daysWarning = 30,
): ExpirationStatus {
  const exp = new Date(expirationDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (exp < today) return 'vencido'
  if (exp <= addDays(today, daysWarning)) return 'proximo_a_vencer'
  return 'vigente'
}

/**
 * Status para pólizas.
 * Usa género femenino: vencida / proxima_a_vencer.
 */
export function computePolicyStatus(endDate: string, daysWarning = 30): PolicyStatus {
  const exp = new Date(endDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (exp < today) return 'vencida'
  if (exp <= addDays(today, daysWarning)) return 'proxima_a_vencer'
  return 'vigente'
}

/**
 * Construye el filtro Prisma WHERE para buscar pólizas por status computado.
 * ISO dates se comparan lexicográficamente — funciona correctamente con YYYY-MM-DD.
 */
export function buildPolicyStatusFilter(status: string): Record<string, unknown> {
  const today = toISODate()
  const in30Days = toISODate(addDays(new Date(), 30))

  if (status === 'vigente') return { endDate: { gt: in30Days } }
  if (status === 'proxima_a_vencer') return { endDate: { gte: today, lte: in30Days } }
  if (status === 'vencida') return { endDate: { lt: today } }
  return {}
}
