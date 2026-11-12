import { formatCurrencyCompact, formatCurrencyFull, formatCurrencyInteger, formatPercent } from '../../../shared/utils/format'
import type { BudgetLevel } from '../../../shared/utils/budgetAttribution'
import { budgetStatus, estimatePercent, type BudgetAmounts, type BudgetStatus } from '../../../shared/utils/budgetComparisonCalc'

// Presupuestos se carga y se compara SIEMPRE en USD (cierres históricos confiables).
export const BUDGET_CURRENCY = 'USD'

export const LEVEL_LABELS: Record<BudgetLevel, string> = {
  COMPANY: 'Empresa',
  COST_CENTER: 'Centro de costo',
  FIXED_ASSET: 'Bien de uso',
  ASSET: 'Activo',
}

export const LEVEL_PLURAL: Record<BudgetLevel, string> = {
  COMPANY: 'Empresas',
  COST_CENTER: 'Centros de costo',
  FIXED_ASSET: 'Bienes de uso',
  ASSET: 'Activos',
}

export function usd(value: number): string {
  return formatCurrencyFull(value, BUDGET_CURRENCY)
}

/** Sin decimales — para tablas anchas; el valor exacto va en el title y en el Excel. */
export function usdInteger(value: number): string {
  return formatCurrencyInteger(value, BUDGET_CURRENCY)
}

export function usdCompact(value: number): string {
  return formatCurrencyCompact(value, BUDGET_CURRENCY)
}

/** Importe con marca de incompleto (* = excluye importes sin cierre USD confiable). */
export function usdMarked(value: number, incomplete: boolean, compact = false): string {
  return `${compact ? usdCompact(value) : usd(value)}${incomplete ? '*' : ''}`
}

/** % de ejecución estimada: «n/a» con presupuesto 0, «—» sin presupuesto. */
export function percentLabel(a: BudgetAmounts): string {
  const p = estimatePercent(a)
  if (p !== null) return formatPercent(p * 100, 0)
  return a.budgetDefined > 0 ? 'n/a' : '—'
}

export const STATUS_META: Record<BudgetStatus, { label: string; variant: 'danger' | 'success' | 'default' }> = {
  over: { label: 'Excedido', variant: 'danger' },
  within: { label: 'Dentro', variant: 'success' },
  no_budget: { label: 'Sin presupuesto', variant: 'default' },
}

export function statusOf(a: BudgetAmounts) {
  return STATUS_META[budgetStatus(a)]
}

/** Advertencia D8 — imputación histórica con las asignaciones actuales. */
export const HISTORICAL_ALLOCATION_WARNING =
  'La imputación de gastos históricos usa la asignación actual de cada activo; si un activo cambió de empresa, centro de costo o bien de uso, los meses anteriores se muestran con la asignación de hoy.'

/** Nota fija sobre las diferencias con los Análisis (detalle en la conciliación). */
export const RECONCILIATION_NOTE =
  'Los importes pueden diferir del Análisis Económico y del Financiero por dos motivos: acá se excluyen los comprobantes sin cierre USD confiable y, en Empresa y Centro de costo, cada activo se reparte según el % de sus asignaciones (los Análisis lo imputan entero a la primera). La conciliación al pie explica cada diferencia.'

export const FUNDS_NOTICE =
  'Flujo de fondos: cuotas por fecha de vencimiento más la proyección financiera. No es gasto económico — devengamiento y pago ocurren en momentos distintos, por eso se compara en acumulado y nunca se suma al costo.'
