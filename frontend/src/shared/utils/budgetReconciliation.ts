import type { DocumentForFinancial } from '../api/documents.api'
import type { Asset, DocumentPolicyAllocation, Installment, Policy } from '../types'
import { buildEconomicMatrix, economicDocumentsInRange } from './economicAnalysisCalc'
import { buildMatrixData, selectFinancialInstallments } from './financialAnalysisCalc'
import { closureIn } from './renewalProjectionCalc'
import { BUDGET_LEVEL_GROUPING, levelUsesProration, type BudgetLevel } from './budgetAttribution'
import { documentUsd, realFinancial, type BudgetRow } from './budgetComparisonCalc'

// ═══════════════════════════════════════════════════════════════════════════
// Presupuestos — conciliación con los Análisis actuales (plan A–J rev. 2, D7).
//
// Presupuestos puede mostrar importes distintos del Análisis Económico /
// Financiero por dos motivos aceptados; esta conciliación los explica, fila
// por fila y en total, SIN modificar esos análisis (sus funciones se llaman
// tal cual):
//
//   Según el Análisis            buildEconomicMatrix / buildMatrixData sin
//                                cambios (primera asignación, cierre USD
//                                guardado tal cual, `?? 0`)
//   ± Ajuste por cierre USD      lo que el Análisis suma con un cierre USD no
//                                confiable y Presupuestos excluye
//   ± Ajuste por prorrateo       solo Empresa/Centro de costo: reparto por %
//                                de asignación del activo. Redistribuye entre
//                                filas: en el total del nivel suma 0
//   = Real en Presupuestos
//
// Controles (nunca se corrige en silencio — una diferencia se informa):
// - Σ ajuste por prorrateo del nivel ≈ 0 (la imputación conserva el total).
// - En Bien de uso y Activo el prorrateo no aplica: cada fila ≈ 0.
// ═══════════════════════════════════════════════════════════════════════════

export const RECONCILIATION_TOLERANCE_USD = 0.01

export interface ReconciliationLine {
  rowId: string
  label: string
  accordingToAnalysis: number
  closureAdjustment: number
  prorationAdjustment: number
  budgetModule: number
}

export interface Reconciliation {
  kind: 'ECONOMIC' | 'FINANCIAL'
  level: BudgetLevel
  prorationApplies: boolean
  lines: ReconciliationLine[]
  total: Omit<ReconciliationLine, 'rowId' | 'label'>
  /** Algún control no cerró dentro de la tolerancia (se informa como observación). */
  mismatch: boolean
  mismatchDetail: string | null
}

interface ReconcileInput {
  level: BudgetLevel
  from: string
  to: string
  documents: DocumentForFinancial[]
  policies: Policy[]
  assets: Asset[]
  rows: BudgetRow[]
}

function sumRow(matrix: Map<string, Map<string, number>>, rowId: string): number {
  let total = 0
  for (const v of matrix.get(rowId)?.values() ?? []) total += v
  return total
}

function build(
  kind: Reconciliation['kind'],
  level: BudgetLevel,
  rows: BudgetRow[],
  page: Map<string, Map<string, number>>,
  reliable: Map<string, Map<string, number>>,
  budgetValue: (row: BudgetRow) => number,
): Reconciliation {
  const prorationApplies = levelUsesProration(level)
  const labels = new Map(rows.map((r) => [r.id, r.label]))
  const budgetById = new Map(rows.map((r) => [r.id, budgetValue(r)]))
  const ids = new Set<string>([...page.keys(), ...reliable.keys(), ...budgetById.keys()])

  const lines: ReconciliationLine[] = []
  for (const rowId of ids) {
    const accordingToAnalysis = sumRow(page, rowId)
    const reliableValue = sumRow(reliable, rowId)
    const budgetModule = budgetById.get(rowId) ?? 0
    const line = {
      rowId,
      label: labels.get(rowId) ?? rowId,
      accordingToAnalysis,
      closureAdjustment: reliableValue - accordingToAnalysis,
      prorationAdjustment: budgetModule - reliableValue,
      budgetModule,
    }
    if ([line.accordingToAnalysis, line.closureAdjustment, line.prorationAdjustment, line.budgetModule].some((v) => Math.abs(v) > 1e-9)) {
      lines.push(line)
    }
  }
  const order = new Map(rows.map((r, i) => [r.id, i]))
  lines.sort((a, b) => (order.get(a.rowId) ?? Infinity) - (order.get(b.rowId) ?? Infinity))

  const total = lines.reduce(
    (t, l) => ({
      accordingToAnalysis: t.accordingToAnalysis + l.accordingToAnalysis,
      closureAdjustment: t.closureAdjustment + l.closureAdjustment,
      prorationAdjustment: t.prorationAdjustment + l.prorationAdjustment,
      budgetModule: t.budgetModule + l.budgetModule,
    }),
    { accordingToAnalysis: 0, closureAdjustment: 0, prorationAdjustment: 0, budgetModule: 0 },
  )

  let mismatchDetail: string | null = null
  if (Math.abs(total.prorationAdjustment) > RECONCILIATION_TOLERANCE_USD) {
    mismatchDetail = `El ajuste por prorrateo del nivel no suma 0 (US$ ${total.prorationAdjustment.toFixed(2)}).`
  } else if (!prorationApplies) {
    const off = lines.find((l) => Math.abs(l.prorationAdjustment) > RECONCILIATION_TOLERANCE_USD)
    if (off) mismatchDetail = `«${off.label}» difiere del Análisis por US$ ${off.prorationAdjustment.toFixed(2)} sin que aplique prorrateo.`
  }
  return { kind, level, prorationApplies, lines, total, mismatch: mismatchDetail !== null, mismatchDetail }
}

/** Conciliación del Real económico de Presupuestos con el Análisis Económico (mismo nivel, USD y rango). */
export function reconcileEconomic({ level, from, to, documents, policies, assets, rows }: ReconcileInput): Reconciliation {
  const grouping = BUDGET_LEVEL_GROUPING[level]
  const periodDocs = economicDocumentsInRange(documents, from, to)
  const allocations = periodDocs.flatMap((d) => d.allocations) as DocumentPolicyAllocation[]
  const page = buildEconomicMatrix(grouping, 'USD', 'month', policies, assets, periodDocs, allocations).matrix
  // Mismos documentos con el cierre USD confiable (los no confiables quedan
  // afuera): la diferencia contra `page` es exactamente el ajuste por cierre.
  const reliableDocs = periodDocs.flatMap((d) => {
    const usd = documentUsd(d)
    return usd === null ? [] : [{ ...d, totalAmountUsd: usd }]
  })
  const reliable = buildEconomicMatrix(grouping, 'USD', 'month', policies, assets, reliableDocs, allocations).matrix
  return build('ECONOMIC', level, rows, page, reliable, (r) => r.totals.realEconomic)
}

/** Conciliación del Real financiero de Presupuestos con el Análisis Financiero (mismo nivel, USD y rango). */
export function reconcileFinancial({ level, from, to, documents, policies, assets, rows }: ReconcileInput): Reconciliation {
  const grouping = BUDGET_LEVEL_GROUPING[level]
  const { installments } = selectFinancialInstallments(documents, from, to)
  const allocations = documents.flatMap((d) => d.allocations) as DocumentPolicyAllocation[]
  const toCellTotals = (m: Map<string, Map<string, { paid: number; pending: number }>>) =>
    new Map([...m.entries()].map(([id, months]) => [id, new Map([...months.entries()].map(([k, c]) => [k, c.paid + c.pending]))]))
  const page = toCellTotals(buildMatrixData(grouping, 'USD', 'month', policies, assets, documents, installments, allocations).matrix)
  const reliableInstallments: Installment[] = installments.flatMap((inst) => {
    const usd = closureIn({ currency: inst.currency, amount: inst.amount, amountArs: inst.amountArs, amountUsd: inst.amountUsd }, 'USD')
    return usd === null ? [] : [{ ...inst, amountUsd: usd }]
  })
  const reliable = toCellTotals(buildMatrixData(grouping, 'USD', 'month', policies, assets, documents, reliableInstallments, allocations).matrix)
  return build('FINANCIAL', level, rows, page, reliable, (r) => realFinancial(r.totals))
}
