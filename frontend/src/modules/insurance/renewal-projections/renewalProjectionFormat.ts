import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import { DOCUMENT_TYPE_LABELS } from '../../../shared/constants'
import type { AllocationInconsistency, ExcludedAdjustmentItem, NativeAmounts, RenewalTraceItem } from '../../../shared/utils/renewalProjectionCalc'

// Formatos compartidos por la tabla, el layout y el Excel de las
// proyecciones — en un archivo propio (no en un componente) para no romper
// Fast Refresh ni crear imports circulares entre tabla y exportación.

/**
 * Las proyecciones de renovación se muestran y exportan SOLO en USD: lo real
 * con su cierre USD histórico (sin cierre confiable queda en su moneda
 * original, excluido y marcado) y lo proyectado sobre la base USD. Los
 * análisis generales Financiero/Económico conservan su selector ARS/USD.
 */
export const PROJECTION_CURRENCY = 'USD' as const

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

/** Ajustes ya volcados en su factura cuyas cuotas propias no se cuentan, ej. "ND01 (Nota de Débito) · emitida 05/03/2026 · cuotas 10/04/2026". */
export function formatExcludedAdjustments(items: ExcludedAdjustmentItem[]): string {
  return items
    .map((i) => {
      const type = DOCUMENT_TYPE_LABELS[i.documentType] ?? i.documentType
      const issued = i.issueDate ? ` · emitida ${dayLabel(i.issueDate)}` : ''
      const dues = i.dueDates.length > 0 ? ` · cuota${i.dueDates.length !== 1 ? 's' : ''} ${i.dueDates.map(dayLabel).join(', ')}` : ''
      return `${i.documentNumber} (${type})${issued}${dues} · ${formatCurrencyFull(i.ownInstallmentsAmount, i.currency)}`
    })
    .join('; ')
}
