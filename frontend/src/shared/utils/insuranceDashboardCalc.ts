import type { Asset, Policy, Claim, ClaimEvent } from '../types'
import type { DocumentForFinancial } from '../api/documents.api'
import { computePolicyInvoicedTotal, computePsaPercentage, getDirectionSign, type TypeDirectionMap } from './policyInvoicedTotal'
import { CATEGORY_GROUPS, LABEL_TO_CATEGORY } from '../constants/asset-categories'

export const OTHER_GROUP_LABEL = 'Otros'

// Mismo criterio que fire-extinguishers.service.ts#normalizeKey — el rango
// unicode son los diacríticos combinantes que deja normalize('NFD').
const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')
function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_REGEX, '').replace(/[_-]+/g, ' ').trim().toLowerCase()
}

const NORMALIZED_CATEGORY_KEY_TO_GROUP: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const group of CATEGORY_GROUPS) {
    for (const item of group.items) map[normalizeKey(item.key)] = group.label
  }
  return map
})()

// El assetType guardado suele ser el LABEL del picker de alta (ej.
// "Camioneta") — caso normal, resuelto vía LABEL_TO_CATEGORY. Pero hay datos
// más viejos que guardaron la CATEGORY KEY cruda ("vehiculo") o incluso un
// texto libre que ni eso ("maquinaria_agricola", "inmueble") — de ahí el
// fallback normalizado + match parcial, para que ese dato legacy también
// caiga en el grupo correcto en vez de amontonarse todo en "Otros".
export function groupForAssetType(assetTypeLabel: string): string {
  const category = LABEL_TO_CATEGORY[assetTypeLabel]
  if (category) {
    const group = CATEGORY_GROUPS.find((g) => g.items.some((i) => i.key === category))
    if (group) return group.label
  }

  const norm = normalizeKey(assetTypeLabel)
  if (NORMALIZED_CATEGORY_KEY_TO_GROUP[norm]) return NORMALIZED_CATEGORY_KEY_TO_GROUP[norm]

  const partial = CATEGORY_GROUPS.find((g) => {
    const normLabel = normalizeKey(g.label)
    return normLabel.includes(norm) || norm.includes(normLabel)
  })
  return partial?.label ?? OTHER_GROUP_LABEL
}

// Todo se estandariza en USD — Asset y Policy ya cierran ambas monedas al
// guardar (ver computeDualAmounts), así que comparar en USD evita mezclar
// pólizas/activos cargados en monedas distintas sin tener que reconvertir
// nada acá.

const ADJUSTING_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT_ENTRY']
const ACTIVE_POLICY_STATUSES = ['vigente', 'proximo_vencer']

export interface MonthBucket {
  monthKey: string // 'YYYY-MM'
  label: string
  totalUsd: number
}

export interface PolicySummaryRow {
  id: string
  policyNumber: string
  insuranceCompany: string
  status: Policy['status']
  endDate: string
  insuredAmountUsd: number
  invoicedTotalUsd: number
  psaPercentage: number | null
  isShared: boolean
}

export interface ClaimSummaryRow {
  id: string
  claimType: string
  occurrenceDate: string
  status: string
  costUsd: number
}

export interface AssetInsuranceSummary {
  assetId: string
  code: string
  name: string
  assetType: string
  /** Grupo de la taxonomía de docs/reference (Vehículos, Maquinaria agrícola, etc.) — ver groupForAssetType(). */
  group: string
  valorRealUsd: number | null
  valorNuevoUsd: number | null
  sumaAseguradaUsd: number
  /** Prima (única cifra económica que hoy carga el sistema) sobre el valor real — para comparar "tasa" entre activos de valor distinto. */
  primaPctValor: number | null
  /** Suma asegurada sobre valor a nuevo (o real si no hay valor a nuevo cargado) — "qué tan cubierto está". */
  coveragePct: number | null
  facturado12mUsd: number
  facturadoTotalUsd: number
  claimsCount: number
  claimsCostUsd: number
  lossRatioPct: number | null
  hasSharedPolicy: boolean
  activePolicies: PolicySummaryRow[]
  allPolicies: PolicySummaryRow[]
  nextExpiration: { policyId: string; policyNumber: string; insuranceCompany: string; endDate: string; daysUntil: number } | null
  monthlySeries: MonthBucket[]
  claimsList: ClaimSummaryRow[]
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
}

function last12MonthKeys(): string[] {
  const keys: string[] = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

// Recorre facturas + notas/ajustes APLICADOS ya vinculados (mismo criterio que
// computePolicyInvoicedTotal en policyInvoicedTotal.ts) pero: (a) sumado sobre
// un CONJUNTO de pólizas en vez de una sola, y (b) bucketizado por mes según
// la fecha de emisión de cada documento contribuyente — así una NC/ND emitida
// meses después de la factura original impacta el mes en que realmente se
// devengó, no el de la factura madre (mismo criterio "económico" que ya usa
// EconomicAnalysisPage).
function buildInvoicedBuckets(
  policyIds: Set<string>,
  documents: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): Map<string, number> {
  const buckets = new Map<string, number>()
  const add = (monthKey: string, usd: number) => {
    if (!usd) return
    buckets.set(monthKey, (buckets.get(monthKey) ?? 0) + usd)
  }

  const facturas = documents.filter((d) => d.documentType === 'INVOICE')
  for (const factura of facturas) {
    for (const alloc of factura.allocations) {
      if (!policyIds.has(alloc.policyId)) continue
      const share = alloc.allocationPercentage / 100
      add(factura.issueDate.slice(0, 7), (factura.totalAmountUsd ?? 0) * share)
    }

    const mods = documents.filter(
      (m) => m.linkedDocumentId === factura.id && m.documentStatus === 'APPLIED' && ADJUSTING_TYPES.includes(m.documentType),
    )
    for (const mod of mods) {
      for (const modAlloc of mod.allocations) {
        if (!policyIds.has(modAlloc.policyId)) continue
        const modShare = modAlloc.allocationPercentage / 100
        const sign = getDirectionSign(mod, typeDefsByKey)
        add(mod.issueDate.slice(0, 7), Math.abs(mod.totalAmountUsd ?? 0) * modShare * sign)
      }
    }
  }
  return buckets
}

export function computeFleetSummaries(
  assets: Asset[],
  policies: Policy[],
  claims: Claim[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): AssetInsuranceSummary[] {
  const monthKeys = last12MonthKeys()

  return assets.map((asset) => {
    const assetPolicies = policies.filter((p) => p.assetIds.includes(asset.id))
    const active = assetPolicies.filter((p) => ACTIVE_POLICY_STATUSES.includes(p.status))
    const assetClaims = claims.filter((c) => c.assetId === asset.id)

    const policyIds = new Set(assetPolicies.map((p) => p.id))
    const assetBuckets = buildInvoicedBuckets(policyIds, financialDocs, typeDefsByKey)

    const monthlySeries: MonthBucket[] = monthKeys.map((key) => ({
      monthKey: key,
      label: monthLabel(key),
      totalUsd: assetBuckets.get(key) ?? 0,
    }))
    const facturado12mUsd = monthlySeries.reduce((s, b) => s + b.totalUsd, 0)
    const facturadoTotalUsd = [...assetBuckets.values()].reduce((s, v) => s + v, 0)

    const sumaAseguradaUsd = active.reduce((s, p) => s + (p.insuredAmountUsd || 0), 0)
    const valorRealUsd = asset.currentValueUsd ?? asset.patrimonialValueUsd
    const valorNuevoUsd = asset.patrimonialValueNewUsd ?? asset.patrimonialValueNew

    const primaPctValor = valorRealUsd && valorRealUsd > 0 ? (sumaAseguradaUsd / valorRealUsd) * 100 : null
    const coverageBase = valorNuevoUsd ?? valorRealUsd
    const coveragePct = coverageBase && coverageBase > 0 ? (sumaAseguradaUsd / coverageBase) * 100 : null

    const claimsCostUsd = assetClaims.reduce(
      (s, c) => s + (c.settledAmountUsd ?? c.realAmountUsd ?? c.claimedAmountUsd ?? 0),
      0,
    )
    const lossRatioPct = sumaAseguradaUsd > 0 ? (claimsCostUsd / sumaAseguradaUsd) * 100 : null

    // Reusa exactamente computePolicyInvoicedTotal/computePsaPercentage (las
    // mismas funciones que ya muestran PolicyDetailPage/AssetDetailPage) para
    // que el número de cada póliza en este dashboard nunca diverja del que ya
    // ve el usuario en la ficha de esa póliza.
    const toRow = (p: Policy): PolicySummaryRow => {
      const totals = computePolicyInvoicedTotal(p.id, financialDocs, typeDefsByKey)
      const invoicedTotalUsd = totals.totalUsd
      const psaPercentage = computePsaPercentage(
        { currency: p.currency, insuredAmountArs: p.insuredAmountArs, insuredAmountUsd: p.insuredAmountUsd },
        totals,
      )
      return {
        id: p.id,
        policyNumber: p.policyNumber,
        insuranceCompany: p.insuranceCompany,
        status: p.status,
        endDate: p.endDate,
        insuredAmountUsd: p.insuredAmountUsd,
        invoicedTotalUsd,
        psaPercentage,
        isShared: p.assetIds.length > 1,
      }
    }

    const allPolicyRows = assetPolicies.map(toRow)
    const activePolicyRows = allPolicyRows.filter((r) => ACTIVE_POLICY_STATUSES.includes(r.status))
    const hasSharedPolicy = assetPolicies.some((p) => p.assetIds.length > 1)

    const upcoming = active
      .map((p) => ({ policy: p, days: daysUntil(p.endDate) }))
      .sort((a, b) => a.days - b.days)[0]
    const nextExpiration = upcoming
      ? {
          policyId: upcoming.policy.id,
          policyNumber: upcoming.policy.policyNumber,
          insuranceCompany: upcoming.policy.insuranceCompany,
          endDate: upcoming.policy.endDate,
          daysUntil: upcoming.days,
        }
      : null

    const claimsList: ClaimSummaryRow[] = assetClaims.map((c) => ({
      id: c.id,
      claimType: c.claimType,
      occurrenceDate: c.occurrenceDate,
      status: c.status,
      costUsd: c.settledAmountUsd ?? c.realAmountUsd ?? c.claimedAmountUsd ?? 0,
    }))

    return {
      assetId: asset.id,
      code: asset.internalCode,
      name: asset.name,
      assetType: asset.assetType,
      group: groupForAssetType(asset.assetType),
      valorRealUsd,
      valorNuevoUsd,
      sumaAseguradaUsd,
      primaPctValor,
      coveragePct,
      facturado12mUsd,
      facturadoTotalUsd,
      claimsCount: assetClaims.length,
      claimsCostUsd,
      lossRatioPct,
      hasSharedPolicy,
      activePolicies: activePolicyRows,
      allPolicies: allPolicyRows,
      nextExpiration,
      monthlySeries,
      claimsList,
    }
  })
}

// ── Comparativa entre aseguradoras ──────────────────────────────────────────
// "Cartera" (pólizas/prima/facturado) siempre se mide sobre pólizas VIGENTES
// (vigente + próximo a vencer, mismo criterio que el resto del dashboard) —
// pero los siniestros se miran sin ese filtro: cómo respondió una aseguradora
// en un siniestro viejo importa igual, aunque hoy ya no tengas póliza con
// ella. `insuranceCompany` sale del mismo catálogo en Pólizas y Siniestros
// (no es texto libre desincronizado), así que agrupar por ese string es
// confiable.

export const TERMINAL_CLAIM_STATUSES = ['Liquidado', 'Rechazado', 'Cerrado']
const DECIDED_CLAIM_STATUSES = ['Liquidado', 'Rechazado']
const OPEN_CLAIM_STALE_DAYS = 60
const EXPIRATION_SOON_DAYS = 30

export interface InsurerSummary {
  insuranceCompany: string
  activePolicyCount: number
  assetsCoveredCount: number
  primaVigenteUsd: number
  facturadoVigenteUsd: number
  upcomingExpirations30d: number
  claimsCount: number
  claimsByStatus: Record<string, number>
  decidedClaimsCount: number
  rejectedClaimsCount: number
  rejectionRatePct: number | null
  resolutionRatePct: number | null
  /** Monto liquidado / monto reclamado, agregado (no promedio de ratios) — sobre siniestros ya liquidados. */
  fulfillmentPct: number | null
  avgResolutionDays: number | null
  resolutionDaysSum: number
  resolutionDaysCount: number
  openClaimsOver60d: number
}

function daysBetween(fromDateStr: string, toDateStr: string): number {
  const from = new Date(fromDateStr + 'T00:00:00')
  const to = new Date(toDateStr + 'T00:00:00')
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

// `claimEventsById` solo necesita traer los eventos de siniestros ya en
// estado terminal (Liquidado/Rechazado/Cerrado) — es lo único que hace falta
// para calcular días de resolución; ver InsuranceDashboardPage (fetch en
// paralelo, uno por siniestro, no hay endpoint bulk de eventos todavía).
export function computeInsurerSummaries(
  policies: Policy[],
  claims: Claim[],
  claimEventsById: Record<string, ClaimEvent[]>,
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): InsurerSummary[] {
  const names = new Set<string>()
  for (const p of policies) if (p.insuranceCompany) names.add(p.insuranceCompany)
  for (const c of claims) if (c.insuranceCompany) names.add(c.insuranceCompany)

  const todayStr = new Date().toISOString().slice(0, 10)

  return [...names]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name): InsurerSummary => {
      const activePolicies = policies.filter((p) => p.insuranceCompany === name && ACTIVE_POLICY_STATUSES.includes(p.status))
      const primaVigenteUsd = activePolicies.reduce((s, p) => s + (p.insuredAmountUsd || 0), 0)
      const assetsCoveredCount = new Set(activePolicies.flatMap((p) => p.assetIds)).size
      const facturadoVigenteUsd = activePolicies.reduce(
        (s, p) => s + computePolicyInvoicedTotal(p.id, financialDocs, typeDefsByKey).totalUsd,
        0,
      )
      const upcomingExpirations30d = activePolicies.filter((p) => {
        const d = daysUntil(p.endDate)
        return d >= 0 && d <= EXPIRATION_SOON_DAYS
      }).length

      const insurerClaims = claims.filter((c) => c.insuranceCompany === name)
      const claimsByStatus: Record<string, number> = {}
      for (const c of insurerClaims) claimsByStatus[c.status] = (claimsByStatus[c.status] ?? 0) + 1

      const decided = insurerClaims.filter((c) => DECIDED_CLAIM_STATUSES.includes(c.status))
      const rejectedClaimsCount = decided.filter((c) => c.status === 'Rechazado').length
      const rejectionRatePct = decided.length > 0 ? (rejectedClaimsCount / decided.length) * 100 : null
      const resolutionRatePct = decided.length > 0 ? ((decided.length - rejectedClaimsCount) / decided.length) * 100 : null

      const liquidated = insurerClaims.filter((c) => c.status === 'Liquidado' && c.claimedAmountUsd)
      const sumSettled = liquidated.reduce((s, c) => s + (c.settledAmountUsd ?? 0), 0)
      const sumClaimed = liquidated.reduce((s, c) => s + (c.claimedAmountUsd ?? 0), 0)
      const fulfillmentPct = sumClaimed > 0 ? (sumSettled / sumClaimed) * 100 : null

      let resolutionDaysSum = 0
      let resolutionDaysCount = 0
      for (const c of insurerClaims) {
        if (!TERMINAL_CLAIM_STATUSES.includes(c.status)) continue
        const events = claimEventsById[c.id] ?? []
        const closingEvent = events
          .filter((e) => e.newStatus && TERMINAL_CLAIM_STATUSES.includes(e.newStatus))
          .sort((a, b) => b.date.localeCompare(a.date))[0]
        if (closingEvent) {
          resolutionDaysSum += daysBetween(c.occurrenceDate, closingEvent.date)
          resolutionDaysCount += 1
        }
      }
      const avgResolutionDays = resolutionDaysCount > 0 ? resolutionDaysSum / resolutionDaysCount : null

      const openClaimsOver60d = insurerClaims.filter(
        (c) => !TERMINAL_CLAIM_STATUSES.includes(c.status) && daysBetween(c.occurrenceDate, todayStr) > OPEN_CLAIM_STALE_DAYS,
      ).length

      return {
        insuranceCompany: name,
        activePolicyCount: activePolicies.length,
        assetsCoveredCount,
        primaVigenteUsd,
        facturadoVigenteUsd,
        upcomingExpirations30d,
        claimsCount: insurerClaims.length,
        claimsByStatus,
        decidedClaimsCount: decided.length,
        rejectedClaimsCount,
        rejectionRatePct,
        resolutionRatePct,
        fulfillmentPct,
        avgResolutionDays,
        resolutionDaysSum,
        resolutionDaysCount,
        openClaimsOver60d,
      }
    })
}
