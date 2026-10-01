/**
 * Normaliza una patente para comparación de duplicados.
 *
 * Reglas:
 * - trim
 * - quitar espacios
 * - quitar guiones
 * - pasar a mayúsculas
 * - devolver null si queda vacío
 *
 * Ejemplos:
 *   "AB 123 CD"  → "AB123CD"
 *   "AB123CD"    → "AB123CD"
 *   "ab-123-cd"  → "AB123CD"
 *   ""           → null
 *   null         → null
 */
const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

/**
 * Normaliza texto libre de catálogo (ej. estados de siniestro configurables:
 * "En trámite", "EN TRAMITE", "en_tramite") para compararlo por significado y
 * no por texto exacto. Mismo criterio que normalizeClaimStatusText del
 * frontend (shared/utils/claimStatus.ts) — si cambia uno, cambiar el otro.
 */
export function normalizeCatalogText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeLicensePlate(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().replace(/[\s-]/g, '').toUpperCase()
  return normalized || null
}
