import type { ExportCell } from '../../../shared/types'
import type { XLSXExportOptions } from '../../../shared/utils/export'
import { levelAffectedByCurrentAllocations, type BudgetLevel } from '../../../shared/utils/budgetAttribution'
import {
  budgetStatus,
  buildFundsSeries,
  deviationEstimateOrNull,
  deviationRealOrNull,
  estimatePercent,
  isIncomplete,
  realFinancial,
  type BudgetAmounts,
  type BudgetComparisonResult,
  type BudgetMonthCell,
  type BudgetRow,
} from '../../../shared/utils/budgetComparisonCalc'
import type { Reconciliation } from '../../../shared/utils/budgetReconciliation'
import type { ObservationCategory } from '../../../shared/utils/observations'
import { monthLabel } from '../renewal-projections/renewalProjectionFormat'
import { FUNDS_NOTICE, HISTORICAL_ALLOCATION_WARNING, LEVEL_LABELS, RECONCILIATION_NOTE, STATUS_META } from './budgetFormat'

// Excel de Presupuestos: misma fuente que la pantalla (resultado de la
// comparación + conciliación + observaciones). Cuatro hojas:
// 1. «Presupuesto vs real» — formato largo (fila × mes) con autofiltro,
//    columnas «Incompleto» y «Excluidos (n)».
// 2. «Fondos (no es costo)» — flujo de fondos acumulado (D5).
// 3. «Conciliación» — Análisis ± ajustes = Presupuestos (D7).
// 4. «Filtros y observaciones» — filtros, truncado, advertencias y excluidos.

const USD_FORMAT = '"US$" #,##0.00;[Red]-"US$" #,##0.00;"-"'

export interface BudgetExportInput {
  result: BudgetComparisonResult
  visibleRows: BudgetRow[]
  visibleTotals: { months: BudgetMonthCell[]; totals: BudgetAmounts }
  filtersApplied: boolean
  filterDescriptions: string[]
  reconciliations: Reconciliation[]
  observations: ObservationCategory[]
  truncated: boolean
  generatedAt: Date
}

const MAIN_HEADER = [
  'Nivel', 'Entidad', 'Detalle', 'Mes', 'Presupuesto (USD)', 'Sin presupuesto', 'Real económico (USD)', 'Proyección futura (USD)',
  'Estimado de cierre (USD)', 'Desvío real a la fecha (USD)', 'Desvío estimado (USD)', '% ejecución estimada', 'Estado',
  'Real financiero — fondos, no es costo (USD)', 'Incompleto', 'Excluidos (n)',
]
// Índices (0-based) de las columnas numéricas en USD.
const MAIN_NUMERIC = [4, 6, 7, 8, 9, 10, 13]

function percentCell(a: BudgetAmounts): string {
  const p = estimatePercent(a)
  if (p !== null) return `${(p * 100).toFixed(1).replace('.', ',')}%`
  return a.budgetDefined > 0 ? 'n/a' : '—'
}

function amountsCells(a: BudgetAmounts, isSingleMonth: boolean): ExportCell[] {
  const hasBudget = a.budgetDefined > 0
  return [
    hasBudget ? a.budget : null,
    isSingleMonth ? (hasBudget ? 'No' : 'Sí') : (hasBudget ? `${a.budgetDefined} mes(es) con presupuesto` : 'Sí'),
    a.realEconomic,
    a.projection,
    a.estimate,
    deviationRealOrNull(a),
    deviationEstimateOrNull(a),
    percentCell(a),
    STATUS_META[budgetStatus(a)].label,
    realFinancial(a),
    isIncomplete(a) ? 'Sí' : 'No',
    a.excludedEconomic + a.excludedFinancial,
  ]
}

function mainSheet(level: BudgetLevel, input: BudgetExportInput): { rows: ExportCell[][]; totalRowIndexes: number[] } {
  const rows: ExportCell[][] = [MAIN_HEADER]
  const levelLabel = LEVEL_LABELS[level]
  for (const row of input.visibleRows) {
    for (const cell of row.months) {
      rows.push([levelLabel, row.label, row.sublabel ?? '', monthLabel(cell.month), ...amountsCells(cell, true)])
    }
  }
  const totalRowIndexes: number[] = []
  for (const row of input.visibleRows) {
    totalRowIndexes.push(rows.length)
    rows.push([levelLabel, row.label, row.sublabel ?? '', 'Total período', ...amountsCells(row.totals, false)])
  }
  totalRowIndexes.push(rows.length)
  rows.push([levelLabel, input.filtersApplied ? 'Total filas visibles' : 'Total del nivel', '', 'Total período', ...amountsCells(input.visibleTotals.totals, false)])
  if (input.filtersApplied) {
    totalRowIndexes.push(rows.length)
    rows.push([levelLabel, 'Total del nivel (incluye «Sin asignar»)', '', 'Total período', ...amountsCells(input.result.levelTotals.totals, false)])
  }
  return { rows, totalRowIndexes }
}

function fundsSheet(cells: BudgetMonthCell[]): ExportCell[][] {
  const rows: ExportCell[][] = [[
    'Mes', 'Presupuesto (USD)', 'Vencimientos pagados + pendientes (USD)', 'Proyección financiera (USD)', 'Necesidad de fondos del mes (USD)',
    'Presupuesto acumulado (USD)', 'Necesidad acumulada (USD)', 'Diferencia de fondos acumulada (USD)', 'Incompleto',
  ]]
  for (const p of buildFundsSeries(cells)) {
    rows.push([monthLabel(p.month), p.budget, p.due, p.financialProjection, p.need, p.cumulativeBudget, p.cumulativeNeed, p.fundsDifference, p.incomplete ? 'Sí' : 'No'])
  }
  rows.push([FUNDS_NOTICE, null, null, null, null, null, null, null, null])
  return rows
}

function reconciliationSheet(recs: Reconciliation[]): { rows: ExportCell[][]; totalRowIndexes: number[] } {
  const rows: ExportCell[][] = [['Conciliación', 'Fila', 'Según el Análisis (USD)', 'Ajuste por cierre USD (USD)', 'Ajuste por prorrateo (USD)', 'Real en Presupuestos (USD)']]
  const totalRowIndexes: number[] = []
  for (const rec of recs) {
    const name = rec.kind === 'ECONOMIC' ? 'Análisis Económico' : 'Análisis Financiero'
    for (const l of rec.lines) {
      rows.push([name, l.label, l.accordingToAnalysis, l.closureAdjustment, rec.prorationApplies ? l.prorationAdjustment : 'no aplica', l.budgetModule])
    }
    totalRowIndexes.push(rows.length)
    rows.push([name, 'Total del nivel', rec.total.accordingToAnalysis, rec.total.closureAdjustment, rec.prorationApplies ? rec.total.prorationAdjustment : 'no aplica', rec.total.budgetModule])
  }
  return { rows, totalRowIndexes }
}

function filtersSheet(level: BudgetLevel, input: BudgetExportInput): ExportCell[][] {
  const { result } = input
  const rows: ExportCell[][] = [['Concepto', 'Detalle']]
  rows.push(['Generado', input.generatedAt.toLocaleString('es-AR')])
  rows.push(['Nivel', LEVEL_LABELS[level]])
  rows.push(['Rango', `${monthLabel(result.months[0])} – ${monthLabel(result.months[result.months.length - 1])}`])
  rows.push(['Mes actual (límite real / proyectado)', monthLabel(result.currentMonth)])
  rows.push(['Filtros', input.filterDescriptions.length ? input.filterDescriptions.join(' · ') : 'Sin filtros (todas las filas del nivel)'])
  rows.push(['Moneda', 'USD — cierres USD históricos confiables de cada comprobante/cuota; sin cierre confiable se excluye y se marca incompleto'])
  rows.push(['Truncado', input.truncated ? 'Sí — se alcanzó el límite de documentos del servidor: los importes pueden estar incompletos' : 'No'])
  rows.push(['Diferencias con los Análisis', RECONCILIATION_NOTE])
  if (levelAffectedByCurrentAllocations(level)) rows.push(['Imputación histórica', HISTORICAL_ALLOCATION_WARNING])
  rows.push(['Fondos', FUNDS_NOTICE])
  rows.push(['Comprobantes excluidos (Real económico)', result.excludedEconomic.length])
  rows.push(['Cuotas excluidas (Real financiero)', result.excludedFinancial.length])
  for (const category of input.observations) {
    rows.push([`Observación (${category.severity === 'review' ? 'revisar' : 'informativa'})`, `${category.title} — ${category.count} ${category.countUnit}. ${category.description}`])
    for (const d of category.details) rows.push(['', `${d.assetName ? `${d.assetName}: ` : ''}${d.text}`])
  }
  return rows
}

export function buildBudgetExport(level: BudgetLevel, input: BudgetExportInput): { rows: ExportCell[][]; filename: string; options: XLSXExportOptions } {
  const main = mainSheet(level, input)
  const rec = reconciliationSheet(input.reconciliations)
  const { months } = input.result
  return {
    rows: main.rows,
    filename: `presupuestos-seguros_${LEVEL_LABELS[level].toLowerCase().replace(/\s+/g, '-')}_${months[0]}_${months[months.length - 1]}.xlsx`,
    options: {
      sheetName: 'Presupuesto vs real',
      autoFilter: true,
      numericColumnIndexes: MAIN_NUMERIC,
      numberFormat: USD_FORMAT,
      totalRowIndexes: main.totalRowIndexes,
      extraSheets: [
        { name: 'Fondos (no es costo)', rows: fundsSheet(input.visibleTotals.months), options: { numericColumnIndexes: [1, 2, 3, 4, 5, 6, 7], numberFormat: USD_FORMAT } },
        { name: 'Conciliación', rows: rec.rows, options: { numericColumnIndexes: [2, 3, 4, 5], numberFormat: USD_FORMAT, totalRowIndexes: rec.totalRowIndexes } },
        { name: 'Filtros y observaciones', rows: filtersSheet(level, input) },
      ],
    },
  }
}
