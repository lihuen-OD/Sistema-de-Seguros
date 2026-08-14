// Año/mes actual en formato "YYYY-MM" (UTC) — mismo criterio que
// currentYearMonth() del backend (shared/utils/dates.ts), que es quien
// realmente decide con qué período se guarda una auditoría nueva al crearla.
// Usar esto para comparar contra el período que se esté navegando en
// Cobertura, nunca asumir que coinciden.
export function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}
