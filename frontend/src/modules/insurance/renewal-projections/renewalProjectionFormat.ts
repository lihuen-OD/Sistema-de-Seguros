import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import type { AllocationInconsistency, NativeAmounts, RenewalTraceItem } from '../../../shared/utils/renewalProjectionCalc'

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

function dayLabel(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const TRACE_KIND_LABELS: Record<RenewalTraceItem['kind'], string> = {
  cuota: 'cuota vence',
  'emisión': 'emitido',
  factura: 'emitida',
}

/** Comprobantes detrás de un aviso, ej. "N-0101 · cuota vence 31/08/2027; FAC-9 · emitida 15/10/2026". */
export function formatTraceItems(items: RenewalTraceItem[]): string {
  return items.map((i) => `${i.documentNumber} · ${TRACE_KIND_LABELS[i.kind]} ${dayLabel(i.date)}`).join('; ')
}

function percentLabel(value: number): string {
  return `${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`
}

/** Asignaciones donde el % guardado no corresponde al importe asignado. */
export function formatAllocationIssues(issues: AllocationInconsistency[]): string {
  return issues
    .map(
      (i) =>
        `${i.documentNumber}: ${percentLabel(i.storedPercentage)} guardado vs ${percentLabel(i.impliedPercentage)} según el importe asignado (${formatCurrencyFull(i.allocatedAmount, i.currency)} de ${formatCurrencyFull(i.documentTotal, i.currency)})`,
    )
    .join('; ')
}
