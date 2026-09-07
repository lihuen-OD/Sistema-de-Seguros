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
