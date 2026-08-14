// Mismos cortes que backend/.../fire-extinguisher-audit-dashboard.constants.ts
// (LEVEL_SCALE) — si cambian ahí, actualizar acá también. Solo clasificación
// de display; el puntaje en sí siempre viene del backend.
export function classifyLevel(level: number | null): string | null {
  if (level == null) return null
  if (level < 50) return 'Crítico'
  if (level < 75) return 'Regular'
  if (level < 90) return 'Bueno'
  return 'Óptimo'
}
