import type { PolicyStatus } from '../types'
import { isCoverageActiveOn } from './expiration'
import { businessTodayStr } from './businessDate'

// Vigencia efectiva (R4-A) — misma regla que el backend
// (shared/utils/dates.ts#isPolicyInForceOn / isCoverageLineInForceOn): una
// póliza o línea aporta suma asegurada solo durante su vigencia real.
// - póliza: startDate <= hoy <= endDate (inclusivas) y sin baja manual — una
//   póliza cargada por anticipado figura como "vigente" (`status` solo mira
//   el vencimiento) pero no suma hasta que empiece;
// - línea: además effectiveDate <= hoy y bajaDate null o >= hoy (la baja es
//   inclusiva: el día de la baja todavía cubre).
// Nunca usa el estado administrativo ni las renovaciones (ver la regla de
// ESLint sobre los cálculos económicos).

interface PolicyVigency {
  startDate: string
  endDate: string
  status: PolicyStatus
  deactivatedAt?: string | null
}

/** Día de referencia de la cobertura activa: hoy en Argentina, YYYY-MM-DD. */
export function coverageAsOfToday(now: Date = new Date()): string {
  return businessTodayStr(now)
}

export function isPolicyInForceOn(policy: PolicyVigency, asOf: string): boolean {
  // 'desconocido' nunca se trata como vigente (ver mapStatus en policies.api.ts).
  if (policy.deactivatedAt || policy.status === 'de_baja' || policy.status === 'desconocido') return false
  const day = asOf.slice(0, 10)
  return policy.startDate.slice(0, 10) <= day && policy.endDate.slice(0, 10) >= day
}

export function isCoverageLineInForceOn(
  policy: PolicyVigency,
  coverage: { effectiveDate: string; bajaDate: string | null },
  asOf: string,
): boolean {
  return isPolicyInForceOn(policy, asOf) && isCoverageActiveOn(coverage, asOf)
}
