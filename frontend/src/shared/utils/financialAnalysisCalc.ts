import { getISOWeekKey } from './export'
import {
  normalizePaymentMethod,
  resolveDocumentPaymentMethod,
} from './documentPaymentMethod'
import {
  UNASSIGNED_ROW_ID,
  buildDocumentAllocationContexts,
  getAnalysisRows,
  rowIdFor,
  type MatrixRow,
} from './analysisGrouping'
import { adjustmentInstallmentIssue, type AdjustmentInstallmentIssue } from './adjustmentInstallments'
import type { DocumentForFinancial } from '../api/documents.api'
import type { Currency, Policy, Asset, Company, CostCenter, Installment, DocumentPolicyAllocation, AccountingDocument } from '../types'

// Financiero no agrupa por aseguradora (solo Económico).
export type RowGrouping = 'empresa' | 'centro_costo' | 'activo' | 'bien_de_uso' | 'poliza'
export type { MatrixRow }

// Cada cuota ya llega cerrada en ambas monedas (amountArs/amountUsd, calculadas
// server-side al crearla o al marcarla como pagada — ver computeDualAmounts).
// Elegir la columna correcta según el toggle de vista reemplaza cualquier
// reconversión con una tasa fija.
export function pickAmount(inst: Installment, displayCurrency: Currency): number {
  return displayCurrency === 'ARS' ? (inst.amountArs ?? 0) : (inst.amountUsd ?? 0)
}

// Siempre por fecha de vencimiento, esté pagada o no — el Análisis
// Financiero quiere ver cada cuota en el período que le correspondía vencer,
// no en el período en que se terminó pagando.
export function getInstallmentEffectiveDate(inst: Installment): string {
  return inst.dueDate
}

// ── Movimientos del período (fuente única de KPI, gráfico, tabla y exportes) ──
// Una cuota entra si su VENCIMIENTO cae en un mes del rango [from, to]
// (YYYY-MM). Filtrar acá — antes de armar KPI, gráfico o matriz — es lo que
// garantiza que una semana, trimestre o año que cruza el borde del rango no
// sume días o meses de afuera. Se excluyen las cuotas propias de un ajuste
// ya volcado en su factura (ver adjustmentInstallments), sin tocar los datos.

export interface FinancialSelection {
  installments: Installment[]
  /** NC/ND/Ajustes/Endosos aplicados con cuotas propias (excluidas o solo avisadas). */
  adjustmentIssues: AdjustmentInstallmentIssue[]
}

export function selectFinancialInstallments(documents: DocumentForFinancial[], from: string, to: string): FinancialSelection {
  const installments: Installment[] = []
  const adjustmentIssues: AdjustmentInstallmentIssue[] = []
  for (const doc of documents) {
    const inRange = doc.installments.filter((inst) => {
      const monthKey = getInstallmentEffectiveDate(inst).substring(0, 7)
      return monthKey >= from && monthKey <= to
    })
    if (inRange.length === 0) continue
    const issue = adjustmentInstallmentIssue(doc)
    if (issue) adjustmentIssues.push(issue)
    if (issue?.excluded) continue
    installments.push(...inRange)
  }
  return { installments, adjustmentIssues }
}

/** Vencida = no pagada y con vencimiento ANTERIOR a hoy (día de negocio, YYYY-MM-DD). */
export function isInstallmentOverdue(inst: Installment, todayStr: string): boolean {
  return inst.paymentStatus !== 'PAID' && inst.dueDate.slice(0, 10) < todayStr
}

export interface FinancialKpis { totalPaid: number; totalPending: number; total: number; overdueCount: number }

export function computeFinancialKpis(installments: Installment[], currency: Currency, todayStr: string): FinancialKpis {
  let totalPaid = 0
  let totalPending = 0
  let overdueCount = 0
  for (const inst of installments) {
    const amount = pickAmount(inst, currency)
    if (inst.paymentStatus === 'PAID') totalPaid += amount
    else totalPending += amount
    if (isInstallmentOverdue(inst, todayStr)) overdueCount++
  }
  return { totalPaid, totalPending, total: totalPaid + totalPending, overdueCount }
}

/** Serie mensual del gráfico (pagado / pendiente por mes de vencimiento). */
export function financialMonthlySeries(installments: Installment[], monthKeys: string[], currency: Currency): { key: string; paid: number; pending: number }[] {
  const byMonth = new Map(monthKeys.map((key) => [key, { key, paid: 0, pending: 0 }]))
  for (const inst of installments) {
    const bucket = byMonth.get(getInstallmentEffectiveDate(inst).substring(0, 7))
    if (!bucket) continue
    if (inst.paymentStatus === 'PAID') bucket.paid += pickAmount(inst, currency)
    else bucket.pending += pickAmount(inst, currency)
  }
  return [...byMonth.values()]
}

export function getRows(
  grouping: RowGrouping,
  companies: Company[],
  costCenters: CostCenter[],
  assets: Asset[],
  policies: Policy[],
): MatrixRow[] {
  return getAnalysisRows(grouping, companies, costCenters, assets, policies)
}

export interface CellData { paid: number; pending: number }
export type MatrixData = Map<string, Map<string, CellData>>
export type PaymentMethodMatrix = Map<string, Map<string, Map<string, CellData>>>

export interface FinancialMatrixResult {
  matrix: MatrixData
  paymentMethods: PaymentMethodMatrix
}

/**
 * `installments` = las del período (selectFinancialInstallments). Cada cuota
 * se reparte UNA vez por línea de asignación según su porcentaje real
 * (allocationPercentage); la parte no cubierta por las asignaciones (documento
 * sin asignar, o asignaciones < 100 %) va a «Sin asignar». Así la suma de las
 * filas de cualquier agrupación es la de las cuotas, sin duplicar.
 */
export function buildMatrixData(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  documents: AccountingDocument[],
  installments: Installment[],
  allocations: DocumentPolicyAllocation[],
): FinancialMatrixResult {
  const allocationContexts = buildDocumentAllocationContexts(allocations, policies, assets)
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]))
  const documentPaymentMethods = new Map(
    documents.map((doc) => [doc.id, resolveDocumentPaymentMethod(doc.id, documentsById)]),
  )
  const matrix: MatrixData = new Map()
  const paymentMethods: PaymentMethodMatrix = new Map()

  function add(rowId: string, key: string, amount: number, isPaid: boolean, paymentMethod: string) {
    if (!matrix.has(rowId)) matrix.set(rowId, new Map())
    const rowMap = matrix.get(rowId)!
    if (!rowMap.has(key)) rowMap.set(key, { paid: 0, pending: 0 })
    const cell = rowMap.get(key)!
    if (isPaid) cell.paid += amount
    else cell.pending += amount

    if (grouping === 'empresa') {
      if (!paymentMethods.has(rowId)) paymentMethods.set(rowId, new Map())
      const companyMethods = paymentMethods.get(rowId)!
      if (!companyMethods.has(paymentMethod)) companyMethods.set(paymentMethod, new Map())
      const methodPeriods = companyMethods.get(paymentMethod)!
      const methodCell = methodPeriods.get(key) ?? { paid: 0, pending: 0 }
      if (isPaid) methodCell.paid += amount
      else methodCell.pending += amount
      methodPeriods.set(key, methodCell)
    }
  }

  installments.forEach((inst) => {
    const effectiveDate = getInstallmentEffectiveDate(inst)
    const key = granularity === 'week'
      ? getISOWeekKey(effectiveDate)
      : effectiveDate.substring(0, 7)
    const amount = pickAmount(inst, displayCurrency)
    const isPaid = inst.paymentStatus === 'PAID'
    const paymentMethod = (
      normalizePaymentMethod(inst.paymentMethod)
      || documentPaymentMethods.get(inst.accountingDocumentId)
      || 'Sin especificar'
    )
    const contexts = allocationContexts.get(inst.accountingDocumentId) ?? []

    let allocatedShare = 0
    contexts.forEach((ctx) => {
      const share = ctx.allocationPercentage / 100
      allocatedShare += share
      add(rowIdFor(grouping, ctx), key, amount * share, isPaid, paymentMethod)
    })
    // Parte no distribuida (nunca negativa: una sobre-asignación no se compensa acá).
    const unassignedShare = 1 - allocatedShare
    if (unassignedShare > 1e-9) add(UNASSIGNED_ROW_ID, key, amount * unassignedShare, isPaid, paymentMethod)
  })

  return { matrix, paymentMethods }
}
