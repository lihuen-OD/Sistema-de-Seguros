import type { DocumentForFinancial } from '../api/documents.api'
import type { Asset, BienDeUso, Company, CostCenter, Installment, Policy } from '../types'
import {
  UNASSIGNED_ROW_ID,
  buildDocumentAllocationContexts,
  completeRows,
  getAnalysisRows,
  isSyntheticRowId,
  type MatrixRow,
} from './analysisGrouping'
import { getDocumentEconomicEffect } from './documentEconomicEffect'
import { economicDocumentsInRange } from './economicAnalysisCalc'
import { selectFinancialInstallments } from './financialAnalysisCalc'
import type { AdjustmentInstallmentIssue } from './adjustmentInstallments'
import { buildMonthRange, closureIn } from './renewalProjectionCalc'
import type { RenewalProjectionRowData } from './renewalProjectionRows'
import {
  BUDGET_LEVEL_GROUPING,
  allocationPercentIssues,
  assetAttribution,
  contextAttribution,
  type AllocationPercentIssue,
  type AttributionShare,
  type BudgetLevel,
} from './budgetAttribution'

// ═══════════════════════════════════════════════════════════════════════════
// Presupuestos — comparación presupuesto vs real vs proyección (USD).
//
// Siete conceptos INDEPENDIENTES por fila y mes (plan A–J rev. 2, D4):
//   Presupuesto         importe cargado; null = mes SIN presupuesto (≠ 0)
//   Real económico      comprobantes por issueDate, con signo económico
//   Real financiero     cuotas por dueDate (pagadas + pendientes) — SOLO
//                       referencia de fondos: nunca entra en un total de costo
//   Proyección futura   solo la parte proyectada del motor ECONOMIC (períodos
//                       posteriores al último real, desde el mes actual)
//   Estimado de cierre  Real económico + Proyección futura (única suma)
//   Desvío real         Real económico − Presupuesto, solo meses
//                       transcurridos (≤ mes actual) con presupuesto
//   Desvío estimado     Estimado − Presupuesto, meses con presupuesto
//
// USD: solo cierres históricos confiables (closureIn). Un comprobante o cuota
// sin cierre plausible se EXCLUYE, se cuenta y marca incompleto todo lo que
// toca — nunca se usa el TC patrimonial ni el del sistema.
// Un nivel por vez: nunca se combinan presupuestos ni importes de niveles
// distintos (computeBudgetComparison rechaza presupuestos de otro nivel).
// ═══════════════════════════════════════════════════════════════════════════

export interface BudgetLineInput {
  scopeType: BudgetLevel
  scopeId: string
  months: { month: string; amountUsd: number }[]
}

export interface BudgetComparisonInput {
  level: BudgetLevel
  /** Rango 'YYYY-MM' inclusive. */
  from: string
  to: string
  /** Mes actual 'YYYY-MM' (día de negocio). */
  currentMonth: string
  documents: DocumentForFinancial[]
  policies: Policy[]
  assets: Asset[]
  companies: Company[]
  costCenters: CostCenter[]
  fixedAssets: BienDeUso[]
  /** Filas de la proyección ECONOMIC (renewalProjectionRows) — solo se usa la parte proyectada. */
  economicProjectionRows: RenewalProjectionRowData[]
  /** Filas de la proyección FINANCIAL — solo para la sección de fondos. */
  financialProjectionRows: RenewalProjectionRowData[]
  budgets: BudgetLineInput[]
}

export type BudgetStatus = 'no_budget' | 'over' | 'within'

/** Valores aditivos de una celda (fila × mes) — todos suman entre filas sin reglas especiales. */
export interface BudgetAmounts {
  /** Σ presupuestos definidos (0 si ninguno; ver budgetDefined). */
  budget: number
  /** Cantidad de (fila, mes) con presupuesto definido. */
  budgetDefined: number
  realEconomic: number
  projection: number
  /** realEconomic + projection. */
  estimate: number
  /** Estimado solo de las celdas con presupuesto (base del %). */
  estimateBudgeted: number
  /** Real económico de celdas SIN presupuesto (se informa aparte, fuera de los desvíos). */
  realWithoutBudget: number
  deviationReal: number
  /** Cantidad de celdas que aportan al desvío real (transcurridas y con presupuesto). */
  deviationRealCells: number
  deviationEstimate: number
  realFinancialPaid: number
  realFinancialPending: number
  financialProjection: number
  excludedEconomic: number
  excludedFinancial: number
}

export interface BudgetMonthCell extends BudgetAmounts {
  month: string
  isElapsed: boolean
}

export interface BudgetRowTotals extends BudgetAmounts {
  monthCount: number
}

export interface BudgetRow extends MatrixRow {
  synthetic: boolean
  /** La entidad tiene una línea de presupuesto (aunque no tenga meses en el rango). */
  hasBudgetLine: boolean
  months: BudgetMonthCell[]
  totals: BudgetRowTotals
}

export interface ExcludedItem {
  kind: 'document' | 'installment'
  documentId: string
  documentNumber: string
  /** issueDate (documento) o dueDate (cuota), YYYY-MM-DD. */
  date: string
  currency: string
  nativeAmount: number
}

export interface BudgetComparisonResult {
  level: BudgetLevel
  months: string[]
  currentMonth: string
  rows: BudgetRow[]
  /** Total del NIVEL (todas las filas, incluidas «Sin …»/«Sin asignar»). */
  levelTotals: { months: BudgetMonthCell[]; totals: BudgetRowTotals }
  excludedEconomic: ExcludedItem[]
  excludedFinancial: ExcludedItem[]
  adjustmentIssues: AdjustmentInstallmentIssue[]
  allocationIssues: AllocationPercentIssue[]
  /** Activos con movimientos en el rango cuya proyección está bloqueada (sin base USD confiable). */
  projectionBlocked: { assetId: string; name: string }[]
  /** Real económico (USD) de coberturas SIN activo: tienen real pero nunca proyección. */
  linesWithoutAssetRealUsd: number
}

// ── Celdas ───────────────────────────────────────────────────────────────────

export function emptyAmounts(): BudgetAmounts {
  return {
    budget: 0, budgetDefined: 0, realEconomic: 0, projection: 0, estimate: 0, estimateBudgeted: 0,
    realWithoutBudget: 0, deviationReal: 0, deviationRealCells: 0, deviationEstimate: 0,
    realFinancialPaid: 0, realFinancialPending: 0, financialProjection: 0, excludedEconomic: 0, excludedFinancial: 0,
  }
}

// Solo los campos de importe/contador: nunca month, isElapsed ni monthCount
// (recorrer las claves del destino los concatenaría o los dejaría en NaN).
const AMOUNT_KEYS = Object.keys(emptyAmounts()) as (keyof BudgetAmounts)[]

function addInto(target: BudgetAmounts, source: BudgetAmounts): void {
  for (const key of AMOUNT_KEYS) target[key] += source[key]
}

/** Real financiero total (pagado + pendiente) — referencia de fondos, nunca costo. */
export function realFinancial(a: BudgetAmounts): number {
  return a.realFinancialPaid + a.realFinancialPending
}

/** % de ejecución estimada sobre lo presupuestado; null si no hay presupuesto o es 0 (n/a). */
export function estimatePercent(a: BudgetAmounts): number | null {
  if (a.budgetDefined === 0 || a.budget <= 0) return null
  return a.estimateBudgeted / a.budget
}

/** Excedido si el desvío estimado supera medio centavo; sin presupuesto si no hay ninguna celda con presupuesto. */
export function budgetStatus(a: BudgetAmounts): BudgetStatus {
  if (a.budgetDefined === 0) return 'no_budget'
  return a.deviationEstimate > 0.005 ? 'over' : 'within'
}

/** Algo de la celda/total quedó afuera por cierre USD no confiable. */
export function isIncomplete(a: BudgetAmounts): boolean {
  return a.excludedEconomic > 0 || a.excludedFinancial > 0
}

/** Desvío real solo existe si hay al menos una celda transcurrida con presupuesto. */
export function deviationRealOrNull(a: BudgetAmounts): number | null {
  return a.deviationRealCells > 0 ? a.deviationReal : null
}

export function deviationEstimateOrNull(a: BudgetAmounts): number | null {
  return a.budgetDefined > 0 ? a.deviationEstimate : null
}

// ── Acumulador ───────────────────────────────────────────────────────────────

interface RawCell {
  realEconomic: number
  projection: number
  realFinancialPaid: number
  realFinancialPending: number
  financialProjection: number
  excludedEconomic: Set<string>
  excludedFinancial: Set<string>
}

function emptyRaw(): RawCell {
  return {
    realEconomic: 0, projection: 0, realFinancialPaid: 0, realFinancialPending: 0, financialProjection: 0,
    excludedEconomic: new Set(), excludedFinancial: new Set(),
  }
}

class Accumulator {
  private readonly cells = new Map<string, Map<string, RawCell>>()
  constructor(private readonly monthSet: Set<string>) {}

  cell(rowId: string, month: string): RawCell | null {
    if (!this.monthSet.has(month)) return null
    let row = this.cells.get(rowId)
    if (!row) this.cells.set(rowId, (row = new Map()))
    let c = row.get(month)
    if (!c) row.set(month, (c = emptyRaw()))
    return c
  }

  rowIds(): string[] {
    return [...this.cells.keys()]
  }

  get(rowId: string, month: string): RawCell | undefined {
    return this.cells.get(rowId)?.get(month)
  }
}

function spread(shares: AttributionShare[], fn: (rowId: string, weight: number) => void) {
  for (const { rowId, weight } of shares) if (weight > 0) fn(rowId, weight)
}

function installmentUsd(inst: Installment): number | null {
  return closureIn({ currency: inst.currency, amount: inst.amount, amountArs: inst.amountArs, amountUsd: inst.amountUsd }, 'USD')
}

/** Total USD confiable de un documento, o null (sin cierre USD plausible). */
export function documentUsd(doc: DocumentForFinancial): number | null {
  return closureIn({ currency: doc.currency, amount: doc.totalAmount, amountArs: doc.totalAmountArs, amountUsd: doc.totalAmountUsd }, 'USD')
}

// ── Cálculo principal ────────────────────────────────────────────────────────

export function computeBudgetComparison(input: BudgetComparisonInput): BudgetComparisonResult {
  const { level, from, to, currentMonth, documents, policies, assets } = input
  const foreign = input.budgets.find((b) => b.scopeType !== level)
  if (foreign) {
    // Nunca se combinan niveles: un presupuesto de otro nivel acá sería una suma inventada.
    throw new Error(`Presupuesto de nivel ${foreign.scopeType} en una comparación de nivel ${level}`)
  }

  const months = buildMonthRange(from, to)
  const acc = new Accumulator(new Set(months))
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const allocations = documents.flatMap((d) => d.allocations)
  const contextsByDoc = buildDocumentAllocationContexts(allocations, policies, assets)

  // ── Real económico (issueDate, signo económico, USD confiable) ──
  const excludedEconomic: ExcludedItem[] = []
  let linesWithoutAssetRealUsd = 0
  for (const doc of economicDocumentsInRange(documents, from, to)) {
    // Sin efecto económico (anulado, NC no aplicada…) no aporta ni se excluye.
    if (getDocumentEconomicEffect(doc) === 0) continue
    const month = doc.issueDate.substring(0, 7)
    const contexts = contextsByDoc.get(doc.id) ?? []
    const usd = documentUsd(doc)
    if (usd === null) {
      excludedEconomic.push({
        kind: 'document', documentId: doc.id, documentNumber: doc.documentNumber,
        date: doc.issueDate.substring(0, 10), currency: doc.currency, nativeAmount: getDocumentEconomicEffect(doc),
      })
      const rows = new Set<string>()
      for (const ctx of contexts) spread(contextAttribution(level, ctx, assetById), (rowId) => rows.add(rowId))
      if (contexts.length === 0) rows.add(UNASSIGNED_ROW_ID)
      for (const rowId of rows) acc.cell(rowId, month)?.excludedEconomic.add(doc.id)
      continue
    }
    const effect = getDocumentEconomicEffect({ ...doc, totalAmount: usd })
    if (effect === 0) continue
    // Mismo reparto que el Análisis Económico: |asignado| / |total| × efecto;
    // la parte no distribuida va a «Sin asignar».
    let allocatedShare = 0
    if (doc.totalAmount) {
      for (const ctx of contexts) {
        const share = Math.abs(ctx.allocatedAmount) / Math.abs(doc.totalAmount)
        allocatedShare += share
        if (!ctx.assetId) linesWithoutAssetRealUsd += share * effect
        spread(contextAttribution(level, ctx, assetById), (rowId, weight) => {
          acc.cell(rowId, month)!.realEconomic += share * effect * weight
        })
      }
    }
    const unassigned = 1 - allocatedShare
    if (unassigned > 1e-9) acc.cell(UNASSIGNED_ROW_ID, month)!.realEconomic += unassigned * effect
  }

  // ── Real financiero (dueDate, pagado/pendiente, USD confiable) ──
  const { installments, adjustmentIssues } = selectFinancialInstallments(documents, from, to)
  const docById = new Map(documents.map((d) => [d.id, d]))
  const excludedFinancial: ExcludedItem[] = []
  for (const inst of installments) {
    const month = inst.dueDate.substring(0, 7)
    const contexts = contextsByDoc.get(inst.accountingDocumentId) ?? []
    const usd = installmentUsd(inst)
    if (usd === null) {
      const doc = docById.get(inst.accountingDocumentId)
      excludedFinancial.push({
        kind: 'installment', documentId: inst.accountingDocumentId, documentNumber: doc?.documentNumber ?? '—',
        date: inst.dueDate.substring(0, 10), currency: inst.currency, nativeAmount: inst.amount,
      })
      const rows = new Set<string>()
      for (const ctx of contexts) spread(contextAttribution(level, ctx, assetById), (rowId) => rows.add(rowId))
      if (contexts.length === 0) rows.add(UNASSIGNED_ROW_ID)
      for (const rowId of rows) acc.cell(rowId, month)?.excludedFinancial.add(inst.id)
      continue
    }
    const isPaid = inst.paymentStatus === 'PAID'
    // Mismo reparto que el Análisis Financiero: por allocationPercentage; el
    // resto no distribuido va a «Sin asignar».
    let allocatedShare = 0
    for (const ctx of contexts) {
      const share = ctx.allocationPercentage / 100
      allocatedShare += share
      spread(contextAttribution(level, ctx, assetById), (rowId, weight) => {
        const cell = acc.cell(rowId, month)!
        if (isPaid) cell.realFinancialPaid += usd * share * weight
        else cell.realFinancialPending += usd * share * weight
      })
    }
    const unassigned = 1 - allocatedShare
    if (unassigned > 1e-9) {
      const cell = acc.cell(UNASSIGNED_ROW_ID, month)!
      if (isPaid) cell.realFinancialPaid += usd * unassigned
      else cell.realFinancialPending += usd * unassigned
    }
  }

  // ── Proyección futura (solo la parte proyectada; misma regla que la pantalla de Proyección) ──
  const projectionBlocked: { assetId: string; name: string }[] = []
  const addProjection = (rows: RenewalProjectionRowData[], field: 'projection' | 'financialProjection') => {
    for (const row of rows) {
      const shares = assetAttribution(level, row.assetId, assetById.get(row.assetId))
      for (const [month, cell] of row.projectedByMonth) {
        // Nada proyectado antes del mes actual (el motor ya proyecta desde
        // hoy; esto lo garantiza aunque reciba filas con otro horizonte).
        if (month < currentMonth) continue
        if (!Number.isFinite(cell.amountUsd) || cell.amountUsd <= 0) continue
        spread(shares, (rowId, weight) => {
          const target = acc.cell(rowId, month)
          if (target) target[field] += cell.amountUsd * weight
        })
      }
    }
  }
  addProjection(input.economicProjectionRows, 'projection')
  addProjection(input.financialProjectionRows, 'financialProjection')
  if (to >= currentMonth) {
    for (const row of input.economicProjectionRows) {
      if (row.projectionBlocked && row.realTimeline.size > 0) projectionBlocked.push({ assetId: row.assetId, name: row.name })
    }
  }

  // ── Presupuestos del nivel ──
  const budgetByScope = new Map(input.budgets.map((b) => [b.scopeId, new Map(b.months.map((m) => [m.month, m.amountUsd]))]))

  // ── Filas: toda entidad con datos (real, proyección, exclusiones o línea de presupuesto) ──
  const rowIdsWithData = new Set<string>([...acc.rowIds(), ...budgetByScope.keys()])
  const grouping = BUDGET_LEVEL_GROUPING[level]
  const lookups = { companies: input.companies, costCenters: input.costCenters, assets, policies }
  const baseRows = getAnalysisRows(grouping, input.companies, input.costCenters, assets, policies).filter((r) => rowIdsWithData.has(r.id))
  const fixedAssetById = new Map(input.fixedAssets.map((f) => [f.id, f]))
  const matrixRows = completeRows(grouping, baseRows, rowIdsWithData, lookups).map((r) => {
    // Un bien de uso del catálogo sin activos asignados no figura en las
    // filas derivadas de activos: se nombra desde el catálogo.
    const fa = level === 'FIXED_ASSET' ? fixedAssetById.get(r.id) : undefined
    return fa && r.label === 'Bien de uso no encontrado' ? { id: r.id, label: fa.name, sublabel: fa.code || undefined } : r
  })

  const rows: BudgetRow[] = matrixRows.map((r) => {
    const budgetMonths = budgetByScope.get(r.id)
    const cells = months.map((month) => buildCell(acc.get(r.id, month), budgetMonths?.get(month), month, currentMonth))
    return {
      ...r,
      synthetic: isSyntheticRowId(r.id),
      hasBudgetLine: budgetByScope.has(r.id),
      months: cells,
      totals: totalsOf(cells),
    }
  })

  return {
    level,
    months,
    currentMonth,
    rows,
    levelTotals: aggregateRows(rows, months, currentMonth),
    excludedEconomic,
    excludedFinancial,
    adjustmentIssues,
    allocationIssues: allocationPercentIssues(assets),
    projectionBlocked,
    linesWithoutAssetRealUsd,
  }
}

function buildCell(raw: RawCell | undefined, budget: number | undefined, month: string, currentMonth: string): BudgetMonthCell {
  const r = raw ?? emptyRaw()
  const isElapsed = month <= currentMonth
  const hasBudget = budget !== undefined
  const estimate = r.realEconomic + r.projection
  return {
    month,
    isElapsed,
    budget: hasBudget ? budget : 0,
    budgetDefined: hasBudget ? 1 : 0,
    realEconomic: r.realEconomic,
    projection: r.projection,
    estimate,
    estimateBudgeted: hasBudget ? estimate : 0,
    realWithoutBudget: hasBudget ? 0 : r.realEconomic,
    deviationReal: hasBudget && isElapsed ? r.realEconomic - budget : 0,
    deviationRealCells: hasBudget && isElapsed ? 1 : 0,
    deviationEstimate: hasBudget ? estimate - budget : 0,
    realFinancialPaid: r.realFinancialPaid,
    realFinancialPending: r.realFinancialPending,
    financialProjection: r.financialProjection,
    excludedEconomic: r.excludedEconomic.size,
    excludedFinancial: r.excludedFinancial.size,
  }
}

function totalsOf(cells: BudgetMonthCell[]): BudgetRowTotals {
  const totals = { ...emptyAmounts(), monthCount: cells.length }
  for (const c of cells) addInto(totals, c)
  return totals
}

/**
 * Suma de un conjunto de filas del MISMO nivel (todas = total del nivel;
 * las visibles = total de filas visibles). Los desvíos se suman fila a fila
 * (nunca «estimado agregado − presupuesto agregado»), así el real de filas
 * sin presupuesto no se mezcla en el desvío. Los contadores de exclusión
 * de un agregado cuentan celdas afectadas (un comprobante repartido en dos
 * filas cuenta en ambas); la cantidad de comprobantes distintos excluidos es
 * excludedEconomic/excludedFinancial del resultado.
 */
export function aggregateRows(rows: BudgetRow[], months: string[], currentMonth: string): { months: BudgetMonthCell[]; totals: BudgetRowTotals } {
  const cells = months.map((month, i) => {
    const cell: BudgetMonthCell = { month, isElapsed: month <= currentMonth, ...emptyAmounts() }
    for (const row of rows) addInto(cell, row.months[i])
    return cell
  })
  return { months: cells, totals: totalsOf(cells) }
}

// ── Flujo de fondos acumulado (D5) — NO es costo ─────────────────────────────

export interface FundsPoint {
  month: string
  /** Presupuesto del mes (0 si no hay ninguno definido). */
  budget: number
  /** Vencimientos del mes: pagado + pendiente. */
  due: number
  financialProjection: number
  /** Necesidad de fondos del mes = vencimientos + proyección financiera. */
  need: number
  cumulativeBudget: number
  cumulativeNeed: number
  /** Diferencia de fondos acumulada = presupuesto acumulado − necesidad acumulada (nunca «desvío»). */
  fundsDifference: number
  incomplete: boolean
}

export function buildFundsSeries(cells: BudgetMonthCell[]): FundsPoint[] {
  let cumulativeBudget = 0
  let cumulativeNeed = 0
  return cells.map((c) => {
    const due = realFinancial(c)
    const need = due + c.financialProjection
    cumulativeBudget += c.budget
    cumulativeNeed += need
    return {
      month: c.month,
      budget: c.budget,
      due,
      financialProjection: c.financialProjection,
      need,
      cumulativeBudget,
      cumulativeNeed,
      fundsDifference: cumulativeBudget - cumulativeNeed,
      incomplete: c.excludedFinancial > 0,
    }
  })
}

// ── Filtros (D2.4): solo ocultan filas, nunca recortan importes ──────────────

export interface BudgetRowFilters {
  /** Entidades del nivel elegidas (vacío = todas). */
  entityIds: string[]
  /** Solo nivel Activo: activos asignados a estas empresas / centros / bienes de uso. */
  companyIds?: string[]
  costCenterIds?: string[]
  fixedAssetIds?: string[]
}

export function hasActiveFilters(f: BudgetRowFilters): boolean {
  return f.entityIds.length > 0 || !!f.companyIds?.length || !!f.costCenterIds?.length || !!f.fixedAssetIds?.length
}

export function filterBudgetRows(rows: BudgetRow[], level: BudgetLevel, filters: BudgetRowFilters, assets: Asset[]): BudgetRow[] {
  if (!hasActiveFilters(filters)) return rows
  const entities = new Set(filters.entityIds)
  const assetById = new Map(assets.map((a) => [a.id, a]))
  return rows.filter((row) => {
    // Las filas «Sin …» no son una entidad elegible: con filtros quedan fuera
    // de la tabla pero su importe sigue en «Total del nivel».
    if (row.synthetic) return false
    if (entities.size > 0 && !entities.has(row.id)) return false
    if (level !== 'ASSET') return true
    const asset = assetById.get(row.id)
    const allocations = asset?.allocations ?? []
    if (filters.companyIds?.length && !allocations.some((a) => filters.companyIds!.includes(a.companyId))) return false
    if (filters.costCenterIds?.length && !allocations.some((a) => filters.costCenterIds!.includes(a.costCenterId))) return false
    if (filters.fixedAssetIds?.length && !(asset?.fixedAssetId && filters.fixedAssetIds.includes(asset.fixedAssetId))) return false
    return true
  })
}

/** Importe de las filas «Sin …»/«Sin asignar» del nivel (para el pie con filtros). */
export function syntheticTotals(rows: BudgetRow[], months: string[], currentMonth: string): BudgetRowTotals {
  return aggregateRows(rows.filter((r) => r.synthetic), months, currentMonth).totals
}

/** Fila «Sin asignar» u otra sintética: sin presupuesto posible. */
export function isUnassignedRow(row: Pick<BudgetRow, 'id'>): boolean {
  return row.id === UNASSIGNED_ROW_ID
}
