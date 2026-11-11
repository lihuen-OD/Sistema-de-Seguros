import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import type { NativeAmounts } from '../../../shared/utils/renewalProjectionCalc'

// Formatos compartidos por la tabla, el layout y el Excel de las
// proyecciones — en un archivo propio (no en un componente) para no romper
// Fast Refresh ni crear imports circulares entre tabla y exportación.

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1)
    .toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    .replace('.', '')
    .toUpperCase()
}

/** Importes no convertibles en su moneda original, ej. "AR$ 1.234.567,00 + US$ 10,00". */
export function formatNativeAmounts(n: NativeAmounts): string {
  const parts: string[] = []
  if (n.ARS !== 0) parts.push(formatCurrencyFull(n.ARS, 'ARS'))
  if (n.USD !== 0) parts.push(formatCurrencyFull(n.USD, 'USD'))
  return parts.join(' + ')
}

export function formatNativeAmountsCompact(n: NativeAmounts): string {
  const parts: string[] = []
  if (n.ARS !== 0) parts.push(formatCurrencyCompact(n.ARS, 'ARS'))
  if (n.USD !== 0) parts.push(formatCurrencyCompact(n.USD, 'USD'))
  return parts.join(' + ')
}
