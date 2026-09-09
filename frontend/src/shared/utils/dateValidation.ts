/**
 * Devuelve true si la fecha (formato YYYY-MM-DD) es posterior a la fecha actual.
 * Compara solo la parte de fecha, ignorando hora/minuto/segundo, para evitar
 * problemas de zona horaria.
 */
export function isFutureDate(dateString: string): boolean {
  if (!dateString) return false

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return dateString > todayStr
}

/**
 * Checks whether a date string (YYYY-MM-DD) falls within a reasonable
 * operational range.  Used to reject absurdly future (or historically
 * impossible) dates before they reach the API.
 *
 * Rules:
 *  - Must be a valid date.
 *  - Must not be earlier than `minYear`-01-01 (default 1900).
 *  - Must not be more than `maxYearsFromNow` years in the future (default 10).
 *
 * Returns `true` when the date is acceptable.
 */
export function isReasonableDate(
  dateString: string,
  opts?: { minYear?: number; maxYearsFromNow?: number },
): boolean {
  const minYear = opts?.minYear ?? 1900
  const maxYearsFromNow = opts?.maxYearsFromNow ?? 10

  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false

  const year = Number(dateString.slice(0, 4))
  const currentYear = new Date().getFullYear()

  if (year < minYear) return false
  if (year > currentYear + maxYearsFromNow) return false

  // Verify the date actually exists (reject e.g. 2025-02-30, 2026-02-30)
  // by reconstructing YYYY-MM-DD from the parsed Date and comparing.
  const parsed = new Date(`${dateString}T00:00:00`)
  if (isNaN(parsed.getTime())) return false
  const reconstructed = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  if (reconstructed !== dateString) return false

  return true
}

/**
 * Devuelve un mensaje de error si la fecha no es razonable, o null si es válida.
 * Para usar directamente en validaciones de formularios.
 */
export function unreasonableDateError(dateString: string, label: string = 'La fecha'): string | null {
  if (!dateString) return null
  if (!isReasonableDate(dateString)) {
    return `${label} no es válida. No se permiten fechas anteriores a 1900 ni mayores a ${new Date().getFullYear() + 10}.`
  }
  return null
}
