import type { ExportCell, XLSXExportOptions } from '../../../shared/utils/export'
import { formatCurrencyFull } from '../../../shared/utils/format'
import { baseTotalUsd, hasExcludedNative, usdIn, type DisplayCell, type DisplayCellPart, type DisplayPartKind, type RowTotals } from '../../../shared/utils/renewalProjectionCalc'
import type { Currency } from '../../../shared/types'
import type { AssetRowData } from './RenewalProjectionTable'
import { BREAKDOWN_FIELD_DEFS, type BreakdownFieldKey } from './RenewalFieldSelectorPopover'
import { formatAllocationIssues, formatNativeAmounts, formatTraceItems, monthLabel } from './renewalProjectionFormat'

export interface RenewalProjectionExportInput {
  rows: AssetRowData[]
  /** Misma matriz/totales que la tabla y los KPIs — el Excel nunca recalcula por su cuenta. */
  matrix: (DisplayCell | null)[][]
  rowTotals: RowTotals[]
  axis: string[]
  currency: Currency
  /** TC manual de la pantalla (ARS por USD) — solo convierte lo proyectado y la base USD. */
  projectionRate: number | null
  breakdownFields: BreakdownFieldKey[]
  hideAssetPanel: boolean
  horizonEndMonthKey: string
  filenamePrefix: string
}

export interface RenewalProjectionExport {
  rows: ExportCell[][]
  filename: string
  options: XLSXExportOptions
}

const LEGACY_LABELS = { net: 'Neto', vat: 'IVA', other: 'Otros' } as const

const KIND_LABELS: Record<DisplayPartKind, string> = { real: 'Real', projected: 'Proyectado' }
const KINDS: DisplayPartKind[] = ['real', 'projected']

// Arma el Excel en la moneda elegida, con el mismo criterio que la pantalla:
// - Dos filas por activo — «Real» y «Proyectado» (columna Tipo, filtrable):
//   un mes con importes reales y proyectados a la vez aporta cada parte a su
//   fila, así ningún número del Excel mezcla lo real con lo proyectado.
// - Importes en la moneda de vista: lo real con su cierre histórico; la base
//   y lo proyectado en USD, o en ARS × el TC manual ingresado en la pantalla.
// - Una celda que no se puede expresar en esa moneda va como TEXTO con su
//   importe nativo ("… (sin TC)") o "Sin TC" — nunca como un número convertido.
// - Un total que excluye algo se marca "TOTAL INCOMPLETO" en Observaciones.
// - Si el panel del activo está oculto (o el "Detalle por mes" no tiene nada
//   tildado), el export tampoco los incluye — mismo orden que la tabla.
export function buildRenewalProjectionExport(input: RenewalProjectionExportInput): RenewalProjectionExport {
  const { rows, matrix, rowTotals, axis, currency: cur, projectionRate, breakdownFields, hideAssetPanel, horizonEndMonthKey, filenamePrefix } = input
  const fields = BREAKDOWN_FIELD_DEFS.filter((f) => breakdownFields.includes(f.key))
  const showBreakdown = fields.length > 0
  const inView = (usd: number | null): ExportCell => usdIn(usd, cur, projectionRate)

  // "Inicio" es 'YYYY-MM' — no numérico.
  const ASSET_DATA_COLUMNS: { label: string; numeric: boolean; value: (row: AssetRowData) => ExportCell }[] = [
    { label: `Neto (${cur})`, numeric: true, value: (row) => inView(row.netUsd) },
    { label: `IVA (${cur})`, numeric: true, value: (row) => inView(row.vatUsd) },
    { label: `Otros imp. (${cur})`, numeric: true, value: (row) => inView(row.otherUsd) },
    { label: `Total (${cur})`, numeric: true, value: (row) => inView(baseTotalUsd(row)) },
    { label: 'Ciclo (m)', numeric: true, value: (row) => row.cycleLengthMonths },
    { label: 'Cuotas', numeric: true, value: (row) => row.installmentsCount },
    { label: 'Inicio', numeric: false, value: (row) => row.startMonthKey },
    { label: '% renov. (USD)', numeric: true, value: (row) => row.pct },
    { label: '% anterior (hist.)', numeric: true, value: (row) => row.override?.growthPercentOverride ?? null },
  ]
  const assetDataCols = hideAssetPanel ? [] : ASSET_DATA_COLUMNS
  const leadingLabels = ['Activo', 'Tipo', ...assetDataCols.map((c) => c.label)]
  const totalLabel = cur === 'ARS' && projectionRate !== null ? `Total (ARS · proy. TC manual ${formatCurrencyFull(projectionRate, 'ARS')})` : `Total (${cur})`

  // Sin "Detalle por mes": una columna "Total" plana por mes, como siempre.
  // Con "Detalle por mes": cada mes ocupa un bloque de columnas (una por
  // campo tildado), agrupado con una celda combinada por mes en la fila de
  // arriba — mismo criterio visual que la tabla en pantalla.
  const monthValueHeaders = showBreakdown ? axis.flatMap(() => fields.map((f) => f.label)) : axis.map((m) => m)
  const totalValueHeaders = showBreakdown ? fields.map((f) => f.label) : [totalLabel]
  const header: ExportCell[] = [
    ...(showBreakdown ? leadingLabels.map(() => '') : leadingLabels),
    ...monthValueHeaders,
    ...totalValueHeaders,
    showBreakdown ? '' : 'Observaciones',
  ]
  const headerGroups = showBreakdown
    ? [
        ...leadingLabels.map((label) => ({ label, colSpan: 1, rowSpan: 2 })),
        ...axis.map((m) => ({ label: monthLabel(m), colSpan: fields.length })),
        { label: totalLabel, colSpan: fields.length },
        { label: 'Observaciones', colSpan: 1, rowSpan: 2 },
      ]
    : undefined

  function cellValue(part: DisplayCellPart | null, key: BreakdownFieldKey): ExportCell {
    if (!part) return 0
    if (!part.amounts) return part.isReal ? `${formatNativeAmounts(part.excludedNative)} (sin TC)` : 'Sin TC'
    return key === 'net' ? part.amounts.net : key === 'vat' ? part.amounts.vat : key === 'other' ? part.amounts.other : part.amounts.total
  }

  function observationsFor(row: AssetRowData, cells: (DisplayCell | null)[], totals: RowTotals, kind: DisplayPartKind): string {
    const notes: string[] = []
    const kindTotals = totals[kind]
    if (kindTotals.incomplete) {
      const excluded = hasExcludedNative(kindTotals.excludedNative) ? ` — excluye ${formatNativeAmounts(kindTotals.excludedNative)} sin TC confiable` : ''
      const noRate = kind === 'projected' && cells.some((c) => c?.projected && !c.projected.amounts) ? ' — proyectado en ARS sin TC' : ''
      notes.push(`TOTAL INCOMPLETO${excluded}${noRate}`)
      const months = kind === 'real' ? axis.filter((_, i) => cells[i]?.real?.incomplete).map(monthLabel) : []
      if (months.length > 0) notes.push(`Meses con importes sin TC confiable: ${months.join(', ')}`)
    }
    const mixed = axis.filter((_, i) => cells[i]?.real && cells[i]?.projected).map(monthLabel)
    if (mixed.length > 0) notes.push(`Meses con importes reales y proyectados (en filas separadas): ${mixed.join(', ')}`)
    if (row.outOfTermItems.length > 0) {
      notes.push(`Fuera de la vigencia de su período (las renovaciones proyectadas repiten esas fechas): ${formatTraceItems(row.outOfTermItems)}`)
    }
    if (row.ambiguousPeriodItems.length > 0) {
      notes.push(`Período ambiguo (se tomó la vigencia contractual más cercana): ${formatTraceItems(row.ambiguousPeriodItems)}`)
    }
    if (row.allocationIssues.length > 0) notes.push(`Asignación incoherente (% vs importe): ${formatAllocationIssues(row.allocationIssues)}`)
    if (row.concurrentPeriodsExcluded > 0) notes.push('Póliza paralela de distinto plazo no sumada a la base')
    if (row.projectionBlocked) notes.push('Sin proyección: la última renovación no tiene TC histórico confiable (cargar Neto en USD)')
    if (row.legacyPendingFields.length > 0) {
      const legacy = row.legacyPendingFields
        .map((f) => {
          const value = f === 'net' ? row.override?.netOverride : f === 'vat' ? row.override?.vatOverride : row.override?.otherOverride
          return `${LEGACY_LABELS[f]} ${formatCurrencyFull(value ?? 0, 'ARS')}`
        })
        .join(', ')
      notes.push(`Valores anteriores en ARS sin convertir (no aplicados): ${legacy}`)
    }
    return notes.join(' | ')
  }

  const dataRows: ExportCell[][] = rows.flatMap((row, rowIndex) => {
    const cells = matrix[rowIndex]
    const totals = rowTotals[rowIndex]
    const assetDataValues = assetDataCols.map((c) => c.value(row))
    return KINDS.map((kind) => {
      const monthValues = cells.flatMap((cell) => {
        const part = cell?.[kind] ?? null
        return showBreakdown ? fields.map((f) => cellValue(part, f.key)) : [cellValue(part, 'total')]
      })
      const totalValues = showBreakdown ? fields.map((f) => totals[kind][f.key]) : [totals[kind].total]
      return [row.name, KIND_LABELS[kind], ...assetDataValues, ...monthValues, ...totalValues, observationsFor(row, cells, totals, kind)]
    })
  })

  const numericColumnIndexes: number[] = []
  assetDataCols.forEach((c, idx) => { if (c.numeric) numericColumnIndexes.push(2 + idx) })
  const monthsStartIndex = 2 + assetDataCols.length
  for (let i = 0; i < monthValueHeaders.length + totalValueHeaders.length; i++) numericColumnIndexes.push(monthsStartIndex + i)

  return {
    rows: [header, ...dataRows],
    filename: `${filenamePrefix}-${cur}-${horizonEndMonthKey}.xlsx`,
    options: { autoFilter: true, numericColumnIndexes, headerGroups },
  }
}
