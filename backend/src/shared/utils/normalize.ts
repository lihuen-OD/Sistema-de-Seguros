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
export function normalizeLicensePlate(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().replace(/[\s\-]/g, '').toUpperCase()
  return normalized || null
}
