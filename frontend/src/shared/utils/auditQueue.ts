import type { AuditStatusCounts } from '../components/audit-queue/AuditStatusKpiRow'

// Helpers compartidos por las 3 colas de auditoría (Matafuegos/Rodados/
// Seguros) — copiados tal cual de FireExtinguisherAuditsQueuePage.tsx
// (fuente original), sin cambiar comportamiento.

// Auditores derivados de las auditorías ya cargadas (auditedBy no tiene
// catálogo propio) — si se filtra por auditor, la lista de sugerencias se
// acota a los que quedan en el resultado actual; no afecta la corrección
// del filtro, solo las opciones que se ofrecen para tildar.
export function deriveAuditorOptions<T extends { auditedBy: string }>(audits: T[]): { value: string; label: string }[] {
  const names = new Set(audits.map((a) => a.auditedBy).filter(Boolean))
  return [...names].sort().map((name) => ({ value: name, label: name }))
}

export function countAuditsByStatus<T extends { status: string }>(audits: T[]): AuditStatusCounts {
  return {
    SUBMITTED: audits.filter((a) => a.status === 'SUBMITTED').length,
    NEEDS_CORRECTION: audits.filter((a) => a.status === 'NEEDS_CORRECTION').length,
    APPROVED: audits.filter((a) => a.status === 'APPROVED').length,
    REJECTED: audits.filter((a) => a.status === 'REJECTED').length,
  }
}

// Envuelve un setter de filtro para que además vuelva a la página 1 del
// paginador — todo cambio de filtro/búsqueda/estado/período tiene que
// resetear la página. A propósito no es un useEffect (ver regla de
// CLAUDE.md sobre no sincronizar estado con efectos) — cada handler llama
// esto explícitamente. Extraído acá recién en la 3ra repetición idéntica
// (Matafuegos y Rodados la definen local todavía, sin tocarlas para usar
// esta versión — quedan como están hasta que se decida unificarlas aparte).
export function withPageReset<Args extends unknown[]>(setPage: (page: number) => void, fn: (...args: Args) => void) {
  return (...args: Args) => {
    fn(...args)
    setPage(1)
  }
}
