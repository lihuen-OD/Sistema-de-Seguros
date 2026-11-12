import type { Currency, Installment, Policy } from '../types'
import type { DocumentForFinancial } from '../api/documents.api'
import { ACTIVE_POLICY_STATUSES, policyTermMonths } from './insuranceDashboardCalc'
import { getDocumentEconomicDirection } from './documentEconomicEffect'
import { adjustmentInstallmentIssue } from './adjustmentInstallments'

// ═══════════════════════════════════════════════════════════════════════════
// Proyección de renovaciones — base USD
//
// La proyección futura se calcula SIEMPRE en USD, a partir del cierre
// histórico (totalAmountUsd / amountUsd) que cada documento/cuota guardó al
// crearse o pagarse — nunca reconstruyendo importes históricos con el TC
// actual. Lo real se muestra con el cierre histórico de la moneda elegida;
// lo proyectado en ARS es USD × el TC que el usuario ingresa a mano en la
// pantalla (nunca el TC del sistema ni uno histórico; sin TC válido: "Sin TC").
// Cuando un cierre no es confiable (TC 1 por default de datos viejos, 0 o
// nulo) el importe NO se convierte: se deja en su moneda nativa y todo total
// que lo excluya queda marcado como incompleto.
// ═══════════════════════════════════════════════════════════════════════════

// ── Fechas razonables ───────────────────────────────────────────────────────
// MonthKeys con año mayor a este límite se ignoran al calcular first/last
// real y se excluyen del rango del calendario.  Protege contra datos viejos
// con fechas absurdas (ej. 2206-10-17) sin bloquear historial válido.
const MAX_REASONABLE_YEAR = new Date().getFullYear() + 10

export function isReasonableMonthKey(key: string): boolean {
  const year = Number(key.slice(0, 4))
  return year >= 1900 && year <= MAX_REASONABLE_YEAR
}

// Límite de seguridad para buildMonthRange — evita crear arrays enormes si
// accidentalmente se genera un rango de siglos. 600 meses = 50 años, cubre
// historial largo sin riesgo de performance.
const MAX_MONTH_RANGE = 600

// Límite para el número de ciclos en projectAssetRow — previene overflow
// de Math.pow() que produciría Infinity.
const MAX_CYCLE_NUMBER = 100

// ── Claves de mes ('YYYY-MM') ────────────────────────────────────────────────
// Comparan y ordenan como strings sin conversión — el formato ya es lexicográfico.

export function monthKeyOf(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function addMonthsToKey(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function nextMonthKey(key: string): string {
  return addMonthsToKey(key, 1)
}

export function monthsBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm] = fromKey.split('-').map(Number)
  const [ty, tm] = toKey.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

export function todayMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function buildMonthRange(startKey: string, endKey: string): string[] {
  const out: string[] = []
  let cur = startKey
  while (cur <= endKey) {
    out.push(cur)
    if (out.length >= MAX_MONTH_RANGE) break
    cur = nextMonthKey(cur)
  }
  return out
}

// ── Cierres históricos y su confiabilidad ───────────────────────────────────

export const CURRENCIES: readonly Currency[] = ['ARS', 'USD']

// 1 es el default de columna (`exchangeRate @default(1)`) que quedó en los
// documentos anteriores a la feature de TC (y que su backfill heredó a las
// cuotas): no es una cotización. Mismo piso que el backend
// (shared/utils/currency.ts#MIN_PLAUSIBLE_ARS_PER_USD).
export const MIN_PLAUSIBLE_ARS_PER_USD = 1

/** Importe en su moneda nativa + su cierre guardado en ambas monedas (documento o cuota). */
export interface DualClosure {
  currency: Currency
  amount: number
  amountArs: number | null
  amountUsd: number | null
}

/**
 * El cierre histórico de `c` en la moneda `target`, o `null` si no se puede
 * expresar en esa moneda con confianza. La moneda nativa siempre es confiable;
 * la otra solo si su cierre existe, es finito, no es 0 para un importe ≠ 0 y
 * el TC implícito (|ARS| / |USD|) es mayor que el piso de plausibilidad. Así
 * se detecta el TC 1 por default también en cuotas, que no guardan TC propio.
 */
export function closureIn(c: DualClosure, target: Currency): number | null {
  if (target === c.currency) {
    const stored = target === 'ARS' ? c.amountArs : c.amountUsd
    return stored != null && Number.isFinite(stored) ? stored : c.amount
  }
  const { amountArs: ars, amountUsd: usd } = c
  if (ars == null || usd == null || !Number.isFinite(ars) || !Number.isFinite(usd)) return null
  if (c.amount === 0 && ars === 0 && usd === 0) return 0
  if (ars === 0 || usd === 0) return null
  if (!(Math.abs(ars) / Math.abs(usd) > MIN_PLAUSIBLE_ARS_PER_USD)) return null
  return target === 'ARS' ? ars : usd
}

function docClosure(doc: DocumentForFinancial): DualClosure {
  return { currency: doc.currency, amount: doc.totalAmount, amountArs: doc.totalAmountArs, amountUsd: doc.totalAmountUsd }
}

function installmentClosure(inst: Installment): DualClosure {
  return { currency: inst.currency, amount: inst.amount, amountArs: inst.amountArs, amountUsd: inst.amountUsd }
}

/**
 * Una porción (en moneda nativa) de un documento, re-expresada en `target`
 * con la misma fracción sobre su total ya cerrado en esa moneda — misma
 * fórmula que economicAnalysisCalc.ts#allocationInCurrency, pero devolviendo
 * `null` (en vez de 0) cuando el cierre no es confiable.
 */
export function docPortionIn(doc: DocumentForFinancial, nativePortion: number, target: Currency): number | null {
  if (!doc.totalAmount) return 0
  const total = closureIn(docClosure(doc), target)
  if (total === null) return null
  return (nativePortion / doc.totalAmount) * total
}

interface CompositionRatios {
  net: number
  vat: number
  other: number
}

// Neto/IVA/Otros como fracción del total del documento — no depende de la
// moneda, así el desglose de cualquier celda siempre suma su total.
function docComposition(doc: DocumentForFinancial): CompositionRatios {
  const total = doc.netAmount + doc.vatAmount + doc.otherTaxesAmount
  if (!total) return { net: 1, vat: 0, other: 0 }
  return { net: doc.netAmount / total, vat: doc.vatAmount / total, other: doc.otherTaxesAmount / total }
}

// ── Línea de tiempo real por activo ──────────────────────────────────────────
// Dos criterios legítimamente distintos, uno por página — nunca se mezclan:
// - "ByCuota" (Financiero): agrupa por dueDate de cada cuota, con pagado/pendiente.
// - "ByDocument" (Económico): agrupa por issueDate del documento completo, sin
//   estado de cobro (un documento emitido ya está "reconocido").
// Cada celda se arma UNA vez con las dos monedas (cada una con su cierre
// histórico), así cambiar el selector no recalcula nada.

export interface MoneyBreakdown {
  total: number
  net: number
  vat: number
  other: number
}

/** Importes reales que no se pudieron convertir, acumulados en su moneda nativa. */
export interface NativeAmounts {
  ARS: number
  USD: number
}

export interface RealCurrencyCell extends MoneyBreakdown {
  paid: number
  pending: number
  /** Cuántos aportes (cuotas/documentos) no se pudieron expresar en esta moneda. */
  excludedCount: number
  excludedNative: NativeAmounts
}

export interface RealMonthCell {
  monthKey: string
  /** Solo la variante por cuota tiene estado de cobro (pagado/pendiente). */
  hasPaymentStatus: boolean
  byCurrency: Record<Currency, RealCurrencyCell>
}

export function emptyNativeAmounts(): NativeAmounts {
  return { ARS: 0, USD: 0 }
}

function emptyRealCurrencyCell(): RealCurrencyCell {
  return { total: 0, net: 0, vat: 0, other: 0, paid: 0, pending: 0, excludedCount: 0, excludedNative: emptyNativeAmounts() }
}

function emptyRealMonthCell(monthKey: string, hasPaymentStatus: boolean): RealMonthCell {
  return { monthKey, hasPaymentStatus, byCurrency: { ARS: emptyRealCurrencyCell(), USD: emptyRealCurrencyCell() } }
}

function addRealContribution(
  cell: RealCurrencyCell,
  amount: number | null,
  native: { amount: number; currency: Currency },
  ratios: CompositionRatios,
  paid: boolean | null,
) {
  if (amount === null) {
    cell.excludedCount += 1
    cell.excludedNative[native.currency] += native.amount
    return
  }
  cell.total += amount
  cell.net += amount * ratios.net
  cell.vat += amount * ratios.vat
  cell.other += amount * ratios.other
  if (paid === true) cell.paid += amount
  else if (paid === false) cell.pending += amount
}

// ── Variante por cuota (Financiero) ──────────────────────────────────────────
// Mismo criterio que "Matriz de cuotas" en FinancialAnalysisPage.tsx: se
// agrupa por dueDate, esté pagada o no, con el cierre de cada cuota (las
// pagadas tienen el TC del día de pago). Un documento sin cuotas propias
// (NC/ND/Endoso sin installments) no aporta acá — una NC aplicada ya está
// reflejada en las cuotas de la factura que ajustó.

function docAssetShareByPercentage(doc: DocumentForFinancial, assetId: string): number {
  const pct = doc.allocations
    .filter((a) => a.assetId === assetId)
    .reduce((sum, a) => sum + a.allocationPercentage, 0)
  return pct / 100
}

export function buildAssetRealTimelineByCuota(assetId: string, documents: DocumentForFinancial[]): Map<string, RealMonthCell> {
  const acc = new Map<string, RealMonthCell>()

  for (const doc of documents) {
    if (doc.installments.length === 0) continue
    // Cuotas propias de un ajuste ya volcado en su factura: contarlas lo duplicaría (ver adjustmentInstallments).
    if (adjustmentInstallmentIssue(doc)?.excluded) continue
    const assetShare = docAssetShareByPercentage(doc, assetId)
    if (assetShare <= 0) continue
    const ratios = docComposition(doc)

    for (const inst of doc.installments) {
      const monthKey = monthKeyOf(inst.dueDate)
      const cell = acc.get(monthKey) ?? emptyRealMonthCell(monthKey, true)
      const closure = installmentClosure(inst)
      for (const currency of CURRENCIES) {
        const value = closureIn(closure, currency)
        addRealContribution(
          cell.byCurrency[currency],
          value === null ? null : value * assetShare,
          { amount: inst.amount * assetShare, currency: inst.currency },
          ratios,
          inst.paymentStatus === 'PAID',
        )
      }
      acc.set(monthKey, cell)
    }
  }

  return acc
}

/** Ajuste aplicado cuyas cuotas propias se excluyen del real por cuota (ya están en su factura). */
export interface ExcludedAdjustmentItem {
  documentNumber: string
  documentType: string
  /** 'YYYY-MM-DD' — emisión del ajuste. */
  issueDate: string
  /** Vencimientos de las cuotas propias excluidas ('YYYY-MM-DD'). */
  dueDates: string[]
  /** Σ de las cuotas propias del documento, en su moneda nativa (no se suma a nada). */
  ownInstallmentsAmount: number
  currency: Currency
}

// Solo informa — mismo criterio exacto que el `continue` de
// buildAssetRealTimelineByCuota (ajuste ya volcado + asignado al activo), así
// lo que se lista es justo lo que el cálculo dejó afuera. No cambia importes.
export function excludedAdjustmentsForAsset(assetId: string, documents: DocumentForFinancial[]): ExcludedAdjustmentItem[] {
  const items: ExcludedAdjustmentItem[] = []
  for (const doc of documents) {
    if (doc.installments.length === 0) continue
    const issue = adjustmentInstallmentIssue(doc)
    if (!issue?.excluded) continue
    if (docAssetShareByPercentage(doc, assetId) <= 0) continue
    items.push({
      documentNumber: doc.documentNumber,
      documentType: doc.documentType,
      issueDate: doc.issueDate.slice(0, 10),
      dueDates: doc.installments.map((i) => i.dueDate.slice(0, 10)).sort(),
      ownInstallmentsAmount: issue.ownInstallmentsAmount,
      currency: doc.currency,
    })
  }
  return items
}

// ── Variante por documento (Económico) ───────────────────────────────────────
// Replica allocationInCurrency/buildEconomicMatrix de EconomicAnalysisPage.tsx:
// cualquier tipo de documento (factura, NC, ND, endoso) que tenga una
// asignación al activo, agrupado por issueDate, usando `allocatedAmount`
// prorrateado sobre `doc.totalAmount` (no allocationPercentage) — así una NC
// con allocatedAmount negativo compensa correctamente a la factura que
// ajusta, igual que en Económico. Sin pagado/pendiente: un documento emitido
// ya está reconocido, sin importar si se cobró. El SIGNO sale del documento
// (getDocumentEconomicDirection, misma regla que el KPI de Análisis
// Económico): cada asignación aporta |asignado| × sentido — una NC aplicada
// resta aunque su distribución se haya cargado en positivo, y una NC sin
// aplicar no impacta.

function docAllocatedAmountForAsset(doc: DocumentForFinancial, assetId: string): number {
  return doc.allocations.filter((a) => a.assetId === assetId).reduce((sum, a) => sum + a.allocatedAmount, 0)
}

export function buildAssetRealTimelineByDocument(assetId: string, documents: DocumentForFinancial[]): Map<string, RealMonthCell> {
  const acc = new Map<string, RealMonthCell>()

  for (const doc of documents) {
    const direction = getDocumentEconomicDirection(doc)
    const allocatedAmount = doc.allocations
      .filter((a) => a.assetId === assetId)
      .reduce((sum, a) => sum + Math.abs(a.allocatedAmount), 0) * direction
    if (!doc.totalAmount || allocatedAmount === 0) continue
    const ratios = docComposition(doc)

    const monthKey = monthKeyOf(doc.issueDate)
    const cell = acc.get(monthKey) ?? emptyRealMonthCell(monthKey, false)
    for (const currency of CURRENCIES) {
      addRealContribution(
        cell.byCurrency[currency],
        docPortionIn(doc, allocatedAmount, currency),
        { amount: allocatedAmount, currency: doc.currency },
        ratios,
        null,
      )
    }
    acc.set(monthKey, cell)
  }

  return acc
}

// ── Renovaciones = PERÍODOS de cobertura (no facturas sueltas) ──────────────
// Una renovación es un período contractual de una póliza, no una factura:
// un mismo período puede tener varias facturas (complementarias, divididas o
// consolidadas de flota) y todas forman UNA renovación. NC/ND/endosos nunca
// son renovaciones (siguen siendo ajustes, con su tratamiento de siempre).
//
// Identificación del período de cada factura de renovación (INVOICE):
// - Por la póliza de cada asignación al activo (allocation → línea → póliza).
//   Una factura consolidada aporta a cada activo solo lo que le asignó, en la
//   póliza de esa asignación — nunca se duplica entre activos ni pólizas.
// - Dentro de una póliza, por ventana de vigencia (ventana 0 = la vigencia
//   contractual de la póliza; ±1, ±2… = las anteriores/siguientes del mismo
//   largo): las fechas de una póliza pueden editarse, así que no se asume que
//   policyId alcanza para un único período. Ver assignRenewalWindow: manda la
//   relación con la póliza (la ventana donde se emitió, o la contractual), y
//   las cuotas solo desempatan entre candidatas razonables (anticipada /
//   complementaria / posterior). Si no alcanza para decidir, la factura queda
//   en la ventana más cercana a la contractual y se informa como ambigua —
//   nunca se abre un período nuevo "por las dudas".
// - Ciclo = duración contractual de la póliza (1, 3, 6, 12… meses, sin forzar
//   12). Solo sin póliza conocida se usa el plazo de la póliza vigente del
//   activo o, en último caso, 12.
// La base es la del ÚLTIMO período (el de inicio más reciente) más los
// períodos de OTRAS pólizas concurrentes con el mismo plazo que se superponen
// con él al menos media vigencia (coberturas paralelas del mismo activo).
// Un período concurrente con OTRO plazo no puede proyectarse en el mismo ciclo:
// se excluye y se informa (concurrentPeriodsExcluded), sin ocultarlo.

export type RenewalBaseStatus = 'OK' | 'NO_HISTORY' | 'UNRELIABLE_FX'

/** Comprobante puntual detrás de un aviso (trazabilidad en tabla, avisos y Excel). */
export interface RenewalTraceItem {
  documentNumber: string
  /** 'YYYY-MM-DD' — vencimiento (cuota), emisión (Económico) o emisión de la factura ambigua. */
  date: string
  kind: 'cuota' | 'emisión' | 'factura'
}

export interface RenewalCycle {
  cycleLengthMonths: number
  /**
   * Posición dentro del ciclo (0..ciclo-1) → fracción de la renovación, con
   * los meses fuera del ciclo plegados. Solo resume el reparto (cantidad de
   * cuotas de la fila); la proyección usa offsetShare.
   */
  originalShare: Record<number, number>
  /**
   * Meses desde el inicio del período (puede ser < 0 o ≥ ciclo: cuotas
   * anticipadas o posteriores a la vigencia) → fracción. Siempre suma 1. Cada
   * renovación futura repite estas fechas tal como están registradas.
   */
  offsetShare: Record<number, number>
  /** Mes de inicio del último período de cobertura (ancla de la proyección). */
  lastRenewalStartMonthKey: string
  /**
   * Mes de inicio del último período REAL (null sin historial). Ningún período
   * que empiece en ese mes o antes se vuelve a proyectar: ya tiene su
   * renovación registrada (aunque el inicio se edite a mano).
   */
  realLastRenewalStartMonthKey: string | null
  /**
   * 'UNRELIABLE_FX': alguna factura del último período no tiene un cierre USD
   * confiable — la base queda en null y la fila no se proyecta hasta que se
   * cargue una base USD a mano. Nunca se reemplaza por un período anterior.
   */
  baseStatus: RenewalBaseStatus
  defaultNetUsd: number | null
  defaultVatUsd: number | null
  defaultOtherUsd: number | null
  /** Facturas que forman el último período (para auditoría/avisos). */
  periodInvoiceCount: number
  /** Cuotas (Financiero) o emisiones (Económico) del último período fuera de su vigencia (= outOfTermItems.length). */
  outOfTermCount: number
  /** Cuáles: comprobante + fecha. Las renovaciones proyectadas repiten esas fechas tal cual. */
  outOfTermItems: RenewalTraceItem[]
  /** Facturas del último período cuyo período no se pudo determinar sin ambigüedad (se informan, no se inventa uno nuevo). */
  ambiguousPeriodItems: RenewalTraceItem[]
  /** Períodos concurrentes con otro plazo que no pudieron sumarse a la base. */
  concurrentPeriodsExcluded: number
}

interface RenewalInvoicePart {
  doc: DocumentForFinancial
  /** Porción de la factura que corresponde al activo en esta póliza (Financiero: % de asignación; Económico: allocated/total). */
  assetShare: number
  /** El período de la factura no se pudo determinar sin ambigüedad. */
  ambiguous: boolean
}

interface RenewalPeriod {
  policyId: string | null
  startDate: string
  endDate: string
  termMonths: number
  termDays: number
  parts: RenewalInvoicePart[]
}

const DAY_MS = 86_400_000

function dayNumber(dateStr: string): number {
  return Math.round(Date.UTC(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10))) / DAY_MS)
}

function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

function fallbackCycleLengthFor(assetId: string, policies: Policy[]): number {
  const activeCoveragePolicy = policies.find(
    (p) => ACTIVE_POLICY_STATUSES.includes(p.status) && (p.coverages ?? []).some((c) => c.assetId === assetId),
  )
  return activeCoveragePolicy ? policyTermMonths(activeCoveragePolicy.startDate, activeCoveragePolicy.endDate) : 12
}

function noHistoryCycle(cycleLengthMonths: number, nowMonthKey: string): RenewalCycle {
  return {
    cycleLengthMonths,
    originalShare: { 0: 1 },
    offsetShare: { 0: 1 },
    lastRenewalStartMonthKey: nowMonthKey,
    realLastRenewalStartMonthKey: null,
    baseStatus: 'NO_HISTORY',
    defaultNetUsd: 0,
    defaultVatUsd: 0,
    defaultOtherUsd: 0,
    periodInvoiceCount: 0,
    outOfTermCount: 0,
    outOfTermItems: [],
    ambiguousPeriodItems: [],
    concurrentPeriodsExcluded: 0,
  }
}

/**
 * Ventana de vigencia (dentro de una póliza) a la que corresponde una factura.
 * Ventana 0 = vigencia contractual; w = [inicio + w·vigencia, inicio + (w+1)·vigencia).
 *
 * 1. Candidatas por la relación póliza/período (fecha de emisión):
 *    - la ventana donde se emitió;
 *    - emitida antes del inicio contractual (hasta una vigencia antes): también
 *      la contractual (facturación anticipada);
 *    - emitida en el último ¼ de su ventana: también la siguiente (anticipo de
 *      la próxima vigencia o complementaria tardía de la actual);
 *    - emitida en el primer ¼ de una ventana posterior a la contractual:
 *      también la anterior (facturación posterior al vencimiento).
 * 2. Desempate con las cuotas: si más de la mitad del importe de sus cuotas
 *    vence en UNA de las candidatas, es esa. Las cuotas nunca llevan la factura
 *    a una ventana que no sea candidata (un vencimiento no siempre pertenece al
 *    período contractual: plazos de pago, fechas mal cargadas).
 * 3. Sin desempate posible con más de una candidata: ambigua — se resuelve en
 *    buildRenewalPeriods con las demás facturas de la póliza (ver
 *    resolveAmbiguousWindow) y SIEMPRE se informa.
 */
type WindowAssignment = { window: number; ambiguous: false } | { window: number; ambiguous: true; candidates: number[] }

function assignRenewalWindow(doc: DocumentForFinancial, pStartDay: number, termDays: number): WindowAssignment {
  const issue = dayNumber(doc.issueDate)
  const windowOf = (day: number) => Math.floor((day - pStartDay) / termDays)
  const own = windowOf(issue)
  const quarter = termDays / 4
  const candidates = new Set<number>([own])
  if (own < 0 && issue >= pStartDay - termDays) candidates.add(0)
  if (issue >= pStartDay + (own + 1) * termDays - quarter) candidates.add(own + 1)
  if (own > 0 && issue < pStartDay + own * termDays + quarter) candidates.add(own - 1)

  if (candidates.size > 1 || doc.installments.length > 0) {
    const weight = new Map<number, number>()
    let total = 0
    for (const inst of doc.installments) {
      const w = Math.abs(inst.amount)
      if (!Number.isFinite(w) || w === 0) continue
      const k = windowOf(dayNumber(inst.dueDate))
      weight.set(k, (weight.get(k) ?? 0) + w)
      total += w
    }
    for (const [k, w] of weight) {
      if (w > total / 2 && candidates.has(k)) return { window: k, ambiguous: false }
    }
  }

  if (candidates.size === 1) return { window: own, ambiguous: false }
  return { window: own, ambiguous: true, candidates: [...candidates].sort((a, b) => a - b) }
}

/**
 * Factura ambigua (más de una vigencia posible y las cuotas no desempatan):
 * 1. si exactamente una candidata ya tiene facturas inequívocas de la misma
 *    póliza, esa (no se abre un período que nada más respalda);
 * 2. si se emitió antes de la vigencia contractual, la contractual
 *    (facturación anticipada);
 * 3. si no, la vigencia en la que se emitió.
 */
function resolveAmbiguousWindow(own: number, candidates: number[], occupied: Set<number> | undefined): number {
  const supported = candidates.filter((k) => occupied?.has(k))
  if (supported.length === 1) return supported[0]
  if (own < 0 && candidates.includes(0)) return 0
  return own
}

/**
 * Agrupa las facturas de renovación del activo en períodos de cobertura.
 * `shareByPolicy(doc)` devuelve la porción del activo por póliza (una factura
 * puede asignar al mismo activo en más de una póliza).
 */
function buildRenewalPeriods(
  renewalDocs: DocumentForFinancial[],
  shareByPolicy: (doc: DocumentForFinancial) => Map<string | null, number>,
  policies: Policy[],
  fallbackTermMonths: number,
): RenewalPeriod[] {
  const policyById = new Map(policies.map((p) => [p.id, p]))
  const periods = new Map<string, RenewalPeriod>()

  // 1ª pasada: ventana de cada (factura, póliza); las inequívocas marcan qué
  // vigencias de cada póliza están respaldadas por facturas.
  const pending: { doc: DocumentForFinancial; policyId: string | null; assetShare: number; assignment: WindowAssignment | null }[] = []
  const occupiedByPolicy = new Map<string, Set<number>>()
  for (const doc of renewalDocs) {
    for (const [policyId, assetShare] of shareByPolicy(doc)) {
      if (assetShare === 0) continue
      const policy = policyId ? policyById.get(policyId) : undefined
      const pStart = policy?.startDate?.slice(0, 10)
      const pEnd = policy?.endDate?.slice(0, 10)
      const assignment = policy && pStart && pEnd && dayNumber(pEnd) > dayNumber(pStart)
        ? assignRenewalWindow(doc, dayNumber(pStart), dayNumber(pEnd) - dayNumber(pStart))
        : null
      if (policy && assignment && !assignment.ambiguous) {
        const set = occupiedByPolicy.get(policy.id) ?? new Set<number>()
        set.add(assignment.window)
        occupiedByPolicy.set(policy.id, set)
      }
      pending.push({ doc, policyId, assetShare, assignment })
    }
  }

  // 2ª pasada: arma los períodos (resolviendo las ambiguas con lo anterior).
  for (const { doc, policyId, assetShare, assignment } of pending) {
    {
      const policy = policyId ? policyById.get(policyId) : undefined
      const pStart = policy?.startDate?.slice(0, 10)
      const pEnd = policy?.endDate?.slice(0, 10)
      let key: string
      let period: Omit<RenewalPeriod, 'parts'>
      const ambiguous = assignment?.ambiguous ?? false
      if (policy && pStart && pEnd && assignment) {
        const termDays = dayNumber(pEnd) - dayNumber(pStart)
        const k = assignment.ambiguous
          ? resolveAmbiguousWindow(assignment.window, assignment.candidates, occupiedByPolicy.get(policy.id))
          : assignment.window
        const startDay = dayNumber(pStart) + k * termDays
        key = `${policy.id}#${k}`
        period = {
          policyId: policy.id,
          startDate: dateOfDay(startDay),
          endDate: dateOfDay(startDay + termDays),
          termMonths: policyTermMonths(pStart, pEnd),
          termDays,
        }
      } else {
        // Sin póliza conocida (o sin fechas válidas): la factura es su propio período.
        const termDays = Math.round(fallbackTermMonths * 30.4375)
        key = `doc:${doc.id}:${policyId ?? '-'}`
        period = {
          policyId: policyId ?? null,
          startDate: doc.issueDate.slice(0, 10),
          endDate: dateOfDay(dayNumber(doc.issueDate) + termDays),
          termMonths: fallbackTermMonths,
          termDays,
        }
      }
      const existing = periods.get(key) ?? { ...period, parts: [] }
      existing.parts.push({ doc, assetShare, ambiguous })
      periods.set(key, existing)
    }
  }
  return [...periods.values()]
}

function overlapDays(a: RenewalPeriod, b: RenewalPeriod): number {
  return Math.min(dayNumber(a.endDate), dayNumber(b.endDate)) - Math.max(dayNumber(a.startDate), dayNumber(b.startDate))
}

/** Último período + concurrentes del mismo plazo (ver comentario de la sección). */
function selectLastRenewal(periods: RenewalPeriod[]): { last: RenewalPeriod; group: RenewalPeriod[]; excluded: number } {
  const sorted = periods.slice().sort((a, b) => a.startDate.localeCompare(b.startDate) || a.termDays - b.termDays)
  const last = sorted[sorted.length - 1]
  const group = [last]
  let excluded = 0
  for (const p of sorted) {
    if (p === last || p.policyId === last.policyId) continue
    if (overlapDays(p, last) < Math.min(p.termDays, last.termDays) / 2) continue
    if (p.termMonths === last.termMonths) group.push(p)
    else excluded += 1
  }
  return { last, group, excluded }
}

// Neto/IVA/Otros del período = suma de cada factura × porción del activo, en
// USD con el cierre histórico de CADA factura. Una sola factura sin cierre
// confiable deja toda la base en null (no se proyecta una base parcial).
function usdBaseOfPeriod(group: RenewalPeriod[]): Pick<RenewalCycle, 'baseStatus' | 'defaultNetUsd' | 'defaultVatUsd' | 'defaultOtherUsd'> {
  let net = 0
  let vat = 0
  let other = 0
  for (const { parts } of group) {
    for (const { doc, assetShare } of parts) {
      const n = docPortionIn(doc, doc.netAmount * assetShare, 'USD')
      const v = docPortionIn(doc, doc.vatAmount * assetShare, 'USD')
      const o = docPortionIn(doc, doc.otherTaxesAmount * assetShare, 'USD')
      if (n === null || v === null || o === null) {
        return { baseStatus: 'UNRELIABLE_FX', defaultNetUsd: null, defaultVatUsd: null, defaultOtherUsd: null }
      }
      net += n
      vat += v
      other += o
    }
  }
  return { baseStatus: 'OK', defaultNetUsd: net, defaultVatUsd: vat, defaultOtherUsd: other }
}

// Peso de cada factura dentro del período para repartir la renovación entre
// meses: su porción en USD si todas tienen cierre USD confiable; si no, en
// ARS; si no, en moneda nativa (solo si todas comparten moneda); si no, igual.
function partWeights(parts: RenewalInvoicePart[]): number[] {
  for (const currency of ['USD', 'ARS'] as Currency[]) {
    const values = parts.map(({ doc, assetShare }) => docPortionIn(doc, doc.totalAmount * assetShare, currency))
    if (values.every((v) => v !== null)) return values as number[]
  }
  if (new Set(parts.map((p) => p.doc.currency)).size === 1) return parts.map(({ doc, assetShare }) => doc.totalAmount * assetShare)
  return parts.map(() => 1)
}

type RenewalEvent = { date: string; fraction: number; kind: RenewalTraceItem['kind'] }

/**
 * Reparto de la renovación en el tiempo, anclado al inicio del último período.
 * `events(doc)` da, por factura, los meses en que impacta (vencimiento de cada
 * cuota, o la emisión) y su fracción dentro de la factura. offsetShare guarda
 * cada fracción en su mes real relativo al inicio — también los anteriores o
 * posteriores a la vigencia — para que cada renovación futura las repita en
 * su lugar (sin plegarlas al ciclo, sin perderlas ni duplicarlas). Lo que cae
 * fuera de la vigencia del período se lista en outOfTermItems.
 */
function distributeOverCycle(
  group: RenewalPeriod[],
  anchorMonthKey: string,
  cycleLengthMonths: number,
  events: (doc: DocumentForFinancial) => RenewalEvent[],
): { originalShare: Record<number, number>; offsetShare: Record<number, number>; outOfTermItems: RenewalTraceItem[] } {
  const entries = group.flatMap((period) => period.parts.map((part) => ({ part, period })))
  const weights = partWeights(entries.map((e) => e.part))
  const totalWeight = weights.reduce((a, b) => a + b, 0)
  const raw: Record<number, number> = {}
  const outOfTermItems: RenewalTraceItem[] = []

  entries.forEach(({ part, period }, idx) => {
    const partShare = totalWeight !== 0 ? weights[idx] / totalWeight : 1 / entries.length
    for (const { date, fraction, kind } of events(part.doc)) {
      const day = dayNumber(date)
      if (day < dayNumber(period.startDate) || day > dayNumber(period.endDate)) {
        outOfTermItems.push({ documentNumber: part.doc.documentNumber, date: date.slice(0, 10), kind })
      }
      const offset = monthsBetweenKeys(anchorMonthKey, monthKeyOf(date))
      raw[offset] = (raw[offset] ?? 0) + partShare * fraction
    }
  })

  // Normaliza para que la renovación sume exactamente 1 (redondeos / pesos negativos de ajustes).
  const sum = Object.values(raw).reduce((a, b) => a + b, 0)
  const offsetShare: Record<number, number> = {}
  if (sum > 0) for (const [k, v] of Object.entries(raw)) offsetShare[Number(k)] = v / sum
  else offsetShare[0] = 1
  return { originalShare: foldShares(offsetShare, cycleLengthMonths), offsetShare, outOfTermItems }
}

/** Resumen por posición del ciclo (0..ciclo-1) de un reparto por mes — solo para contar cuotas. */
function foldShares(offsetShare: Record<number, number>, cycleLengthMonths: number): Record<number, number> {
  const folded: Record<number, number> = {}
  for (const [k, v] of Object.entries(offsetShare)) {
    const pos = ((Number(k) % cycleLengthMonths) + cycleLengthMonths) % cycleLengthMonths
    folded[pos] = (folded[pos] ?? 0) + v
  }
  return folded
}

function detectRenewalCycle(
  assetId: string,
  documents: DocumentForFinancial[],
  policies: Policy[],
  nowMonthKey: string,
  isRenewalDoc: (doc: DocumentForFinancial) => boolean,
  shareByPolicy: (doc: DocumentForFinancial) => Map<string | null, number>,
  events: (doc: DocumentForFinancial) => RenewalEvent[],
): RenewalCycle {
  const fallbackCycleLength = fallbackCycleLengthFor(assetId, policies)
  const renewalDocs = documents.filter(isRenewalDoc)
  const periods = buildRenewalPeriods(renewalDocs, shareByPolicy, policies, fallbackCycleLength)
  if (periods.length === 0) return noHistoryCycle(fallbackCycleLength, nowMonthKey)

  const { last, group, excluded } = selectLastRenewal(periods)
  const anchorMonthKey = monthKeyOf(last.startDate)
  const cycleLengthMonths = Math.max(1, last.termMonths)
  const { originalShare, offsetShare, outOfTermItems } = distributeOverCycle(group, anchorMonthKey, cycleLengthMonths, events)
  const ambiguous = new Map<string, RenewalTraceItem>()
  for (const { parts } of group) {
    for (const part of parts) {
      if (part.ambiguous) ambiguous.set(part.doc.id, { documentNumber: part.doc.documentNumber, date: part.doc.issueDate.slice(0, 10), kind: 'factura' })
    }
  }

  return {
    cycleLengthMonths,
    originalShare,
    offsetShare,
    lastRenewalStartMonthKey: anchorMonthKey,
    realLastRenewalStartMonthKey: anchorMonthKey,
    ...usdBaseOfPeriod(group),
    periodInvoiceCount: new Set(group.flatMap((p) => p.parts.map((x) => x.doc.id))).size,
    outOfTermCount: outOfTermItems.length,
    outOfTermItems,
    ambiguousPeriodItems: [...ambiguous.values()],
    concurrentPeriodsExcluded: excluded,
  }
}

function sharesByPolicy(doc: DocumentForFinancial, assetId: string, value: (a: DocumentForFinancial['allocations'][number]) => number) {
  const out = new Map<string | null, number>()
  for (const a of doc.allocations) {
    if (a.assetId !== assetId) continue
    out.set(a.policyId ?? null, (out.get(a.policyId ?? null) ?? 0) + value(a))
  }
  return out
}

// Financiero: renovación = factura con cuotas; reparto por vencimiento de cada
// cuota (importe nativo de la cuota dentro de su factura).
export function detectRenewalCycleByCuota(
  assetId: string,
  documents: DocumentForFinancial[],
  policies: Policy[],
  nowMonthKey: string = todayMonthKey(),
): RenewalCycle {
  return detectRenewalCycle(
    assetId,
    documents,
    policies,
    nowMonthKey,
    (d) => d.documentType === 'INVOICE' && d.installments.length > 0 && docAssetShareByPercentage(d, assetId) > 0,
    (d) => sharesByPolicy(d, assetId, (a) => a.allocationPercentage / 100),
    (d) => {
      const sum = d.installments.reduce((s, i) => s + i.amount, 0)
      return d.installments.map((i) => ({ date: i.dueDate, fraction: sum > 0 ? i.amount / sum : 1 / d.installments.length, kind: 'cuota' as const }))
    },
  )
}

// Económico: renovación = factura con asignación al activo; reconocida en el
// mes de EMISIÓN (sin cuotas).
export function detectRenewalCycleByDocument(
  assetId: string,
  documents: DocumentForFinancial[],
  policies: Policy[],
  nowMonthKey: string = todayMonthKey(),
): RenewalCycle {
  return detectRenewalCycle(
    assetId,
    documents,
    policies,
    nowMonthKey,
    (d) => d.documentType === 'INVOICE' && docAllocatedAmountForAsset(d, assetId) > 0,
    (d) => sharesByPolicy(d, assetId, (a) => (d.totalAmount ? a.allocatedAmount / d.totalAmount : 0)),
    (d) => [{ date: d.issueDate, fraction: 1, kind: 'emisión' as const }],
  )
}

// ── Override manual de ciclo/cuotas/inicio (jugar con la proyección) ────────
// "Cada cuántos meses renueva", "cuántas cuotas iguales componen cada
// renovación" (solo tiene sentido en modo cuota) y "en qué mes arranca" son
// editables SOLO acá — nunca tocan Policy/AccountingDocument, y solo afectan
// los meses PROYECTADOS de esa fila (los reales quedan intactos, igual que
// Neto/IVA/%). Tocar ciclo o cuotas reemplaza el reparto real (originalShare,
// posiblemente desparejo — ej. 12.3M/12.3M/108.9K) por uno en partes iguales,
// separadas uniformemente a lo largo del ciclo editado. Tocar el inicio solo
// desplaza la fase (en qué mes cae cada pago), sin tocar el reparto en sí.

export function autoInstallmentsCount(cycle: RenewalCycle): number {
  return Math.max(1, Object.keys(cycle.originalShare).length)
}

export function resolveEffectiveCycle(
  cycle: RenewalCycle,
  cycleLengthOverride: number | null,
  installmentsCountOverride: number | null,
  startMonthOverride: string | null,
): RenewalCycle {
  if (cycleLengthOverride == null && installmentsCountOverride == null && startMonthOverride == null) return cycle

  const cycleLengthMonths = Math.max(1, Math.round(cycleLengthOverride ?? cycle.cycleLengthMonths))
  const lastRenewalStartMonthKey = startMonthOverride ?? cycle.lastRenewalStartMonthKey

  if (cycleLengthOverride == null && installmentsCountOverride == null) {
    // Solo se editó el inicio — el reparto real (posiblemente desparejo) se mantiene tal cual, solo se desplaza la fase.
    return { ...cycle, lastRenewalStartMonthKey }
  }

  const installmentsCount = Math.max(1, Math.round(installmentsCountOverride ?? autoInstallmentsCount(cycle)))
  const originalShare: Record<number, number> = {}
  for (let i = 0; i < installmentsCount; i++) {
    const pos = Math.round((i * cycleLengthMonths) / installmentsCount)
    originalShare[pos] = (originalShare[pos] ?? 0) + 1 / installmentsCount
  }

  // Reparto parejo dentro del ciclo editado: reemplaza también las fechas reales (offsetShare).
  return { ...cycle, cycleLengthMonths, originalShare, offsetShare: { ...originalShare }, lastRenewalStartMonthKey }
}

// ── Overrides: base USD vigente vs. histórico protegido ─────────────────────
// Los importes ARS (net/vat/otherOverride) y el % (growthPercentOverride)
// guardados antes de la base USD son HISTÓRICOS: se muestran, nunca se
// aplican a la proyección USD (ni se reinterpretan como USD, ni se convierten
// solos con el TC actual). Solo pasan a la base si el usuario confirma una
// conversión, que escribe los *Usd y deja los ARS intactos.

export const LEGACY_AMOUNT_FIELDS = ['net', 'vat', 'other'] as const
export type LegacyAmountField = (typeof LEGACY_AMOUNT_FIELDS)[number]

/** Forma mínima de una fila de AssetRenewalProjectionOverride que necesita el cálculo. */
export interface RenewalOverrideValues {
  netOverride: number | null
  vatOverride: number | null
  otherOverride: number | null
  growthPercentOverride: number | null
  netOverrideUsd: number | null
  vatOverrideUsd: number | null
  otherOverrideUsd: number | null
  growthPercentUsdOverride: number | null
  cycleLengthMonthsOverride: number | null
  installmentsCountOverride: number | null
  startMonthOverride: string | null
  legacyConvertedAt: string | null
}

const LEGACY_COLUMNS: Record<LegacyAmountField, { ars: 'netOverride' | 'vatOverride' | 'otherOverride'; usd: 'netOverrideUsd' | 'vatOverrideUsd' | 'otherOverrideUsd' }> = {
  net: { ars: 'netOverride', usd: 'netOverrideUsd' },
  vat: { ars: 'vatOverride', usd: 'vatOverrideUsd' },
  other: { ars: 'otherOverride', usd: 'otherOverrideUsd' },
}

export function legacyColumnsOf(field: LegacyAmountField) {
  return LEGACY_COLUMNS[field]
}

/**
 * Qué importes ARS anteriores se trasladarían a USD si el usuario confirma:
 * los que existen y cuyo par *Usd sigue vacío (un USD ya cargado nunca se
 * pisa). Misma regla que el backend
 * (renewal-projections.service.ts#convertibleLegacyFields).
 */
export function convertibleLegacyFields(o: RenewalOverrideValues | null | undefined): LegacyAmountField[] {
  if (!o || o.legacyConvertedAt != null) return []
  return LEGACY_AMOUNT_FIELDS.filter((f) => o[LEGACY_COLUMNS[f].ars] != null && o[LEGACY_COLUMNS[f].usd] == null)
}

export function hasLegacyValues(o: RenewalOverrideValues | null | undefined): boolean {
  if (!o) return false
  return o.netOverride != null || o.vatOverride != null || o.otherOverride != null || o.growthPercentOverride != null || o.legacyConvertedAt != null
}

/** Configuración vigente que "Volver al automático" limpia (nunca incluye el histórico). */
export function hasCurrentOverrides(o: RenewalOverrideValues | null | undefined): boolean {
  if (!o) return false
  return (
    o.netOverrideUsd != null ||
    o.vatOverrideUsd != null ||
    o.otherOverrideUsd != null ||
    o.growthPercentUsdOverride != null ||
    o.cycleLengthMonthsOverride != null ||
    o.installmentsCountOverride != null ||
    o.startMonthOverride != null
  )
}

export interface ResolvedRowBase {
  /** Base USD efectiva (override USD ?? automático) — null = sin base confiable. */
  netUsd: number | null
  vatUsd: number | null
  otherUsd: number | null
  /** % por ciclo sobre la base USD (default 0 %). */
  pct: number
  /** true si no hay base USD utilizable (cierre no confiable y sin Neto USD manual). */
  projectionBlocked: boolean
}

export function resolveRowBase(cycle: RenewalCycle, override: RenewalOverrideValues | null | undefined): ResolvedRowBase {
  const netUsd = override?.netOverrideUsd ?? cycle.defaultNetUsd
  const vatUsd = override?.vatOverrideUsd ?? cycle.defaultVatUsd
  const otherUsd = override?.otherOverrideUsd ?? cycle.defaultOtherUsd
  return {
    netUsd,
    vatUsd,
    otherUsd,
    pct: override?.growthPercentUsdOverride ?? 0,
    projectionBlocked: netUsd === null,
  }
}

/** Total de la base USD de una fila — null si no hay base (no proyecta). IVA/Otros sin cargar cuentan 0. */
export function baseTotalUsd(base: { netUsd: number | null; vatUsd: number | null; otherUsd: number | null }): number | null {
  if (base.netUsd === null) return null
  return base.netUsd + (base.vatUsd ?? 0) + (base.otherUsd ?? 0)
}

// ── Proyección (USD) por PERÍODO ──────────────────────────────────────────────
// Cada renovación futura es un período completo: empieza en
// ancla + k·ciclo y repite el reparto del último período real en sus meses
// reales (offsetShare), incluidas las cuotas anticipadas o posteriores a la
// vigencia. Los aportes de todos los períodos se suman por mes. Así:
// - una cuota real tardía (o con fecha mal cargada) nunca tapa las
//   renovaciones de los meses anteriores: lo real y lo proyectado conviven en
//   el mismo mes como partes separadas (ver resolveDisplayCell);
// - cada período proyectado aporta exactamente su base (× crecimiento), una
//   sola vez — sin plegar, sin perder ni duplicar importes;
// - un período que empieza en el mes del último período real o antes nunca se
//   proyecta: ya tiene su renovación registrada;
// - no se proyecta nada antes de `fromMonthKey` (el mes actual).
// Crecimiento compuesto por RENOVACIÓN: base × (1 + pct/100)^n, con n = 1 para
// la primera renovación posterior a la última real (n = 0 para la primera de
// un activo sin historial, que arranca en el ancla). Con 0 % la misma base
// USD se repite en cada renovación.

export interface ProjectedMonthCell {
  monthKey: string
  amountUsd: number
}

export function projectAssetRow(
  cycle: RenewalCycle,
  fromMonthKey: string,
  endMonthKey: string,
  netUsd: number,
  vatUsd: number,
  otherUsd: number,
  growthPercent: number,
): ProjectedMonthCell[] {
  const months = buildMonthRange(fromMonthKey, endMonthKey)
  const effectiveTotal = netUsd + vatUsd + otherUsd
  const offsets = Object.entries(cycle.offsetShare)
    .map(([k, share]) => [Number(k), share] as const)
    .filter(([, share]) => Number.isFinite(share) && share !== 0)
  if (months.length === 0 || offsets.length === 0) return months.map((monthKey) => ({ monthKey, amountUsd: 0 }))

  const length = Math.max(1, cycle.cycleLengthMonths)
  const anchor = cycle.lastRenewalStartMonthKey
  const real = cycle.realLastRenewalStartMonthKey
  // Primer período proyectable: el siguiente al último real (o el del ancla, sin historial).
  const firstK = real === null ? 0 : Math.floor(monthsBetweenKeys(anchor, real) / length) + 1
  const exponentOffset = real === null ? 0 : 1
  const minOffset = Math.min(...offsets.map(([o]) => o))
  const maxOffset = Math.max(...offsets.map(([o]) => o))
  const kFrom = Math.max(firstK, Math.ceil((monthsBetweenKeys(anchor, fromMonthKey) - maxOffset) / length))
  const kTo = Math.floor((monthsBetweenKeys(anchor, endMonthKey) - minOffset) / length)

  const byMonth = new Map<string, number>()
  for (let k = kFrom; k <= kTo; k++) {
    const renewalNumber = Math.min(k - firstK + exponentOffset, MAX_CYCLE_NUMBER)
    const periodTotal = effectiveTotal * Math.pow(1 + growthPercent / 100, renewalNumber)
    for (const [offset, share] of offsets) {
      const monthKey = addMonthsToKey(anchor, k * length + offset)
      if (monthKey < fromMonthKey || monthKey > endMonthKey) continue
      byMonth.set(monthKey, (byMonth.get(monthKey) ?? 0) + periodTotal * share)
    }
  }
  return months.map((monthKey) => {
    const raw = byMonth.get(monthKey) ?? 0
    return { monthKey, amountUsd: Number.isFinite(raw) ? raw : 0 }
  })
}

// ── Desglose "Detalle por mes" (celdas proyectadas) ──────────────────────────
// Reparte el total de una celda proyectada con la proporción ACTUAL de la
// fila (la proporción no tiene moneda).

export function splitByCurrentRatio(cellTotal: number, net: number, vat: number, other: number) {
  const base = net + vat + other
  if (base <= 0) return { net: 0, vat: 0, other: 0 }
  return {
    net: cellTotal * (net / base),
    vat: cellTotal * (vat / base),
    other: cellTotal * (other / base),
  }
}

// ── Tipo de cambio del SISTEMA (solo conversión confirmada del legado) ──────
// El TC global configurado ya no se usa para mostrar la proyección: solo lo
// consulta el modal de valores anteriores para la vista previa de
// convert-legacy (que el backend vuelve a resolver y validar por su cuenta).

export type CurrentRateIssue = 'missing' | 'invalid' | 'placeholder'

export function currentRateIssue(data: { rate: number | null; isPlaceholder?: boolean } | null | undefined): CurrentRateIssue | null {
  if (!data || data.rate == null) return 'missing'
  if (!Number.isFinite(data.rate) || !(data.rate > MIN_PLAUSIBLE_ARS_PER_USD)) return 'invalid'
  if (data.isPlaceholder) return 'placeholder'
  return null
}

/** El TC del sistema si es utilizable para la conversión del legado, o null. */
export function usableCurrentRate(data: { rate: number | null; isPlaceholder?: boolean } | null | undefined): number | null {
  return currentRateIssue(data) === null ? (data!.rate as number) : null
}

// ── TC manual de la proyección (ARS por USD) ────────────────────────────────
// Lo ingresa el usuario en la pantalla, arranca siempre vacío y vive solo en
// el estado de la página: no se guarda, no se toma del sistema ni de ningún
// documento, y solo convierte lo PROYECTADO (y la base USD) a ARS. Lo real
// siempre usa su cierre histórico ARS/USD ya registrado.

/** El TC manual si es válido (número finito > 0), o null — vacío, 0, negativo o texto no son válidos. */
export function parseManualRate(raw: string | null | undefined): number | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) && value > 0 ? value : null
}

/** Un importe de la base USD expresado en la moneda de vista — null si en ARS no hay TC de proyección. */
export function usdIn(valueUsd: number | null, currency: Currency, projectionRate: number | null): number | null {
  if (valueUsd === null) return null
  if (currency === 'USD') return valueUsd
  return projectionRate === null ? null : valueUsd * projectionRate
}

// ── Resolución de una celda (mes real o proyectado) ──────────────────────────
// Único punto que decide "qué se ve en este mes" en la moneda elegida — lo
// consume una sola matriz memoizada que comparten la tabla, los KPIs y el
// Excel, para que nunca se desincronicen.

export type MonthCellStatus = 'paid' | 'pending' | 'projected' | 'recognized'

/** Una parte de la celda: lo real o lo proyectado de ese mes (nunca mezclados). */
export interface DisplayCellPart {
  isReal: boolean
  status: MonthCellStatus
  /** Importes en la moneda elegida. null = esta parte no se puede expresar en esa moneda. */
  amounts: MoneyBreakdown | null
  /** Importes reales excluidos por no tener un cierre confiable, en su moneda nativa. */
  excludedNative: NativeAmounts
  /** true si la parte no está completa en la moneda elegida (algo excluido, o proyectada en ARS sin TC). */
  incomplete: boolean
}

/**
 * Un mes de una fila. Puede tener lo real, lo proyectado, o ambos (una cuota
 * real tardía en el mismo mes que una renovación proyectada): las dos partes
 * se muestran, suman y exportan por separado — nunca se fusionan.
 */
export interface DisplayCell {
  real: DisplayCellPart | null
  projected: DisplayCellPart | null
}

/** Las partes presentes de una celda, real primero. */
export function cellParts(cell: DisplayCell | null): DisplayCellPart[] {
  if (!cell) return []
  const parts: DisplayCellPart[] = []
  if (cell.real) parts.push(cell.real)
  if (cell.projected) parts.push(cell.projected)
  return parts
}

export interface RowProjectionInputs {
  realTimeline: Map<string, RealMonthCell>
  projectedByMonth: Map<string, ProjectedMonthCell>
  /** Base USD efectiva — solo se usa la proporción para el desglose proyectado. */
  netUsd: number | null
  vatUsd: number | null
  otherUsd: number | null
}

function otherCurrency(c: Currency): Currency {
  return c === 'ARS' ? 'USD' : 'ARS'
}

function resolveRealPart(real: RealMonthCell | undefined, currency: Currency): DisplayCellPart | null {
  if (!real) return null
  const cell = real.byCurrency[currency]
  const hasExcluded = cell.excludedCount > 0
  if (cell.total <= 0 && !hasExcluded) return null
  // Si nada de la celda se pudo convertir, el estado de cobro sale de la
  // otra moneda (la nativa), que sí tiene los importes.
  const statusSource = cell.total > 0 ? cell : real.byCurrency[otherCurrency(currency)]
  const status: MonthCellStatus = !real.hasPaymentStatus ? 'recognized' : statusSource.pending > 0 ? 'pending' : 'paid'
  return {
    isReal: true,
    status,
    amounts: cell.total > 0 ? { total: cell.total, net: cell.net, vat: cell.vat, other: cell.other } : null,
    excludedNative: { ...cell.excludedNative },
    incomplete: hasExcluded,
  }
}

function resolveProjectedPart(row: RowProjectionInputs, monthKey: string, currency: Currency, projectionRate: number | null): DisplayCellPart | null {
  const projected = row.projectedByMonth.get(monthKey)
  if (!projected || !Number.isFinite(projected.amountUsd) || projected.amountUsd <= 0) return null
  const total = usdIn(projected.amountUsd, currency, projectionRate)
  const split = total === null ? null : splitByCurrentRatio(total, row.netUsd ?? 0, row.vatUsd ?? 0, row.otherUsd ?? 0)
  return {
    isReal: false,
    status: 'projected',
    amounts: total === null || split === null ? null : { total, ...split },
    excludedNative: emptyNativeAmounts(),
    incomplete: total === null,
  }
}

export function resolveDisplayCell(
  row: RowProjectionInputs,
  monthKey: string,
  currency: Currency,
  projectionRate: number | null,
): DisplayCell | null {
  const real = resolveRealPart(row.realTimeline.get(monthKey), currency)
  const projected = resolveProjectedPart(row, monthKey, currency, projectionRate)
  return real || projected ? { real, projected } : null
}

export function buildDisplayMatrix(
  rows: RowProjectionInputs[],
  axis: string[],
  currency: Currency,
  projectionRate: number | null,
): (DisplayCell | null)[][] {
  return rows.map((row) => axis.map((monthKey) => resolveDisplayCell(row, monthKey, currency, projectionRate)))
}

// ── Totales (fila, KPI, Excel) ───────────────────────────────────────────────
// Un total solo es completo si TODAS sus celdas lo son — si alguna excluyó
// importes no convertibles (o es proyectada en ARS sin TC), el total queda
// `incomplete` y lleva el importe nativo excluido, para no presentarlo nunca
// como completo.

export interface DisplayTotals extends MoneyBreakdown {
  paid: number
  pending: number
  recognized: number
  projected: number
  excludedNative: NativeAmounts
  incomplete: boolean
  /** Cantidad de partes (real/proyectada) no vacías sumadas. */
  cellCount: number
}

export type DisplayPartKind = 'real' | 'projected'

/**
 * Suma las partes de las celdas. Sin `kind`: real + proyectado (cada uno en
 * su propio campo: paid/pending/recognized vs projected). Con `kind`: solo
 * esa parte — así el KPI, el total proyectado y las filas Real/Proyectado del
 * Excel salen de la misma matriz sin mezclarse.
 */
export function sumDisplayCells(cells: Iterable<DisplayCell | null>, kind?: DisplayPartKind): DisplayTotals {
  const t: DisplayTotals = {
    total: 0, net: 0, vat: 0, other: 0,
    paid: 0, pending: 0, recognized: 0, projected: 0,
    excludedNative: emptyNativeAmounts(),
    incomplete: false,
    cellCount: 0,
  }
  for (const cell of cells) {
    if (!cell) continue
    const parts = kind === undefined ? cellParts(cell) : [cell[kind]].filter((p): p is DisplayCellPart => p !== null)
    for (const part of parts) {
      t.cellCount += 1
      t.excludedNative.ARS += part.excludedNative.ARS
      t.excludedNative.USD += part.excludedNative.USD
      if (part.incomplete) t.incomplete = true
      if (!part.amounts) continue
      const { total } = part.amounts
      if (part.status === 'paid') t.paid += total
      else if (part.status === 'pending') t.pending += total
      else if (part.status === 'recognized') t.recognized += total
      else t.projected += total
      t.total += total
      t.net += part.amounts.net
      t.vat += part.amounts.vat
      t.other += part.amounts.other
    }
  }
  return t
}

/** Totales de una fila: todo junto (cada estado en su campo) y cada parte por separado. */
export interface RowTotals {
  all: DisplayTotals
  real: DisplayTotals
  projected: DisplayTotals
}

export function sumRowTotals(cells: (DisplayCell | null)[]): RowTotals {
  return { all: sumDisplayCells(cells), real: sumDisplayCells(cells, 'real'), projected: sumDisplayCells(cells, 'projected') }
}

// ── Coherencia de asignaciones (importe vs. %) ───────────────────────────────
// allocatedAmount es la porción del total del documento asignada a la línea;
// allocationPercentage se deriva al guardar (importe ÷ total). Financiero
// reparte por %, Económico por importe (para que las NC negativas compensen):
// si no se corresponden, las bases de ambos análisis divergen. Solo se
// detecta y se informa — nunca se corrige un dato histórico. Las NC guardan
// importe negativo y % positivo (se compara en valor absoluto); la tolerancia
// cubre los redondeos del % (6 decimales) y de importes en centavos.

export const ALLOCATION_TOLERANCE_PP = 0.5

export interface AllocationInconsistency {
  documentNumber: string
  documentType: string
  currency: Currency
  allocatedAmount: number
  documentTotal: number
  storedPercentage: number
  impliedPercentage: number
}

export function inconsistentAllocationsForAsset(assetId: string, documents: DocumentForFinancial[]): AllocationInconsistency[] {
  const out: AllocationInconsistency[] = []
  for (const doc of documents) {
    const total = Math.abs(doc.totalAmount)
    if (!Number.isFinite(total) || total === 0) continue
    for (const a of doc.allocations) {
      if (a.assetId !== assetId) continue
      const implied = (Math.abs(a.allocatedAmount) / total) * 100
      if (!Number.isFinite(implied) || Math.abs(implied - Math.abs(a.allocationPercentage)) <= ALLOCATION_TOLERANCE_PP) continue
      out.push({
        documentNumber: doc.documentNumber,
        documentType: doc.documentType,
        currency: doc.currency,
        allocatedAmount: a.allocatedAmount,
        documentTotal: doc.totalAmount,
        storedPercentage: a.allocationPercentage,
        impliedPercentage: implied,
      })
    }
  }
  return out
}

export function hasExcludedNative(n: NativeAmounts): boolean {
  return n.ARS !== 0 || n.USD !== 0
}
