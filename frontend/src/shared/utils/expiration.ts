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
