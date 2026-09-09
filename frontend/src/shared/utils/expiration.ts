export type ExpirationStatus = 'vencido' | 'proximo_vencer' | 'vigente'

// Estado de vencimiento de un adjunto (Activos/Pólizas) — mismo criterio que
// ya usa el backend (computeExpirationStatus en shared/utils/dates.ts,
// ventana de 30 días).
//
// Acepta tanto "YYYY-MM-DD" como un ISO timestamp completo (se toma solo la
// fecha) para no romperse en hora local si alguna fuente manda el datetime
// completo — mismo resguardo que parseDateLocal() en format.ts.
export function getExpirationStatus(date: string | null): ExpirationStatus | null {
  if (!date) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const exp = new Date(`${date.slice(0, 10)}T00:00:00`)
  if (isNaN(exp.getTime())) return null
  const diffDays = Math.floor((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return 'vencido'
  if (diffDays <= 30) return 'proximo_vencer'
  return 'vigente'
}

// ¿Una línea de cobertura (PolicyCoverage) estaba vigente en la fecha dada?
// Mismo criterio que el backend (isCoverageActiveOn en
// backend/src/shared/utils/dates.ts): effectiveDate <= asOfDate &&
// (bajaDate es null || bajaDate >= asOfDate). Comparación por string
// YYYY-MM-DD (las fechas de PolicyCoverage ya vienen en ese formato).
export function isCoverageActiveOn(
  coverage: { effectiveDate: string; bajaDate: string | null },
  asOfDate: string,
): boolean {
  if (!asOfDate) return false
  const effective = coverage.effectiveDate.slice(0, 10)
  const baja = coverage.bajaDate ? coverage.bajaDate.slice(0, 10) : null
  const asOf = asOfDate.slice(0, 10)
  return effective <= asOf && (baja === null || baja >= asOf)
}

// max(issueDate, policy.startDate) — una factura puede emitirse antes de que
// arranque la vigencia de la póliza (facturación anticipada); en ese caso la
// vigencia de una línea de cobertura se valida contra el inicio de la
// póliza, no contra una fecha en la que la póliza todavía ni existía. Mismo
// criterio que coverageReferenceDate en documents.service.ts (backend).
export function coverageReferenceDate(policyStartDate: string, issueDate: string): string {
  return policyStartDate && policyStartDate > issueDate ? policyStartDate : issueDate
}

// Poda `rows` a las que siguen vigentes contra `issueDate` (o están en
// `historicalCoverageIds`) — misma regla que PolicySelector usa adentro para
// permitir/mostrar una línea (coverageAllowed). Pensada para llamarse desde
// el onChange de issueDate en Factura/Endoso cuando se está creando un
// documento NUEVO: ahí no hay histórico que preservar, así que una selección
// (manual, de "Agregar todos", o precargada desde una póliza de origen) que
// deja de estar vigente se saca sola en vez de quedar "Fuera de fecha" para
// siempre sin que nadie la remueva. En edición NO se llama — las líneas ya
// guardadas (y cualquier otra que el usuario haya tocado) se preservan
// siempre; el aviso de fuera de rango queda solo en el badge.
interface CoverageWithLifecycle {
  id: string
  policyId: string
  effectiveDate: string
  bajaDate: string | null
}
interface PolicyWithCoverages {
  id: string
  startDate: string
  coverages?: CoverageWithLifecycle[]
}
export function pruneOutOfRangeRows<T extends { policyAssetCoverageId: string }>(
  rows: T[],
  policies: PolicyWithCoverages[],
  issueDate: string,
  historicalCoverageIds: string[] = [],
): T[] {
  if (!issueDate) return rows
  const historicalSet = new Set(historicalCoverageIds)
  const coverageById = new Map(policies.flatMap((p) => (p.coverages ?? []).map((c) => [c.id, c] as const)))
  const policyStartDateById = new Map(policies.map((p) => [p.id, p.startDate]))
  const stillValid = rows.filter((r) => {
    if (!r.policyAssetCoverageId) return true
    const c = coverageById.get(r.policyAssetCoverageId)
    if (!c || historicalSet.has(c.id)) return true
    return isCoverageActiveOn(c, coverageReferenceDate(policyStartDateById.get(c.policyId) ?? '', issueDate))
  })
  return stillValid.length === rows.length ? rows : stillValid
}
