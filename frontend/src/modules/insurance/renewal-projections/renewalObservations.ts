import { formatCurrencyFull } from '../../../shared/utils/format'
import { emptyNativeAmounts, type DisplayCell, type NativeAmounts } from '../../../shared/utils/renewalProjectionCalc'
import type { AssetRowData } from './RenewalProjectionTable'
import type { ObservationCategory, ObservationDetail, ObservationSeverity } from '../../../shared/utils/observations'
import { formatAllocationIssues, formatExcludedAdjustments, formatNativeAmounts, formatTraceItems, monthLabel } from './renewalProjectionFormat'

// Observaciones de la proyección, agrupadas por categoría para el panel
// compacto. Solo PRESENTA lo que ya calcularon las filas y la matriz (misma
// fuente que tabla, KPIs y Excel) — no recalcula ni corrige nada. Tipos en
// shared/utils/observations (compartidos con Presupuestos).

const LEGACY_LABELS = { net: 'Neto', vat: 'IVA', other: 'Otros' } as const

/** Valores anteriores en ARS pendientes de conversión, ej. "Neto AR$ 1.000.000,00, IVA AR$ 210.000,00". */
export function formatLegacyPending(row: AssetRowData): string {
  return row.legacyPendingFields
    .map((f) => {
      const value = f === 'net' ? row.override?.netOverride : f === 'vat' ? row.override?.vatOverride : row.override?.otherOverride
      return `${LEGACY_LABELS[f]} ${formatCurrencyFull(value ?? 0, 'ARS')}`
    })
    .join(', ')
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

function addNative(acc: NativeAmounts, n: NativeAmounts) {
  acc.ARS += n.ARS
  acc.USD += n.USD
}

export interface RenewalObservationsInput {
  rows: AssetRowData[]
  matrix: (DisplayCell | null)[][]
  axis: string[]
  filteredAbsurdDates: number
}

export function buildRenewalObservations({ rows, matrix, axis, filteredAbsurdDates }: RenewalObservationsInput): ObservationCategory[] {
  const categories: ObservationCategory[] = []

  function perAsset(
    key: string,
    severity: ObservationSeverity,
    title: string,
    description: string,
    detailOf: (row: AssetRowData) => string | null,
  ) {
    const details = rows.flatMap((row) => {
      const text = detailOf(row)
      return text === null ? [] : [{ assetName: row.name, text }]
    })
    if (details.length > 0) categories.push({ key, severity, title, count: details.length, countUnit: details.length === 1 ? 'activo' : 'activos', description, details })
  }

  // ── Requieren revisión ──────────────────────────────────────────────────
  perAsset(
    'blocked',
    'review',
    'Sin proyección por falta de cierre USD confiable',
    'La última renovación no tiene un cierre USD histórico confiable, así que no se proyecta (no se inventa una base). Sus importes reales se conservan; para proyectarlo, cargá el Neto en USD de la fila.',
    (row) => (row.projectionBlocked ? 'Cargar el Neto de la renovación en USD' : null),
  )

  // Celdas reales sin cierre USD confiable: se muestran en su moneda original y no se suman.
  let unreliableCells = 0
  const unreliableDetails: ObservationDetail[] = []
  rows.forEach((row, rowIndex) => {
    const cells = matrix[rowIndex] ?? []
    const months: string[] = []
    const excluded = emptyNativeAmounts()
    cells.forEach((cell, i) => {
      if (!cell?.real?.incomplete) return
      unreliableCells += 1
      months.push(monthLabel(axis[i]))
      addNative(excluded, cell.real.excludedNative)
    })
    if (months.length > 0) unreliableDetails.push({ assetName: row.name, text: `${months.join(', ')} — excluye ${formatNativeAmounts(excluded)}` })
  })
  if (unreliableCells > 0) {
    categories.push({
      key: 'unreliable-real',
      severity: 'review',
      title: 'Importes reales sin cierre USD confiable',
      count: unreliableCells,
      countUnit: unreliableCells === 1 ? 'celda' : 'celdas',
      description: 'Se muestran en su moneda original y no se suman ni se convierten. Los totales marcados con * están incompletos.',
      details: unreliableDetails,
    })
  }

  perAsset(
    'out-of-term',
    'review',
    'Cuotas o emisiones fuera de la vigencia de la póliza',
    'Cada renovación proyectada repite esas fechas tal como están cargadas. Revisá esos comprobantes.',
    (row) => (row.outOfTermItems.length > 0 ? formatTraceItems(row.outOfTermItems) : null),
  )
  perAsset(
    'ambiguous-period',
    'review',
    'Facturas de período ambiguo',
    'No se pudo determinar con certeza a qué vigencia corresponden: se tomó la vigencia contractual más cercana, sin abrir una renovación nueva.',
    (row) => (row.ambiguousPeriodItems.length > 0 ? formatTraceItems(row.ambiguousPeriodItems) : null),
  )
  perAsset(
    'allocation',
    'review',
    'Asignaciones incoherentes (% vs importe)',
    'El % asignado no corresponde al importe asignado; Financiero usa el % y Económico el importe, así que sus bases difieren. No se corrige automáticamente.',
    (row) => (row.allocationIssues.length > 0 ? formatAllocationIssues(row.allocationIssues) : null),
  )
  perAsset(
    'legacy-pending',
    'review',
    'Valores anteriores en ARS sin convertir',
    'Se conservan sin cambios pero no se aplican a la proyección en USD. Revisalos con «ARS anterior · revisar» en la fila.',
    (row) => (row.legacyPendingFields.length > 0 ? formatLegacyPending(row) : null),
  )

  // ── Informativas ────────────────────────────────────────────────────────
  perAsset(
    'excluded-adjustments',
    'info',
    'Cuotas de ajustes ya aplicados no sumadas',
    'El ajuste ya está volcado en las cuotas de su factura: sus cuotas propias no se suman para no duplicarlo. Es el tratamiento correcto, no un error.',
    (row) => (row.excludedAdjustments.length > 0 ? formatExcludedAdjustments(row.excludedAdjustments) : null),
  )

  let mixedCells = 0
  const mixedDetails: ObservationDetail[] = []
  rows.forEach((row, rowIndex) => {
    const months = (matrix[rowIndex] ?? []).flatMap((cell, i) => (cell?.real && cell.projected ? [monthLabel(axis[i])] : []))
    mixedCells += months.length
    if (months.length > 0) mixedDetails.push({ assetName: row.name, text: months.join(', ') })
  })
  if (mixedCells > 0) {
    categories.push({
      key: 'mixed-months',
      severity: 'info',
      title: 'Meses con importes reales y proyectados',
      count: mixedCells,
      countUnit: mixedCells === 1 ? 'mes' : 'meses',
      description: 'Se muestran en la misma celda como dos importes (real arriba, proyectado abajo) y se suman por separado en los totales, el KPI y el Excel.',
      details: mixedDetails,
    })
  }

  perAsset(
    'concurrent',
    'info',
    'Pólizas paralelas de distinto plazo no sumadas',
    'La póliza paralela no se suma a la base proyectada; ajustá la base a mano si corresponde.',
    (row) => (row.concurrentPeriodsExcluded > 0 ? plural(row.concurrentPeriodsExcluded, 'cobertura paralela', 'coberturas paralelas') : null),
  )

  if (filteredAbsurdDates > 0) {
    categories.push({
      key: 'absurd-dates',
      severity: 'info',
      title: 'Registros con fechas fuera de rango ignorados',
      count: filteredAbsurdDates,
      countUnit: filteredAbsurdDates === 1 ? 'registro' : 'registros',
      description: `Meses con año mayor a ${new Date().getFullYear() + 10}: no se muestran en el calendario. Los datos históricos normales no se afectan.`,
      details: [],
    })
  }

  return categories
}
