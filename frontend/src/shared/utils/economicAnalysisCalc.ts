import { getISOWeekKey } from './export'
import { resolveDocumentPaymentMethod } from './documentPaymentMethod'
import { getDocumentEconomicEffect } from './documentEconomicEffect'
import {
  UNASSIGNED_ROW_ID,
  buildDocumentAllocationContexts,
  getAnalysisRows,
  isSyntheticRowId,
  rowIdFor,
  type AllocationContext,
  type MatrixRow,
} from './analysisGrouping'
import type { Currency, Policy, Asset, Company, CostCenter, AccountingDocument, DocumentPolicyAllocation } from '../types'

export type RowGrouping = 'empresa' | 'centro_costo' | 'aseguradora' | 'poliza' | 'activo' | 'bien_de_uso'
export { buildDocumentAllocationContexts }
export type { AllocationContext, MatrixRow }

// El documento ya llega cerrado en ambas monedas (totalAmountArs/totalAmountUsd,
// calculadas server-side al crearlo/editarlo — ver computeDualAmounts). Elegir
// la columna correcta reemplaza cualquier reconversión con una tasa fija.
export function pickDocTotal(doc: AccountingDocument, currency: Currency): number {
  return currency === 'ARS' ? (doc.totalAmountArs ?? 0) : (doc.totalAmountUsd ?? 0)
}

// Una asignación (allocatedAmount) es una porción del total del documento, en
// la moneda nativa del documento. Se re-expresa en la moneda pedida aplicando
// la misma fracción sobre el total ya cerrado en esa moneda.
export function allocationInCurrency(doc: AccountingDocument, allocatedAmount: number, currency: Currency): number {
  if (!doc.totalAmount) return 0
  return (allocatedAmount / doc.totalAmount) * pickDocTotal(doc, currency)
}

// ── Efecto económico (misma regla que el KPI) ─────────────────────────────────
// El KPI suma getDocumentEconomicEffect de cada documento (factura y ND
// suman; NC resta solo aplicada; ajuste y endoso según su signo/impacto y
// solo aplicados; anulado no aporta). La tabla reparte ESE efecto por importe
// asignado: cada asignación aporta |asignado| / |total| × efecto. Así el
// signo sale del documento (una NC aplicada resta aunque su distribución se
// haya cargado en positivo) y no de cómo se tipeó la asignación; la parte no
// asignada del efecto va a «Sin asignar».

export function economicEffectIn(doc: AccountingDocument, currency: Currency): number {
  return getDocumentEconomicEffect({ ...doc, totalAmount: pickDocTotal(doc, currency) })
}

export function allocationEconomicAmount(doc: AccountingDocument, allocatedAmount: number, currency: Currency): number {
  if (!doc.totalAmount) return 0
  return (Math.abs(allocatedAmount) / Math.abs(doc.totalAmount)) * economicEffectIn(doc, currency)
}

/** Documentos del período: los emitidos en un mes del rango [from, to] (YYYY-MM). */
export function economicDocumentsInRange<T extends AccountingDocument>(documents: T[], from: string, to: string): T[] {
  return documents.filter((doc) => {
    const monthKey = doc.issueDate.substring(0, 7)
    return monthKey >= from && monthKey <= to
  })
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

export type EconomicMatrixData = Map<string, Map<string, number>>
export type EconomicPaymentMethodMatrix = Map<string, Map<string, Map<string, number>>>

export interface EconomicMatrixResult {
  matrix: EconomicMatrixData
  paymentMethods: EconomicPaymentMethodMatrix
}

/** `documents` = los del período (economicDocumentsInRange). */
export function buildEconomicMatrix(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  documents: AccountingDocument[],
  allocations: DocumentPolicyAllocation[],
): EconomicMatrixResult {
  const allocationContexts = buildDocumentAllocationContexts(allocations, policies, assets)
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]))
  const matrix: EconomicMatrixData = new Map()
  const paymentMethods: EconomicPaymentMethodMatrix = new Map()

  function add(rowId: string, key: string, amount: number, paymentMethod: string) {
    if (!matrix.has(rowId)) matrix.set(rowId, new Map())
    const rowMap = matrix.get(rowId)!
    rowMap.set(key, (rowMap.get(key) ?? 0) + amount)

    if (grouping === 'empresa') {
      if (!paymentMethods.has(rowId)) paymentMethods.set(rowId, new Map())
      const companyMethods = paymentMethods.get(rowId)!
      if (!companyMethods.has(paymentMethod)) companyMethods.set(paymentMethod, new Map())
      const methodPeriods = companyMethods.get(paymentMethod)!
      methodPeriods.set(key, (methodPeriods.get(key) ?? 0) + amount)
    }
  }

  documents.forEach((doc) => {
    const effect = economicEffectIn(doc, displayCurrency)
    if (effect === 0) return
    const key = granularity === 'week'
      ? getISOWeekKey(doc.issueDate)
      : doc.issueDate.substring(0, 7)
    const paymentMethod = resolveDocumentPaymentMethod(doc.id, documentsById)
    const docContexts = allocationContexts.get(doc.id) ?? []

    let allocatedShare = 0
    if (doc.totalAmount) {
      docContexts.forEach((ctx) => {
        const share = Math.abs(ctx.allocatedAmount) / Math.abs(doc.totalAmount)
        allocatedShare += share
        add(rowIdFor(grouping, ctx), key, share * effect, paymentMethod)
      })
    }
    // Parte del efecto no distribuida (nunca negativa: una sobre-asignación no se compensa acá).
    const unassignedShare = 1 - allocatedShare
    if (unassignedShare > 1e-9) add(UNASSIGNED_ROW_ID, key, unassignedShare * effect, paymentMethod)
  })

  return { matrix, paymentMethods }
}

// ── KPI, torta y gráfico (misma fuente que la tabla) ─────────────────────────

export interface EconomicKpis {
  totalCost: number
  topInsurer: { name: string; amount: number }
  policiesWithCost: number
  /** Costo por aseguradora = filas de la agrupación «Aseguradora» (incluye «Sin asignar»/«Sin aseguradora»). */
  byInsurer: { id: string; amount: number }[]
}

export function computeEconomicKpis(
  documents: AccountingDocument[],
  allocations: DocumentPolicyAllocation[],
  policies: Policy[],
  assets: Asset[],
  currency: Currency,
): EconomicKpis {
  const totalCost = documents.reduce((sum, doc) => sum + economicEffectIn(doc, currency), 0)
  const docIds = new Set(documents.map((d) => d.id))
  const policiesWithCost = new Set(allocations.filter((a) => docIds.has(a.accountingDocumentId)).map((a) => a.policyId)).size
  const { matrix } = buildEconomicMatrix('aseguradora', currency, 'month', policies, assets, documents, allocations)
  const byInsurer = [...matrix.entries()].map(([id, months]) => ({ id, amount: [...months.values()].reduce((a, b) => a + b, 0) }))
  let topInsurer = { name: '—', amount: 0 }
  for (const { id, amount } of byInsurer) {
    if (!isSyntheticRowId(id) && amount > topInsurer.amount) topInsurer = { name: id, amount }
  }
  return { totalCost, topInsurer, policiesWithCost, byInsurer }
}

/** Serie mensual del gráfico de barras (efecto económico por mes de emisión). */
export function economicMonthlySeries(documents: AccountingDocument[], monthKeys: string[], currency: Currency): { key: string; total: number }[] {
  const byMonth = new Map(monthKeys.map((key) => [key, { key, total: 0 }]))
  for (const doc of documents) {
    const bucket = byMonth.get(doc.issueDate.substring(0, 7))
    if (bucket) bucket.total += economicEffectIn(doc, currency)
  }
  return [...byMonth.values()]
}
