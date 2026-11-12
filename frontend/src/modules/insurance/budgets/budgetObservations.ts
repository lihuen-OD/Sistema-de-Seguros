import type { ObservationCategory, ObservationDetail } from '../../../shared/utils/observations'
import { levelUsesProration } from '../../../shared/utils/budgetAttribution'
import type { BudgetComparisonResult, ExcludedItem } from '../../../shared/utils/budgetComparisonCalc'
import type { Reconciliation } from '../../../shared/utils/budgetReconciliation'
import { formatCurrencyFull, formatDate } from '../../../shared/utils/format'
import { usd } from './budgetFormat'

// Observaciones de Presupuestos (panel compacto compartido). Solo PRESENTA lo
// que ya calculó la comparación y la conciliación — no recalcula ni corrige.

function excludedDetail(item: ExcludedItem): ObservationDetail {
  const what = item.kind === 'installment' ? `cuota venc. ${formatDate(item.date)}` : `emitido ${formatDate(item.date)}`
  return { assetName: item.documentNumber, text: `${what} · ${formatCurrencyFull(item.nativeAmount, item.currency)} (moneda original, no se suma)` }
}

export function buildBudgetObservations(
  result: BudgetComparisonResult,
  reconciliations: Reconciliation[],
): ObservationCategory[] {
  const categories: ObservationCategory[] = []

  if (result.excludedEconomic.length > 0) {
    categories.push({
      key: 'excluded-economic',
      severity: 'review',
      title: 'Comprobantes sin cierre USD confiable (fuera del Real económico)',
      count: result.excludedEconomic.length,
      countUnit: result.excludedEconomic.length === 1 ? 'comprobante' : 'comprobantes',
      description: 'No tienen un cierre USD plausible (falta o TC ≤ 1). No se convierten con ningún otro tipo de cambio: quedan afuera y cada total que tocan se marca con * (incompleto). Revisá el cierre USD del comprobante.',
      details: result.excludedEconomic.map(excludedDetail),
    })
  }
  if (result.excludedFinancial.length > 0) {
    categories.push({
      key: 'excluded-financial',
      severity: 'review',
      title: 'Cuotas sin cierre USD confiable (fuera del Real financiero)',
      count: result.excludedFinancial.length,
      countUnit: result.excludedFinancial.length === 1 ? 'cuota' : 'cuotas',
      description: 'Mismo criterio que los comprobantes: quedan afuera de los vencimientos y la sección de fondos se marca incompleta.',
      details: result.excludedFinancial.map(excludedDetail),
    })
  }

  const excludedAdj = result.adjustmentIssues.filter((i) => i.excluded)
  const pendingAdj = result.adjustmentIssues.filter((i) => !i.excluded)
  if (pendingAdj.length > 0) {
    categories.push({
      key: 'adjustment-unconfirmed',
      severity: 'review',
      title: 'Ajustes con cuotas propias que no se pudo confirmar',
      count: pendingAdj.length,
      countUnit: pendingAdj.length === 1 ? 'documento' : 'documentos',
      description: 'Sus cuotas propias se cuentan en el Real financiero, pero lo volcado en la factura no cubre el total: revisá que no se dupliquen.',
      details: pendingAdj.map((i) => ({ assetName: i.documentNumber, text: `cuotas propias ${formatCurrencyFull(i.ownInstallmentsAmount, i.currency)}` })),
    })
  }
  if (excludedAdj.length > 0) {
    categories.push({
      key: 'adjustment-excluded',
      severity: 'info',
      title: 'Cuotas propias de ajustes ya volcados en su factura (no se suman)',
      count: excludedAdj.length,
      countUnit: excludedAdj.length === 1 ? 'documento' : 'documentos',
      description: 'El ajuste ya está reflejado en las cuotas de la factura vinculada; sumar también sus cuotas propias lo duplicaría (mismo criterio que el Análisis Financiero).',
      details: excludedAdj.map((i) => ({ assetName: i.documentNumber, text: `cuotas propias ${formatCurrencyFull(i.ownInstallmentsAmount, i.currency)}` })),
    })
  }

  if (levelUsesProration(result.level) && result.allocationIssues.length > 0) {
    categories.push({
      key: 'allocation-percent',
      severity: 'review',
      title: 'Activos cuyas asignaciones no suman 100 %',
      count: result.allocationIssues.length,
      countUnit: result.allocationIssues.length === 1 ? 'activo' : 'activos',
      description: 'Lo que falta para 100 % se muestra en «Sin asignar» (si supera 100 % se normaliza para no duplicar). No se corrige nada: revisá las asignaciones del activo.',
      details: result.allocationIssues.map((i) => ({ assetName: i.assetName, text: `asignado ${i.totalPercent.toFixed(2).replace('.', ',')} %` })),
    })
  }

  if (result.projectionBlocked.length > 0) {
    categories.push({
      key: 'projection-blocked',
      severity: 'info',
      title: 'Activos sin proyección (sin base USD confiable)',
      count: result.projectionBlocked.length,
      countUnit: result.projectionBlocked.length === 1 ? 'activo' : 'activos',
      description: 'Su Estimado de cierre no incluye renovaciones futuras. Se puede cargar la base USD en Proyección de Renovaciones.',
      details: result.projectionBlocked.map((a) => ({ assetName: a.name, text: 'sin proyección' })),
    })
  }

  if (Math.abs(result.linesWithoutAssetRealUsd) > 0.005 && result.months[result.months.length - 1] >= result.currentMonth) {
    categories.push({
      key: 'lines-without-asset',
      severity: 'info',
      title: 'Coberturas sin activo: tienen real pero no proyección',
      count: 1,
      countUnit: 'aviso',
      description: `Real económico de coberturas sin activo en el período: ${usd(result.linesWithoutAssetRealUsd)}. La proyección es por activo, así que su renovación no entra en el Estimado de cierre (puede quedar corto).`,
      details: [],
    })
  }

  for (const rec of reconciliations) {
    if (!rec.mismatch) continue
    categories.push({
      key: `reconciliation-${rec.kind}`,
      severity: 'review',
      title: `La conciliación con el Análisis ${rec.kind === 'ECONOMIC' ? 'Económico' : 'Financiero'} no cierra`,
      count: 1,
      countUnit: 'diferencia',
      description: 'Hay una diferencia que no explican el cierre USD ni el prorrateo. No se corrige automáticamente: revisá el detalle en la conciliación.',
      details: [{ assetName: null, text: rec.mismatchDetail ?? '' }],
    })
  }

  return categories
}
