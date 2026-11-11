import type { Currency, Installment, Policy } from '../types'
import type { DocumentForFinancial } from '../api/documents.api'
import { ACTIVE_POLICY_STATUSES, policyTermMonths } from './insuranceDashboardCalc'

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

// ── Variante por documento (Económico) ───────────────────────────────────────
// Replica allocationInCurrency/buildEconomicMatrix de EconomicAnalysisPage.tsx:
// cualquier tipo de documento (factura, NC, ND, endoso) que tenga una
// asignación al activo, agrupado por issueDate, usando `allocatedAmount`
// prorrateado sobre `doc.totalAmount` (no allocationPercentage) — así una NC
// con allocatedAmount negativo compensa correctamente a la factura que
// ajusta, igual que en Económico. Sin pagado/pendiente: un documento emitido
// ya está reconocido, sin importar si se cobró.

function docAllocatedAmountForAsset(doc: DocumentForFinancial, assetId: string): number {
  return doc.allocations.filter((a) => a.assetId === assetId).reduce((sum, a) => sum + a.allocatedAmount, 0)
}

export function buildAssetRealTimelineByDocument(assetId: string, documents: DocumentForFinancial[]): Map<string, RealMonthCell> {
  const acc = new Map<string, RealMonthCell>()

  for (const doc of documents) {
    const allocatedAmount = docAllocatedAmountForAsset(doc, assetId)
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

// ── Detección de ciclo de renovación + base USD ──────────────────────────────
// Una "renovación" es una factura (INVOICE) asignada al activo — NC/ND/Endosos
// son ajustes de una renovación existente, no una nueva. La base de la
// proyección es la ÚLTIMA renovación, en USD con SU cierre histórico. Ya no
// se calcula un % automático: la proyección parte de 0 % (misma base USD en
// cada ciclo) salvo que el usuario cargue uno.

export type RenewalBaseStatus = 'OK' | 'NO_HISTORY' | 'UNRELIABLE_FX'

export interface RenewalCycle {
  cycleLengthMonths: number
  /** posición dentro del ciclo → fracción del total de la última renovación real. */
  originalShare: Record<number, number>
  lastRenewalStartMonthKey: string
  /**
   * 'UNRELIABLE_FX': la última renovación no tiene un cierre USD confiable —
   * la base queda en null y la fila no se proyecta hasta que se cargue una
   * base USD a mano. Nunca se reemplaza por una renovación anterior.
   */
  baseStatus: RenewalBaseStatus
  defaultNetUsd: number | null
  defaultVatUsd: number | null
  defaultOtherUsd: number | null
}

function fallbackCycleLengthFor(assetId: string, policies: Policy[]): number {
  const activeCoveragePolicy = policies.find(
    (p) => ACTIVE_POLICY_STATUSES.includes(p.status) && (p.coverages ?? []).some((c) => c.assetId === assetId),
  )
  return activeCoveragePolicy ? policyTermMonths(activeCoveragePolicy.startDate, activeCoveragePolicy.endDate) : 12
}

function avgCycleLength(renewalDocs: DocumentForFinancial[], fallback: number): number {
  if (renewalDocs.length < 2) return fallback
  return Math.max(
    1,
    Math.round(
      renewalDocs.slice(1).reduce((sum, doc, idx) => sum + policyTermMonths(renewalDocs[idx].issueDate, doc.issueDate), 0) /
        (renewalDocs.length - 1),
    ),
  )
}

function noHistoryCycle(cycleLengthMonths: number, nowMonthKey: string): RenewalCycle {
  return {
    cycleLengthMonths,
    originalShare: { 0: 1 },
    lastRenewalStartMonthKey: nowMonthKey,
    baseStatus: 'NO_HISTORY',
    defaultNetUsd: 0,
    defaultVatUsd: 0,
    defaultOtherUsd: 0,
  }
}

// Neto/IVA/Otros de la renovación base × la porción del activo, en USD con
// el cierre histórico del documento.
function usdBaseOf(doc: DocumentForFinancial, assetShare: number): Pick<RenewalCycle, 'baseStatus' | 'defaultNetUsd' | 'defaultVatUsd' | 'defaultOtherUsd'> {
  const net = docPortionIn(doc, doc.netAmount * assetShare, 'USD')
  const vat = docPortionIn(doc, doc.vatAmount * assetShare, 'USD')
  const other = docPortionIn(doc, doc.otherTaxesAmount * assetShare, 'USD')
  if (net === null || vat === null || other === null) {
    return { baseStatus: 'UNRELIABLE_FX', defaultNetUsd: null, defaultVatUsd: null, defaultOtherUsd: null }
  }
  return { baseStatus: 'OK', defaultNetUsd: net, defaultVatUsd: vat, defaultOtherUsd: other }
}

export function detectRenewalCycleByCuota(
  assetId: string,
  documents: DocumentForFinancial[],
  policies: Policy[],
  nowMonthKey: string = todayMonthKey(),
): RenewalCycle {
  const renewalDocs = documents
    .filter((d) => d.documentType === 'INVOICE' && d.installments.length > 0 && docAssetShareByPercentage(d, assetId) > 0)
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))

  const fallbackCycleLength = fallbackCycleLengthFor(assetId, policies)
  if (renewalDocs.length === 0) return noHistoryCycle(fallbackCycleLength, nowMonthKey)

  const lastDoc = renewalDocs[renewalDocs.length - 1]
  const lastShare = docAssetShareByPercentage(lastDoc, assetId)
  const anchorKey = lastDoc.installments.map((i) => monthKeyOf(i.dueDate)).reduce((a, b) => (a < b ? a : b))

  // Reparto proporcional del ÚLTIMO ciclo real entre sus meses, con el
  // importe NATIVO de cada cuota — es el reparto real de la factura y no
  // depende de ningún TC (las cuotas pagadas tienen cierres con el TC del
  // pago, que deformarían las proporciones). Se usa tal cual para cada ciclo
  // futuro, nunca se recalcula desde lo editado.
  const nativeSum = lastDoc.installments.reduce((sum, i) => sum + i.amount, 0)
  const originalShare: Record<number, number> = {}
  for (const inst of lastDoc.installments) {
    const pos = monthsBetweenKeys(anchorKey, monthKeyOf(inst.dueDate))
    const share = nativeSum > 0 ? inst.amount / nativeSum : 1 / lastDoc.installments.length
    originalShare[pos] = (originalShare[pos] ?? 0) + share
  }

  return {
    cycleLengthMonths: avgCycleLength(renewalDocs, fallbackCycleLength),
    originalShare,
    lastRenewalStartMonthKey: anchorKey,
    ...usdBaseOf(lastDoc, lastShare),
  }
}

// Sin cuotas que repartir: toda la renovación cae en un solo mes (el de
// emisión), así que originalShare siempre es {0: 1}.
export function detectRenewalCycleByDocument(
  assetId: string,
  documents: DocumentForFinancial[],
  policies: Policy[],
  nowMonthKey: string = todayMonthKey(),
): RenewalCycle {
  const renewalDocs = documents
    .filter((d) => d.documentType === 'INVOICE' && docAllocatedAmountForAsset(d, assetId) > 0)
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate))

  const fallbackCycleLength = fallbackCycleLengthFor(assetId, policies)
  if (renewalDocs.length === 0) return noHistoryCycle(fallbackCycleLength, nowMonthKey)

  const lastDoc = renewalDocs[renewalDocs.length - 1]
  const lastFraction = lastDoc.totalAmount ? docAllocatedAmountForAsset(lastDoc, assetId) / lastDoc.totalAmount : 0

  return {
    cycleLengthMonths: avgCycleLength(renewalDocs, fallbackCycleLength),
    originalShare: { 0: 1 },
    lastRenewalStartMonthKey: monthKeyOf(lastDoc.issueDate),
    ...usdBaseOf(lastDoc, lastFraction),
  }
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

  return { ...cycle, cycleLengthMonths, originalShare, lastRenewalStartMonthKey }
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

// ── Proyección (USD) ──────────────────────────────────────────────────────────
// La posición de cada mes futuro dentro del ciclo se ancla al inicio de la
// ÚLTIMA renovación real (lastRenewalStartMonthKey), no al último mes con
// datos reales — si no, el ciclo queda desfasado apenas esa renovación no
// facturó cuotas hasta el borde exacto del ciclo (ej. ciclo anual facturado
// en 3 cuotas en los meses 0/4/8: la última cuota real cae 4 meses antes del
// borde de los 12, y anclar contra "el último mes real" correría la fase).
// Crecimiento compuesto por CICLO: total × (1 + pct/100)^nºCiclo — con 0 % la
// misma base USD se repite en cada renovación.

export interface ProjectedMonthCell {
  monthKey: string
  amountUsd: number
}

export function projectAssetRow(
  cycle: RenewalCycle,
  startMonthKey: string,
  endMonthKey: string,
  netUsd: number,
  vatUsd: number,
  otherUsd: number,
  growthPercent: number,
): ProjectedMonthCell[] {
  const effectiveTotal = netUsd + vatUsd + otherUsd
  return buildMonthRange(startMonthKey, endMonthKey).map((monthKey) => {
    const offset = monthsBetweenKeys(cycle.lastRenewalStartMonthKey, monthKey)
    const rawCycleNumber = Math.floor(offset / cycle.cycleLengthMonths)
    const cycleNumber = Math.min(rawCycleNumber, MAX_CYCLE_NUMBER)
    const posInCycle = ((offset % cycle.cycleLengthMonths) + cycle.cycleLengthMonths) % cycle.cycleLengthMonths
    const share = cycle.originalShare[posInCycle] ?? 0
    const scaledCycleTotal = effectiveTotal * Math.pow(1 + growthPercent / 100, cycleNumber)
    const raw = scaledCycleTotal * share
    if (!Number.isFinite(raw)) return { monthKey, amountUsd: 0 }
    return { monthKey, amountUsd: raw }
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

export interface DisplayCell {
  isReal: boolean
  status: MonthCellStatus
  /** Importes en la moneda elegida. null = nada de la celda se puede expresar en esa moneda. */
  amounts: MoneyBreakdown | null
  /** Importes reales excluidos por no tener un cierre confiable, en su moneda nativa. */
  excludedNative: NativeAmounts
  /** true si la celda no está completa en la moneda elegida (algo excluido, o proyectada en ARS sin TC). */
  incomplete: boolean
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

export function resolveDisplayCell(
  row: RowProjectionInputs,
  monthKey: string,
  currency: Currency,
  projectionRate: number | null,
): DisplayCell | null {
  const real = row.realTimeline.get(monthKey)
  if (real) {
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
  /** Cantidad de celdas no vacías sumadas. */
  cellCount: number
}

export function sumDisplayCells(cells: Iterable<DisplayCell | null>): DisplayTotals {
  const t: DisplayTotals = {
    total: 0, net: 0, vat: 0, other: 0,
    paid: 0, pending: 0, recognized: 0, projected: 0,
    excludedNative: emptyNativeAmounts(),
    incomplete: false,
    cellCount: 0,
  }
  for (const cell of cells) {
    if (!cell) continue
    t.cellCount += 1
    t.excludedNative.ARS += cell.excludedNative.ARS
    t.excludedNative.USD += cell.excludedNative.USD
    if (cell.incomplete) t.incomplete = true
    if (!cell.amounts) continue
    const { total } = cell.amounts
    if (cell.status === 'paid') t.paid += total
    else if (cell.status === 'pending') t.pending += total
    else if (cell.status === 'recognized') t.recognized += total
    else t.projected += total
    t.total += total
    t.net += cell.amounts.net
    t.vat += cell.amounts.vat
    t.other += cell.amounts.other
  }
  return t
}

export function hasExcludedNative(n: NativeAmounts): boolean {
  return n.ARS !== 0 || n.USD !== 0
}
