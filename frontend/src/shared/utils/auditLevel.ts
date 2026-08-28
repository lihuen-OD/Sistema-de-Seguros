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

// Paleta de celda para el heatmap del historial de limpieza — mismos 4
// niveles que classifyLevel, mismo criterio de color que Badge.tsx
// (danger/warning/primary/success), pero con fondo sólido (no bg-*-50) para
// que la celda se lea de un vistazo sin tener que leer el número.
const LEVEL_HEAT_STYLES: Record<string, { bg: string; text: string }> = {
  'Crítico': { bg: 'bg-red-500', text: 'text-white' },
  'Regular': { bg: 'bg-amber-400', text: 'text-white' },
  'Bueno': { bg: 'bg-brand-400', text: 'text-white' },
  'Óptimo': { bg: 'bg-emerald-500', text: 'text-white' },
}
const LEVEL_HEAT_FALLBACK = { bg: 'bg-slate-100', text: 'text-slate-400' }

export function levelHeatStyle(levelLabel: string | null): { bg: string; text: string } {
  return (levelLabel != null ? LEVEL_HEAT_STYLES[levelLabel] : undefined) ?? LEVEL_HEAT_FALLBACK
}
