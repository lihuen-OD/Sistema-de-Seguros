import type { Policy } from '../types'
import type { DocumentForFinancial } from '../api/documents.api'
import { ACTIVE_POLICY_STATUSES, policyTermMonths } from './insuranceDashboardCalc'

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
    cur = nextMonthKey(cur)
  }
  return out
}

function toArs(amount: number, currency: 'ARS' | 'USD', exchangeRate: number): number {
  return currency === 'ARS' ? amount : amount * exchangeRate
}

// ── Línea de tiempo real por activo ──────────────────────────────────────────
// Dos criterios legítimamente distintos, uno por página — nunca se mezclan:
// - "ByCuota" (Financiero): agrupa por dueDate de cada cuota, con pagado/pendiente.
// - "ByDocument" (Económico): agrupa por issueDate del documento completo, sin
//   estado de cobro (un documento emitido ya está "reconocido").

export interface RealMonthCell {
  monthKey: string
  amountArs: number
  /** Solo la variante por cuota los llena — su presencia es lo que distingue "tiene estado de cobro" de "reconocido, sin estado". */
  paidArs?: number
  pendingArs?: number
  netArs: number
  vatArs: number
  otherArs: number
}

// ── Variante por cuota (Financiero) ──────────────────────────────────────────
// Mismo criterio que "Matriz de cuotas" en FinancialAnalysisPage.tsx: se
// agrupa por dueDate, esté pagada o no. Un documento sin cuotas propias
// (NC/ND/Endoso sin installments) no aporta acá — no forma parte de la
// grilla mes a mes, igual que hoy en esa matriz.

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

    const docNetArs = toArs(doc.netAmount, doc.currency, doc.exchangeRate)
    const docVatArs = toArs(doc.vatAmount, doc.currency, doc.exchangeRate)
    const docOtherArs = toArs(doc.otherTaxesAmount, doc.currency, doc.exchangeRate)
    const installmentAmountSum = doc.installments.reduce((sum, i) => sum + i.amount, 0)

    for (const inst of doc.installments) {
      const installmentShare = installmentAmountSum > 0 ? inst.amount / installmentAmountSum : 1 / doc.installments.length
      const monthKey = monthKeyOf(inst.dueDate)
      const cell = acc.get(monthKey) ?? { monthKey, amountArs: 0, paidArs: 0, pendingArs: 0, netArs: 0, vatArs: 0, otherArs: 0 }
      const contributionArs = (inst.amountArs ?? 0) * assetShare
      cell.amountArs += contributionArs
      if (inst.paymentStatus === 'PAID') cell.paidArs = (cell.paidArs ?? 0) + contributionArs
      else cell.pendingArs = (cell.pendingArs ?? 0) + contributionArs
      cell.netArs += docNetArs * assetShare * installmentShare
      cell.vatArs += docVatArs * assetShare * installmentShare
      cell.otherArs += docOtherArs * assetShare * installmentShare
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
    const fraction = allocatedAmount / doc.totalAmount

    const monthKey = monthKeyOf(doc.issueDate)
    const cell = acc.get(monthKey) ?? { monthKey, amountArs: 0, netArs: 0, vatArs: 0, otherArs: 0 }
    cell.amountArs += fraction * (doc.totalAmountArs ?? 0)
    cell.netArs += fraction * toArs(doc.netAmount, doc.currency, doc.exchangeRate)
    cell.vatArs += fraction * toArs(doc.vatAmount, doc.currency, doc.exchangeRate)
    cell.otherArs += fraction * toArs(doc.otherTaxesAmount, doc.currency, doc.exchangeRate)
    acc.set(monthKey, cell)
  }

  return acc
}

// ── Detección de ciclo de renovación ─────────────────────────────────────────
// Una "renovación" es una factura (INVOICE) asignada al activo — NC/ND/Endosos
// son ajustes de una renovación existente, no una nueva. Misma definición en
// los dos modos; lo que cambia es cómo se mide el monto de cada renovación.

export interface RenewalCycle {
  cycleLengthMonths: number
  /** Escala 0-100, puede ser negativo. */
  autoGrowthPercent: number
  /** posición dentro del ciclo → fracción del total de la última renovación real. */
  originalShare: Record<number, number>
  lastRenewalStartMonthKey: string
  defaultNetArs: number
  defaultVatArs: number
  defaultOtherArs: number
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

function docTotalArsForAssetByCuota(doc: DocumentForFinancial, assetId: string): number {
  const share = docAssetShareByPercentage(doc, assetId)
  if (share <= 0) return 0
  return doc.installments.reduce((sum, i) => sum + (i.amountArs ?? 0), 0) * share
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

  if (renewalDocs.length === 0) {
    return {
      cycleLengthMonths: fallbackCycleLength,
      autoGrowthPercent: 0,
      originalShare: { 0: 1 },
      lastRenewalStartMonthKey: nowMonthKey,
      defaultNetArs: 0,
      defaultVatArs: 0,
      defaultOtherArs: 0,
    }
  }

  const lastDoc = renewalDocs[renewalDocs.length - 1]
  const lastShare = docAssetShareByPercentage(lastDoc, assetId)
  const lastInstallmentKeys = lastDoc.installments.map((i) => monthKeyOf(i.dueDate))
  const anchorKey = lastInstallmentKeys.reduce((a, b) => (a < b ? a : b))
  const lastDocTotalArs = docTotalArsForAssetByCuota(lastDoc, assetId)

  // Reparto proporcional del ÚLTIMO ciclo real entre sus meses — se usa tal
  // cual para escalar cada ciclo futuro, nunca se recalcula desde lo editado.
  const originalShare: Record<number, number> = {}
  for (const inst of lastDoc.installments) {
    const pos = monthsBetweenKeys(anchorKey, monthKeyOf(inst.dueDate))
    const instArs = (inst.amountArs ?? 0) * lastShare
    const share = lastDocTotalArs > 0 ? instArs / lastDocTotalArs : 1 / lastDoc.installments.length
    originalShare[pos] = (originalShare[pos] ?? 0) + share
  }

  let autoGrowthPercent = 0
  if (renewalDocs.length >= 2) {
    const prevTotal = docTotalArsForAssetByCuota(renewalDocs[renewalDocs.length - 2], assetId)
    autoGrowthPercent = prevTotal > 0 ? Math.round(((lastDocTotalArs / prevTotal) - 1) * 1000) / 10 : 0
  }

  return {
    cycleLengthMonths: avgCycleLength(renewalDocs, fallbackCycleLength),
    autoGrowthPercent,
    originalShare,
    lastRenewalStartMonthKey: anchorKey,
    defaultNetArs: toArs(lastDoc.netAmount, lastDoc.currency, lastDoc.exchangeRate) * lastShare,
    defaultVatArs: toArs(lastDoc.vatAmount, lastDoc.currency, lastDoc.exchangeRate) * lastShare,
    defaultOtherArs: toArs(lastDoc.otherTaxesAmount, lastDoc.currency, lastDoc.exchangeRate) * lastShare,
  }
}

function docTotalArsForAssetByDocument(doc: DocumentForFinancial, assetId: string): number {
  const allocatedAmount = docAllocatedAmountForAsset(doc, assetId)
  if (!doc.totalAmount || allocatedAmount === 0) return 0
  return (allocatedAmount / doc.totalAmount) * (doc.totalAmountArs ?? 0)
}

// Sin cuotas que repartir: toda la renovación cae en un solo mes (el de
// emisión), así que originalShare siempre es {0: 1} — no hace falta el paso
// de prorrateo por cuota que sí necesita la variante por cuota.
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

  if (renewalDocs.length === 0) {
    return {
      cycleLengthMonths: fallbackCycleLength,
      autoGrowthPercent: 0,
      originalShare: { 0: 1 },
      lastRenewalStartMonthKey: nowMonthKey,
      defaultNetArs: 0,
      defaultVatArs: 0,
      defaultOtherArs: 0,
    }
  }

  const lastDoc = renewalDocs[renewalDocs.length - 1]
  const lastAllocated = docAllocatedAmountForAsset(lastDoc, assetId)
  const lastFraction = lastDoc.totalAmount ? lastAllocated / lastDoc.totalAmount : 0

  let autoGrowthPercent = 0
  if (renewalDocs.length >= 2) {
    const prevTotal = docTotalArsForAssetByDocument(renewalDocs[renewalDocs.length - 2], assetId)
    const lastTotal = docTotalArsForAssetByDocument(lastDoc, assetId)
    autoGrowthPercent = prevTotal > 0 ? Math.round(((lastTotal / prevTotal) - 1) * 1000) / 10 : 0
  }

  return {
    cycleLengthMonths: avgCycleLength(renewalDocs, fallbackCycleLength),
    autoGrowthPercent,
    originalShare: { 0: 1 },
    lastRenewalStartMonthKey: monthKeyOf(lastDoc.issueDate),
    defaultNetArs: lastFraction * toArs(lastDoc.netAmount, lastDoc.currency, lastDoc.exchangeRate),
    defaultVatArs: lastFraction * toArs(lastDoc.vatAmount, lastDoc.currency, lastDoc.exchangeRate),
    defaultOtherArs: lastFraction * toArs(lastDoc.otherTaxesAmount, lastDoc.currency, lastDoc.exchangeRate),
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

// ── Proyección ────────────────────────────────────────────────────────────────
// La posición de cada mes futuro dentro del ciclo se ancla al inicio de la
// ÚLTIMA renovación real (lastRenewalStartMonthKey), no al último mes con
// datos reales — si no, el ciclo queda desfasado apenas esa renovación no
// facturó cuotas hasta el borde exacto del ciclo (ej. ciclo anual facturado
// en 3 cuotas en los meses 0/4/8: la última cuota real cae 4 meses antes del
// borde de los 12, y anclar contra "el último mes real" correría la fase).
// No le importa qué constructor (ByCuota/ByDocument) llenó el RenewalCycle.

export interface ProjectedMonthCell {
  monthKey: string
  amountArs: number
}

export function projectAssetRow(
  cycle: RenewalCycle,
  startMonthKey: string,
  endMonthKey: string,
  netEffArs: number,
  vatEffArs: number,
  otherEffArs: number,
  growthPercent: number,
): ProjectedMonthCell[] {
  const effectiveTotal = netEffArs + vatEffArs + otherEffArs
  return buildMonthRange(startMonthKey, endMonthKey).map((monthKey) => {
    const offset = monthsBetweenKeys(cycle.lastRenewalStartMonthKey, monthKey)
    const cycleNumber = Math.floor(offset / cycle.cycleLengthMonths)
    const posInCycle = ((offset % cycle.cycleLengthMonths) + cycle.cycleLengthMonths) % cycle.cycleLengthMonths
    const share = cycle.originalShare[posInCycle] ?? 0
    const scaledCycleTotal = effectiveTotal * Math.pow(1 + growthPercent / 100, cycleNumber)
    return { monthKey, amountArs: scaledCycleTotal * share }
  })
}

// ── Desglose "Detalle por mes" ────────────────────────────────────────────────
// Reparte el total de CUALQUIER celda (real o proyectada) con la proporción
// ACTUAL de la fila — no con una proporción histórica propia de esa celda.

export function splitByCurrentRatio(cellTotalArs: number, netArs: number, vatArs: number, otherArs: number) {
  const base = netArs + vatArs + otherArs
  if (base <= 0) return { net: 0, vat: 0, other: 0 }
  return {
    net: cellTotalArs * (netArs / base),
    vat: cellTotalArs * (vatArs / base),
    other: cellTotalArs * (otherArs / base),
  }
}

// ── Resolución de una celda (mes real o proyectado) ──────────────────────────
// Único punto que decide "qué se ve en este mes" — usado tanto por la tabla
// como por los KPIs de la página, para que nunca se desincronicen.

export type MonthCellStatus = 'paid' | 'pending' | 'projected' | 'recognized'

export interface AssetMonthCellValue {
  isReal: boolean
  status: MonthCellStatus
  totalArs: number
  netArs: number
  vatArs: number
  otherArs: number
}

export function resolveMonthCell(
  realTimeline: Map<string, RealMonthCell>,
  projectedByMonth: Map<string, ProjectedMonthCell>,
  monthKey: string,
  netArs: number,
  vatArs: number,
  otherArs: number,
): AssetMonthCellValue | null {
  const real = realTimeline.get(monthKey)
  if (real) {
    if (real.amountArs <= 0) return null
    // La presencia de paidArs/pendingArs es lo que distingue "tiene estado de
    // cobro" (ByCuota) de "documento reconocido, sin estado" (ByDocument).
    const hasPaymentStatus = real.paidArs !== undefined || real.pendingArs !== undefined
    const status: MonthCellStatus = !hasPaymentStatus ? 'recognized' : (real.pendingArs ?? 0) > 0 ? 'pending' : 'paid'
    return {
      isReal: true,
      status,
      totalArs: real.amountArs,
      netArs: real.netArs,
      vatArs: real.vatArs,
      otherArs: real.otherArs,
    }
  }
  const projected = projectedByMonth.get(monthKey)
  if (!projected || projected.amountArs <= 0) return null
  const split = splitByCurrentRatio(projected.amountArs, netArs, vatArs, otherArs)
  return { isReal: false, status: 'projected', totalArs: projected.amountArs, netArs: split.net, vatArs: split.vat, otherArs: split.other }
}
