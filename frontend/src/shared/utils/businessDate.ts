// ── Día de negocio (Argentina) ───────────────────────────────────────────────
// Mismo criterio que el backend (shared/utils/dates.ts#businessDateStr): los
// estados visibles, los "días restantes" y la cobertura activa cambian a la
// medianoche de Buenos Aires, sin depender del huso horario del navegador.
const BUSINESS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

const businessDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Hoy en Argentina, YYYY-MM-DD. */
export function businessTodayStr(now: Date = new Date()): string {
  const parts = Object.fromEntries(businessDateFormatter.formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Días calendario desde hoy (Argentina) hasta la fecha YYYY-MM-DD — negativo si ya pasó. */
export function daysUntilBusinessDate(dateStr: string, now: Date = new Date()): number {
  const toUtc = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((toUtc(dateStr) - toUtc(businessTodayStr(now))) / 86_400_000)
}
