import type { Asset, Policy, PolicyCoverage, Claim, ClaimEvent } from '../types'
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

const ADJUSTING_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT_ENTRY', 'ENDORSEMENT']
export const ACTIVE_POLICY_STATUSES: Policy['status'][] = ['vigente', 'proximo_vencer']
const DASHBOARD_POLICY_STATUSES: Policy['status'][] = ['vigente', 'proximo_vencer', 'vencida']

/**
 * Regla de cartera del dashboard de seguros:
 * - próxima a vencer sigue siendo vigente;
 * - vencida permanece en el total/historial;
 * - dada de baja queda fuera de cantidades, cobertura y gasto.
 */
export function isPolicyIncludedInInsuranceDashboard(policy: Policy): boolean {
  return DASHBOARD_POLICY_STATUSES.includes(policy.status)
}

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
  /** Meses contratados (startDate → endDate) — la referencia exacta de monthlyRateUsd. */
  termMonths: number
  /** Facturado de esta póliza ÷ meses de vigencia contratados — "cuánto cuesta por mes", sin importar la duración del período. */
  monthlyRateUsd: number | null
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
  productiveUnit: string
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
  /** Suma de la tasa mensual (ver PolicySummaryRow.monthlyRateUsd) de las pólizas activas — "cuánto cuesta por mes asegurar esto hoy", comparable entre activos sin importar cuántos meses dure cada póliza. null si no hay ninguna póliza activa. */
  costoMensualUsd: number | null
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

// Meses contratados de una póliza, a partir de la duración real en días (no
// resta año/mes calendario) — así da un número correcto sin importar en qué
// día del mes arranca/termina la vigencia (ej. 121 días ⇒ 4 meses, no 3 ni 5).
export function policyTermMonths(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const days = (end.getTime() - start.getTime()) / 86_400_000
  return Math.max(1, Math.round(days / 30.4375))
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
// un CONJUNTO de LÍNEAS DE COBERTURA (no de pólizas — cada allocation ya
// apunta a una línea puntual vía policyAssetCoverageId, la unidad de
// atribución más precisa que existe), y (b) bucketizado por mes según la
// fecha de emisión de cada documento contribuyente — así una NC/ND emitida
// meses después de la factura original impacta el mes en que realmente se
// devengó, no el de la factura madre (mismo criterio "económico" que ya usa
// EconomicAnalysisPage).
//
// Agrupar por línea de cobertura (en vez de por póliza entera) evita duplicar
// gasto cuando una póliza cubre varios activos o mezcla tipos de seguro entre
// sus líneas — antes, una póliza compartida entre 2 activos hacía que AMBOS
// activos vieran el 100% del gasto de esa póliza.
function buildInvoicedBucketsByCoverages(
  coverageIds: Set<string>,
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
      if (!coverageIds.has(alloc.policyAssetCoverageId)) continue
      const share = alloc.allocationPercentage / 100
      add(factura.issueDate.slice(0, 7), (factura.totalAmountUsd ?? 0) * share)
    }

    const mods = documents.filter(
      (m) => m.linkedDocumentId === factura.id && m.documentStatus === 'APPLIED' && ADJUSTING_TYPES.includes(m.documentType),
    )
    for (const mod of mods) {
      for (const modAlloc of mod.allocations) {
        if (!coverageIds.has(modAlloc.policyAssetCoverageId)) continue
        const modShare = modAlloc.allocationPercentage / 100
        const sign = getDirectionSign(mod, typeDefsByKey)
        add(mod.issueDate.slice(0, 7), Math.abs(mod.totalAmountUsd ?? 0) * modShare * sign)
      }
    }
  }
  return buckets
}

function sumBucketsInRange(buckets: Map<string, number>, monthKeys: Set<string>): number {
  return [...buckets.entries()].reduce((total, [key, usd]) => (monthKeys.has(key) ? total + usd : total), 0)
}

function sumBuckets(buckets: Map<string, number>): number {
  return [...buckets.values()].reduce((total, usd) => total + usd, 0)
}

function coveragesOf(policy: Policy): PolicyCoverage[] {
  return policy.coverages ?? []
}

export function computeFleetSummaries(
  assets: Asset[],
  policies: Policy[],
  claims: Claim[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): AssetInsuranceSummary[] {
  const monthKeys = last12MonthKeys()
  const monthKeySet = new Set(monthKeys)
  const dashboardPolicies = policies.filter(isPolicyIncludedInInsuranceDashboard)

  // Una línea de cobertura por activo (o ninguna) — requiere que `policies`
  // haya sido pedido con includeCoverages:true (ver InsuranceDashboardPage).
  const linesByAssetId = new Map<string, { coverage: PolicyCoverage; policy: Policy }[]>()
  for (const policy of dashboardPolicies) {
    for (const coverage of coveragesOf(policy)) {
      if (!coverage.assetId) continue
      const arr = linesByAssetId.get(coverage.assetId) ?? []
      arr.push({ coverage, policy })
      linesByAssetId.set(coverage.assetId, arr)
    }
  }

  return assets.map((asset) => {
    const assetLines = linesByAssetId.get(asset.id) ?? []
    const active = assetLines.filter((l) => ACTIVE_POLICY_STATUSES.includes(l.policy.status))
    const assetClaims = claims.filter((c) => c.assetId === asset.id)

    const coverageIds = new Set(assetLines.map((l) => l.coverage.id))
    const assetBuckets = buildInvoicedBucketsByCoverages(coverageIds, financialDocs, typeDefsByKey)

    const monthlySeries: MonthBucket[] = monthKeys.map((key) => ({
      monthKey: key,
      label: monthLabel(key),
      totalUsd: assetBuckets.get(key) ?? 0,
    }))
    const facturado12mUsd = sumBucketsInRange(assetBuckets, monthKeySet)
    const facturadoTotalUsd = sumBuckets(assetBuckets)

    const sumaAseguradaUsd = active.reduce((s, l) => s + (l.coverage.insuredAmountUsd || 0), 0)
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

    // El total facturado se calcula por LÍNEA de cobertura (policyAssetCoverageId
    // exacto), no por póliza entera — así una póliza que cubre varios activos
    // nunca duplica su gasto entre ellos (antes cada activo veía el 100% del
    // gasto total de la póliza compartida).
    const toRow = (l: { coverage: PolicyCoverage; policy: Policy }): PolicySummaryRow => {
      const invoicedTotalUsd = sumBuckets(buildInvoicedBucketsByCoverages(new Set([l.coverage.id]), financialDocs, typeDefsByKey))
      const psaPercentage = computePsaPercentage(l.coverage.insuredAmountUsd, invoicedTotalUsd)
      const termMonths = policyTermMonths(l.policy.startDate, l.policy.endDate)
      const monthlyRateUsd = invoicedTotalUsd > 0 ? invoicedTotalUsd / termMonths : null
      const distinctAssetIds = new Set(coveragesOf(l.policy).map((c) => c.assetId).filter((id): id is string => !!id))
      return {
        id: l.policy.id,
        policyNumber: l.policy.policyNumber,
        insuranceCompany: l.policy.insuranceCompany,
        status: l.policy.status,
        endDate: l.policy.endDate,
        insuredAmountUsd: l.coverage.insuredAmountUsd,
        invoicedTotalUsd,
        psaPercentage,
        termMonths,
        monthlyRateUsd,
        isShared: distinctAssetIds.size > 1,
      }
    }

    const allPolicyRows = assetLines.map(toRow)
    const activePolicyRows = allPolicyRows.filter((r) => ACTIVE_POLICY_STATUSES.includes(r.status))
    // Suma la tasa mensual de cada póliza activa (puede haber más de una a la
    // vez, ej. casco + RC con vigencias distintas) — null si no hay ninguna
    // activa, para distinguirlo de "cuesta $0/mes" en la tabla.
    const costoMensualUsd = activePolicyRows.length > 0
      ? activePolicyRows.reduce((sum, r) => sum + (r.monthlyRateUsd ?? 0), 0)
      : null
    const hasSharedPolicy = assetLines.some((l) => new Set(coveragesOf(l.policy).map((c) => c.assetId).filter(Boolean)).size > 1)

    const upcoming = active
      .map((l) => ({ policy: l.policy, days: daysUntil(l.policy.endDate) }))
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
      productiveUnit: asset.productiveUnit,
      group: groupForAssetType(asset.assetType),
      valorRealUsd,
      valorNuevoUsd,
      sumaAseguradaUsd,
      primaPctValor,
      coveragePct,
      facturado12mUsd,
      costoMensualUsd,
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

// ── Gasto por unidad productiva ─────────────────────────────────────────────

export const UNASSIGNED_PRODUCTIVE_UNIT_LABEL = 'Sin unidad asignada'
export const SHARED_PRODUCTIVE_UNIT_LABEL = 'Compartido entre unidades'

export interface ProductiveUnitInsuranceSummary {
  id: string
  label: string
  kind: 'unit' | 'unassigned' | 'shared'
  assetCount: number
  insuredAssetCount: number
  policyCount: number
  facturado12mUsd: number
  sharePct: number
  spendPerAssetUsd: number
  deviationFromAveragePct: number | null
}

interface MutableProductiveUnitSummary {
  label: string
  kind: ProductiveUnitInsuranceSummary['kind']
  assetIds: Set<string>
  policyIds: Set<string>
  facturado12mUsd: number
}

function productiveUnitLabel(asset: Asset): string {
  return asset.productiveUnit.trim() || UNASSIGNED_PRODUCTIVE_UNIT_LABEL
}

function productiveUnitId(label: string): string {
  return normalizeKey(label).replace(/\s+/g, '-')
}

/**
 * Agrupa el gasto facturado de los últimos 12 meses sin duplicar pólizas.
 *
 * Una póliza que cubre varios activos de la misma unidad se imputa una sola
 * vez a esa unidad. Si cubre unidades diferentes, queda en un bucket explícito
 * de "Compartido entre unidades": no hay un porcentaje de distribución
 * persistido y repartirla en partes iguales inventaría una regla de negocio.
 */
export function computeProductiveUnitSummaries(
  assets: Asset[],
  policies: Policy[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): ProductiveUnitInsuranceSummary[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const dashboardPolicies = policies.filter(isPolicyIncludedInInsuranceDashboard)
  const monthKeys = new Set(last12MonthKeys())
  const insuredAssetIds = new Set(
    dashboardPolicies
      .filter((policy) => ACTIVE_POLICY_STATUSES.includes(policy.status))
      .flatMap((policy) => coveragesOf(policy).map((c) => c.assetId))
      .filter((assetId): assetId is string => !!assetId && assetById.has(assetId)),
  )
  const buckets = new Map<string, MutableProductiveUnitSummary>()

  const ensureBucket = (
    label: string,
    kind: ProductiveUnitInsuranceSummary['kind'],
  ): MutableProductiveUnitSummary => {
    const existing = buckets.get(label)
    if (existing) return existing
    const next: MutableProductiveUnitSummary = {
      label,
      kind,
      assetIds: new Set(),
      policyIds: new Set(),
      facturado12mUsd: 0,
    }
    buckets.set(label, next)
    return next
  }

  // Todas las unidades con activos deben aparecer, incluso si todavía no
  // tienen documentos facturados.
  for (const asset of assets) {
    const label = productiveUnitLabel(asset)
    ensureBucket(
      label,
      label === UNASSIGNED_PRODUCTIVE_UNIT_LABEL ? 'unassigned' : 'unit',
    ).assetIds.add(asset.id)
  }

  for (const policy of dashboardPolicies) {
    const coverages = coveragesOf(policy)
    const linkedAssetIds = new Set(coverages.map((c) => c.assetId).filter((id): id is string => !!id))
    const linkedAssets = [...linkedAssetIds]
      .map((assetId) => assetById.get(assetId))
      .filter((asset): asset is Asset => asset != null)
    if (linkedAssets.length === 0) continue

    const linkedUnits = new Set(linkedAssets.map(productiveUnitLabel))
    const isSharedAcrossUnits = linkedUnits.size > 1
    const label = isSharedAcrossUnits
      ? SHARED_PRODUCTIVE_UNIT_LABEL
      : [...linkedUnits][0]
    const kind: ProductiveUnitInsuranceSummary['kind'] = isSharedAcrossUnits
      ? 'shared'
      : label === UNASSIGNED_PRODUCTIVE_UNIT_LABEL
        ? 'unassigned'
        : 'unit'
    const bucket = ensureBucket(label, kind)

    bucket.policyIds.add(policy.id)
    linkedAssets.forEach((asset) => bucket.assetIds.add(asset.id))

    const policyBuckets = buildInvoicedBucketsByCoverages(
      new Set(coverages.map((c) => c.id)),
      financialDocs,
      typeDefsByKey,
    )
    for (const [monthKey, amountUsd] of policyBuckets) {
      if (monthKeys.has(monthKey)) bucket.facturado12mUsd += amountUsd
    }
  }

  const totalSpend = [...buckets.values()].reduce(
    (total, bucket) => total + bucket.facturado12mUsd,
    0,
  )
  const averageSpendPerAsset = assets.length > 0 ? totalSpend / assets.length : 0

  return [...buckets.values()]
    .map((bucket): ProductiveUnitInsuranceSummary => {
      const assetCount = bucket.assetIds.size
      const spendPerAssetUsd = assetCount > 0 ? bucket.facturado12mUsd / assetCount : 0
      return {
        id: `${bucket.kind}:${productiveUnitId(bucket.label)}`,
        label: bucket.label,
        kind: bucket.kind,
        assetCount,
        insuredAssetCount: [...bucket.assetIds].filter((id) => insuredAssetIds.has(id)).length,
        policyCount: bucket.policyIds.size,
        facturado12mUsd: bucket.facturado12mUsd,
        sharePct: totalSpend > 0 ? (bucket.facturado12mUsd / totalSpend) * 100 : 0,
        spendPerAssetUsd,
        deviationFromAveragePct:
          averageSpendPerAsset > 0
            ? ((spendPerAssetUsd / averageSpendPerAsset) - 1) * 100
            : null,
      }
    })
    .sort((a, b) => b.facturado12mUsd - a.facturado12mUsd || a.label.localeCompare(b.label, 'es'))
}

// ── Comparativa por Bien de Uso ──────────────────────────────────────────────

export const UNASSIGNED_FIXED_ASSET_LABEL = 'Sin Bien de Uso asignado'
export const SHARED_FIXED_ASSET_LABEL = 'Compartido entre Bienes de Uso'

export interface FixedAssetInsuranceSummary {
  id: string
  label: string
  kind: 'unit' | 'unassigned' | 'shared'
  assetCount: number
  insuredAssetCount: number
  policyCount: number
  facturado12mUsd: number
  sharePct: number
  spendPerAssetUsd: number
  deviationFromAveragePct: number | null
}

interface MutableFixedAssetSummary {
  label: string
  kind: FixedAssetInsuranceSummary['kind']
  assetIds: Set<string>
  policyIds: Set<string>
  facturado12mUsd: number
}

function fixedAssetLabel(asset: Asset): string {
  return asset.fixedAsset?.name.trim() || UNASSIGNED_FIXED_ASSET_LABEL
}

/**
 * Agrupa el gasto facturado de los últimos 12 meses por Bien de Uso —
 * idéntico criterio que computeProductiveUnitSummaries (un activo tiene como
 * mucho un Bien de Uso, así que no hace falta prorratear nada por activo;
 * la única ambigüedad posible es una póliza que cubre activos de Bienes de
 * Uso distintos, igual que ya pasa con Unidad Productiva).
 */
export function computeFixedAssetSummaries(
  assets: Asset[],
  policies: Policy[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): FixedAssetInsuranceSummary[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const dashboardPolicies = policies.filter(isPolicyIncludedInInsuranceDashboard)
  const monthKeys = new Set(last12MonthKeys())
  const insuredAssetIds = new Set(
    dashboardPolicies
      .filter((policy) => ACTIVE_POLICY_STATUSES.includes(policy.status))
      .flatMap((policy) => coveragesOf(policy).map((c) => c.assetId))
      .filter((assetId): assetId is string => !!assetId && assetById.has(assetId)),
  )
  const buckets = new Map<string, MutableFixedAssetSummary>()

  const ensureBucket = (label: string, kind: FixedAssetInsuranceSummary['kind']): MutableFixedAssetSummary => {
    const existing = buckets.get(label)
    if (existing) return existing
    const next: MutableFixedAssetSummary = { label, kind, assetIds: new Set(), policyIds: new Set(), facturado12mUsd: 0 }
    buckets.set(label, next)
    return next
  }

  for (const asset of assets) {
    const label = fixedAssetLabel(asset)
    ensureBucket(label, label === UNASSIGNED_FIXED_ASSET_LABEL ? 'unassigned' : 'unit').assetIds.add(asset.id)
  }

  for (const policy of dashboardPolicies) {
    const coverages = coveragesOf(policy)
    const linkedAssetIds = new Set(coverages.map((c) => c.assetId).filter((id): id is string => !!id))
    const linkedAssets = [...linkedAssetIds].map((assetId) => assetById.get(assetId)).filter((asset): asset is Asset => asset != null)
    if (linkedAssets.length === 0) continue

    const linkedFixedAssets = new Set(linkedAssets.map(fixedAssetLabel))
    const isShared = linkedFixedAssets.size > 1
    const label = isShared ? SHARED_FIXED_ASSET_LABEL : [...linkedFixedAssets][0]
    const kind: FixedAssetInsuranceSummary['kind'] = isShared ? 'shared' : label === UNASSIGNED_FIXED_ASSET_LABEL ? 'unassigned' : 'unit'
    const bucket = ensureBucket(label, kind)

    bucket.policyIds.add(policy.id)
    linkedAssets.forEach((asset) => bucket.assetIds.add(asset.id))

    const policyBuckets = buildInvoicedBucketsByCoverages(new Set(coverages.map((c) => c.id)), financialDocs, typeDefsByKey)
    for (const [monthKey, amountUsd] of policyBuckets) {
      if (monthKeys.has(monthKey)) bucket.facturado12mUsd += amountUsd
    }
  }

  const totalSpend = [...buckets.values()].reduce((total, bucket) => total + bucket.facturado12mUsd, 0)
  const averageSpendPerAsset = assets.length > 0 ? totalSpend / assets.length : 0

  return [...buckets.values()]
    .map((bucket): FixedAssetInsuranceSummary => {
      const assetCount = bucket.assetIds.size
      const spendPerAssetUsd = assetCount > 0 ? bucket.facturado12mUsd / assetCount : 0
      return {
        id: `${bucket.kind}:${normalizeKey(bucket.label).replace(/\s+/g, '-')}`,
        label: bucket.label,
        kind: bucket.kind,
        assetCount,
        insuredAssetCount: [...bucket.assetIds].filter((id) => insuredAssetIds.has(id)).length,
        policyCount: bucket.policyIds.size,
        facturado12mUsd: bucket.facturado12mUsd,
        sharePct: totalSpend > 0 ? (bucket.facturado12mUsd / totalSpend) * 100 : 0,
        spendPerAssetUsd,
        deviationFromAveragePct: averageSpendPerAsset > 0 ? ((spendPerAssetUsd / averageSpendPerAsset) - 1) * 100 : null,
      }
    })
    .sort((a, b) => b.facturado12mUsd - a.facturado12mUsd || a.label.localeCompare(b.label, 'es'))
}

// ── Comparativa por Centro de Costo ──────────────────────────────────────────

export const UNASSIGNED_COST_CENTER_LABEL = 'Sin centro de costo asignado'

export interface CostCenterInsuranceSummary {
  id: string
  label: string
  kind: 'unit' | 'unassigned'
  assetCount: number
  insuredAssetCount: number
  policyCount: number
  facturado12mUsd: number
  sharePct: number
  spendPerAssetUsd: number
  deviationFromAveragePct: number | null
}

interface MutableCostCenterSummary {
  label: string
  kind: CostCenterInsuranceSummary['kind']
  assetIds: Set<string>
  policyIds: Set<string>
  facturado12mUsd: number
}

/**
 * Agrupa el gasto facturado de los últimos 12 meses por Centro de Costo.
 *
 * A diferencia de Bien de Uso/Unidad Productiva (un valor por activo), un
 * activo puede repartirse entre varios centros de costo por porcentaje
 * (Asset.allocations) — acá el gasto de CADA activo se calcula una sola vez,
 * a partir de sus propias líneas de cobertura (nunca de la póliza entera:
 * cada línea ya sabe a qué activo pertenece, así que dos activos que
 * comparten póliza nunca duplican el gasto del otro), y ese total se reparte
 * entre sus centros de costo según ese mismo %. Las líneas "sin activo"
 * (Accidentes Personales, etc.) ya traen su propio centro de costo y se
 * suman aparte, sin prorrateo — no hay un activo del que repartir.
 */
export function computeCostCenterSummaries(
  assets: Asset[],
  policies: Policy[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
  costCentersById: Map<string, { id: string; name: string }>,
): CostCenterInsuranceSummary[] {
  const dashboardPolicies = policies.filter(isPolicyIncludedInInsuranceDashboard)
  const monthKeys = new Set(last12MonthKeys())

  const coverageIdsByAsset = new Map<string, Set<string>>()
  const policyIdsByAsset = new Map<string, Set<string>>()
  const insuredAssetIds = new Set<string>()
  for (const policy of dashboardPolicies) {
    for (const coverage of coveragesOf(policy)) {
      if (!coverage.assetId) continue
      if (!coverageIdsByAsset.has(coverage.assetId)) coverageIdsByAsset.set(coverage.assetId, new Set())
      coverageIdsByAsset.get(coverage.assetId)!.add(coverage.id)
      if (!policyIdsByAsset.has(coverage.assetId)) policyIdsByAsset.set(coverage.assetId, new Set())
      policyIdsByAsset.get(coverage.assetId)!.add(policy.id)
      if (ACTIVE_POLICY_STATUSES.includes(policy.status)) insuredAssetIds.add(coverage.assetId)
    }
  }

  const buckets = new Map<string, MutableCostCenterSummary>()
  const ensureBucket = (label: string, kind: CostCenterInsuranceSummary['kind']): MutableCostCenterSummary => {
    const existing = buckets.get(label)
    if (existing) return existing
    const next: MutableCostCenterSummary = { label, kind, assetIds: new Set(), policyIds: new Set(), facturado12mUsd: 0 }
    buckets.set(label, next)
    return next
  }

  for (const asset of assets) {
    const allocations = (asset.allocations ?? []).filter((a) => costCentersById.has(a.costCenterId))
    const assetPolicyIds = policyIdsByAsset.get(asset.id) ?? new Set<string>()
    const assetCoverageIds = coverageIdsByAsset.get(asset.id)
    const assetSpend = assetCoverageIds
      ? sumBucketsInRange(buildInvoicedBucketsByCoverages(assetCoverageIds, financialDocs, typeDefsByKey), monthKeys)
      : 0

    if (allocations.length === 0) {
      const bucket = ensureBucket(UNASSIGNED_COST_CENTER_LABEL, 'unassigned')
      bucket.assetIds.add(asset.id)
      assetPolicyIds.forEach((id) => bucket.policyIds.add(id))
      bucket.facturado12mUsd += assetSpend
      continue
    }

    for (const alloc of allocations) {
      const costCenter = costCentersById.get(alloc.costCenterId)!
      const bucket = ensureBucket(costCenter.name, 'unit')
      bucket.assetIds.add(asset.id)
      assetPolicyIds.forEach((id) => bucket.policyIds.add(id))
      bucket.facturado12mUsd += assetSpend * (alloc.percentage / 100)
    }
  }

  // Líneas "sin activo" — ya traen su propio centro de costo, sin activo del
  // que prorratear (ver comentario de la función). Se resuelve por
  // costCenterId contra costCentersById, no por coverage.costCenterName: ese
  // campo solo viene poblado desde GET /policies/:id (detalle) — el listado
  // que usa este dashboard (includeCoverages:true) únicamente manda el id.
  for (const policy of dashboardPolicies) {
    for (const coverage of coveragesOf(policy)) {
      if (coverage.assetId) continue
      const label = (coverage.costCenterId ? costCentersById.get(coverage.costCenterId)?.name : undefined)?.trim() || UNASSIGNED_COST_CENTER_LABEL
      const bucket = ensureBucket(label, label === UNASSIGNED_COST_CENTER_LABEL ? 'unassigned' : 'unit')
      bucket.policyIds.add(policy.id)
      const coverageBuckets = buildInvoicedBucketsByCoverages(new Set([coverage.id]), financialDocs, typeDefsByKey)
      for (const [monthKey, amountUsd] of coverageBuckets) {
        if (monthKeys.has(monthKey)) bucket.facturado12mUsd += amountUsd
      }
    }
  }

  const totalSpend = [...buckets.values()].reduce((total, bucket) => total + bucket.facturado12mUsd, 0)
  const averageSpendPerAsset = assets.length > 0 ? totalSpend / assets.length : 0

  return [...buckets.values()]
    .map((bucket): CostCenterInsuranceSummary => {
      const assetCount = bucket.assetIds.size
      const spendPerAssetUsd = assetCount > 0 ? bucket.facturado12mUsd / assetCount : 0
      return {
        id: `${bucket.kind}:${normalizeKey(bucket.label).replace(/\s+/g, '-')}`,
        label: bucket.label,
        kind: bucket.kind,
        assetCount,
        insuredAssetCount: [...bucket.assetIds].filter((id) => insuredAssetIds.has(id)).length,
        policyCount: bucket.policyIds.size,
        facturado12mUsd: bucket.facturado12mUsd,
        sharePct: totalSpend > 0 ? (bucket.facturado12mUsd / totalSpend) * 100 : 0,
        spendPerAssetUsd,
        deviationFromAveragePct: averageSpendPerAsset > 0 ? ((spendPerAssetUsd / averageSpendPerAsset) - 1) * 100 : null,
      }
    })
    .sort((a, b) => b.facturado12mUsd - a.facturado12mUsd || a.label.localeCompare(b.label, 'es'))
}

// ── Planilla completa (Pólizas × Activos × Documentos) ──────────────────────

/**
 * Una fila por documento facturado de cada línea póliza-activo (o por línea,
 * si todavía no tiene documentos; o por póliza, si todavía no tiene
 * líneas) — máximo detalle para exportar a Excel y armar tablas dinámicas
 * propias. A diferencia de las demás funciones de este archivo, no agrega ni
 * resume: devuelve filas crudas, sin formatear (fechas ISO, montos
 * numéricos) — el formato para pantalla/export vive en PolicyExportView.
 */
export interface PolicyExportRow {
  id: string
  policyId: string
  policyNumber: string
  insuranceCompany: string
  status: Policy['status']
  startDate: string
  endDate: string
  /** Meses contratados (startDate → endDate) — ver policyTermMonths. */
  termMonths: number
  /** Total facturado histórico de TODA la póliza (todas sus líneas, ver
   * computePolicyInvoicedTotal) dividido por termMonths — null si todavía no
   * se facturó nada. Mismo criterio que PolicySummaryRow.monthlyRateUsd,
   * pero a nivel póliza entera en vez de por línea de cobertura. */
  monthlyEstimatedCostUsd: number | null
  insuranceTypeName: string
  insuredAmount: number
  currency: 'ARS' | 'USD'
  insuredAmountUsd: number
  assetId: string | null
  assetCode: string | null
  assetName: string | null
  assetType: string | null
  fixedAssetName: string | null
  costCenterLabel: string
  costCenterNames: string[]
  companyLabel: string
  companyNames: string[]
  documentId: string | null
  documentType: string | null
  documentNumber: string | null
  issueDate: string | null
  documentStatus: string | null
  documentCurrency: string | null
  allocatedAmount: number | null
  allocationPercentage: number | null
  documentTotalAmount: number | null
}

function allocationLabel<T extends { percentage: number }>(
  allocations: T[],
  resolveName: (alloc: T) => string | undefined,
): string {
  return allocations
    .map((alloc) => {
      const name = resolveName(alloc)
      return name ? `${name} (${Math.round(alloc.percentage)}%)` : null
    })
    .filter((s): s is string => !!s)
    .join(', ')
}

export function buildPolicyExportRows(
  assets: Asset[],
  policies: Policy[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
  companiesById: Map<string, { id: string; name: string }>,
  costCentersById: Map<string, { id: string; name: string }>,
): PolicyExportRow[] {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const rows: PolicyExportRow[] = []

  for (const policy of policies) {
    const termMonths = policyTermMonths(policy.startDate, policy.endDate)
    const { totalUsd: policyInvoicedTotalUsd } = computePolicyInvoicedTotal(policy.id, financialDocs, typeDefsByKey)
    const monthlyEstimatedCostUsd = policyInvoicedTotalUsd > 0 ? +(policyInvoicedTotalUsd / termMonths).toFixed(2) : null

    const base = {
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      insuranceCompany: policy.insuranceCompany,
      status: policy.status,
      startDate: policy.startDate,
      endDate: policy.endDate,
      termMonths,
      monthlyEstimatedCostUsd,
    }
    const coverages = coveragesOf(policy)

    if (coverages.length === 0) {
      rows.push({
        id: `${policy.id}:sin-cobertura`,
        ...base,
        insuranceTypeName: '',
        insuredAmount: 0,
        currency: 'ARS',
        insuredAmountUsd: 0,
        assetId: null,
        assetCode: null,
        assetName: null,
        assetType: null,
        fixedAssetName: null,
        costCenterLabel: '',
        costCenterNames: [],
        companyLabel: '',
        companyNames: [],
        documentId: null,
        documentType: null,
        documentNumber: null,
        issueDate: null,
        documentStatus: null,
        documentCurrency: null,
        allocatedAmount: null,
        allocationPercentage: null,
        documentTotalAmount: null,
      })
      continue
    }

    for (const coverage of coverages) {
      const asset = coverage.assetId ? assetById.get(coverage.assetId) : undefined

      let assetCode: string | null = null
      let assetName: string | null = null
      let assetType: string | null = null
      let fixedAssetName: string | null = null
      let costCenterLabel = ''
      let costCenterNames: string[] = []
      let companyLabel = ''
      let companyNames: string[] = []

      if (coverage.assetId && asset) {
        assetCode = asset.internalCode
        assetName = asset.name
        assetType = asset.assetType
        fixedAssetName = asset.fixedAsset?.name ?? null
        const allocations = asset.allocations ?? []
        costCenterLabel = allocationLabel(allocations, (a) => costCentersById.get(a.costCenterId)?.name)
        costCenterNames = [...new Set(allocations.map((a) => costCentersById.get(a.costCenterId)?.name).filter((n): n is string => !!n))]
        companyLabel = allocationLabel(allocations, (a) => companiesById.get(a.companyId)?.name)
        companyNames = [...new Set(allocations.map((a) => companiesById.get(a.companyId)?.name).filter((n): n is string => !!n))]
      } else if (coverage.assetId) {
        // Activo fuera del scope cargado en este dashboard (inactivo, o más
        // allá del cap de assetQueries.list) — mismo límite conocido que ya
        // tienen las otras 8 pestañas, no se resuelve Bien de Uso/Centro de
        // Costo para este caso.
        assetName = 'Activo no disponible'
      } else {
        const companyName = coverage.companyId ? companiesById.get(coverage.companyId)?.name : undefined
        const costCenterName = coverage.costCenterId ? costCentersById.get(coverage.costCenterId)?.name : undefined
        companyLabel = companyName ?? ''
        companyNames = companyName ? [companyName] : []
        costCenterLabel = costCenterName ?? ''
        costCenterNames = costCenterName ? [costCenterName] : []
      }

      const coverageBase = {
        ...base,
        insuranceTypeName: coverage.insuranceType,
        insuredAmount: coverage.insuredAmount,
        currency: coverage.currency,
        insuredAmountUsd: coverage.insuredAmountUsd,
        assetId: coverage.assetId,
        assetCode,
        assetName,
        assetType,
        fixedAssetName,
        costCenterLabel,
        costCenterNames,
        companyLabel,
        companyNames,
      }

      const coverageDocs = financialDocs.flatMap((doc) =>
        doc.allocations
          .filter((alloc) => alloc.policyAssetCoverageId === coverage.id)
          .map((alloc) => ({ doc, alloc })),
      )

      if (coverageDocs.length === 0) {
        rows.push({
          id: `${coverage.id}:sin-documentos`,
          ...coverageBase,
          documentId: null,
          documentType: null,
          documentNumber: null,
          issueDate: null,
          documentStatus: null,
          documentCurrency: null,
          allocatedAmount: null,
          allocationPercentage: null,
          documentTotalAmount: null,
        })
        continue
      }

      for (const { doc, alloc } of coverageDocs) {
        rows.push({
          id: alloc.id,
          ...coverageBase,
          documentId: doc.id,
          documentType: doc.documentType,
          documentNumber: doc.documentNumber,
          issueDate: doc.issueDate,
          documentStatus: doc.documentStatus,
          documentCurrency: doc.currency,
          allocatedAmount: alloc.allocatedAmount,
          allocationPercentage: alloc.allocationPercentage,
          documentTotalAmount: doc.totalAmount,
        })
      }
    }
  }

  return rows.sort(
    (a, b) =>
      a.policyNumber.localeCompare(b.policyNumber, 'es', { numeric: true }) ||
      (a.assetName ?? '').localeCompare(b.assetName ?? '', 'es') ||
      (b.issueDate ?? '').localeCompare(a.issueDate ?? ''),
  )
}

// ── Comparativa por tipo de seguro ──────────────────────────────────────────

export const UNASSIGNED_INSURANCE_TYPE_LABEL = 'Sin tipo asignado'

export interface InsuranceTypeSummary {
  id: string
  insuranceType: string
  totalPolicyCount: number
  activePolicyCount: number
  assetsCoveredCount: number
  policiesWithoutAssetsCount: number
  activePremiumUsd: number
  facturado12mUsd: number
  sharePct: number
  averageSpendPerPolicyUsd: number
  upcomingExpirations30d: number
  claims12mCount: number
  settledClaims12mUsd: number
}

/**
 * El tipo de seguro ahora vive en cada LÍNEA de cobertura, no en la póliza
 * entera — una póliza puede mezclar tipos entre sus líneas (poco común, pero
 * posible). Por eso esta agrupación trabaja sobre líneas aplanadas, no sobre
 * pólizas: así el gasto de una póliza que combina tipos nunca se duplica
 * entre ellos (cada allocation se atribuye a su línea exacta vía
 * policyAssetCoverageId). Los siniestros solo se atribuyen cuando conservan
 * `policyId`; inferir el tipo desde el texto libre de `claimType` sería
 * mezclar dos catálogos diferentes.
 */
export function computeInsuranceTypeSummaries(
  policies: Policy[],
  claims: Claim[],
  financialDocs: DocumentForFinancial[],
  typeDefsByKey: TypeDirectionMap,
): InsuranceTypeSummary[] {
  const monthKeys = new Set(last12MonthKeys())
  const dashboardPolicies = policies.filter(isPolicyIncludedInInsuranceDashboard)
  const policyById = new Map(dashboardPolicies.map((policy) => [policy.id, policy]))

  const typeNameOf = (coverage: PolicyCoverage) => coverage.insuranceType.trim() || UNASSIGNED_INSURANCE_TYPE_LABEL
  const allLines = dashboardPolicies.flatMap((policy) =>
    coveragesOf(policy).map((coverage) => ({ coverage, policy, typeName: typeNameOf(coverage) })),
  )
  const insuranceTypes = new Set(allLines.map((l) => l.typeName))

  const summaries = [...insuranceTypes].map((insuranceType): InsuranceTypeSummary => {
    const typeLines = allLines.filter((l) => l.typeName === insuranceType)
    const activeLines = typeLines.filter((l) => ACTIVE_POLICY_STATUSES.includes(l.policy.status))
    const coverageIds = new Set(typeLines.map((l) => l.coverage.id))
    const invoicedBuckets = buildInvoicedBucketsByCoverages(coverageIds, financialDocs, typeDefsByKey)
    const facturado12mUsd = sumBucketsInRange(invoicedBuckets, monthKeys)

    const totalPolicyIds = new Set(typeLines.map((l) => l.policy.id))
    const activePoliciesById = new Map(activeLines.map((l) => [l.policy.id, l.policy]))

    const activeLinesByPolicy = new Map<string, typeof activeLines>()
    for (const line of activeLines) {
      const arr = activeLinesByPolicy.get(line.policy.id) ?? []
      arr.push(line)
      activeLinesByPolicy.set(line.policy.id, arr)
    }
    const policiesWithoutAssetsCount = [...activeLinesByPolicy.values()]
      .filter((lines) => lines.every((l) => !l.coverage.assetId)).length

    const typeClaims12m = claims.filter((claim) => {
      if (!claim.policyId || !monthKeys.has(claim.occurrenceDate.slice(0, 7))) return false
      const linkedPolicy = policyById.get(claim.policyId)
      return linkedPolicy != null && coveragesOf(linkedPolicy).some((c) => typeNameOf(c) === insuranceType)
    })

    return {
      id: normalizeKey(insuranceType).replace(/\s+/g, '-'),
      insuranceType,
      totalPolicyCount: totalPolicyIds.size,
      activePolicyCount: activePoliciesById.size,
      assetsCoveredCount: new Set(activeLines.map((l) => l.coverage.assetId).filter((id): id is string => !!id)).size,
      policiesWithoutAssetsCount,
      activePremiumUsd: activeLines.reduce((total, l) => total + (l.coverage.insuredAmountUsd || 0), 0),
      facturado12mUsd,
      sharePct: 0,
      averageSpendPerPolicyUsd: totalPolicyIds.size > 0 ? facturado12mUsd / totalPolicyIds.size : 0,
      upcomingExpirations30d: [...activePoliciesById.values()].filter((policy) => {
        const remainingDays = daysUntil(policy.endDate)
        return remainingDays >= 0 && remainingDays <= EXPIRATION_SOON_DAYS
      }).length,
      claims12mCount: typeClaims12m.length,
      settledClaims12mUsd: typeClaims12m.reduce(
        (total, claim) => total + (claim.status === 'Liquidado' ? (claim.settledAmountUsd ?? 0) : 0),
        0,
      ),
    }
  })

  const totalSpend = summaries.reduce((total, summary) => total + summary.facturado12mUsd, 0)
  return summaries
    .map((summary) => ({
      ...summary,
      sharePct: totalSpend > 0 ? (summary.facturado12mUsd / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.facturado12mUsd - a.facturado12mUsd || a.insuranceType.localeCompare(b.insuranceType, 'es'))
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
  const dashboardPolicies = policies.filter(isPolicyIncludedInInsuranceDashboard)
  const names = new Set<string>()
  for (const p of dashboardPolicies) if (p.insuranceCompany) names.add(p.insuranceCompany)
  for (const c of claims) if (c.insuranceCompany) names.add(c.insuranceCompany)

  const todayStr = new Date().toISOString().slice(0, 10)

  return [...names]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((name): InsurerSummary => {
      const activePolicies = dashboardPolicies.filter(
        (p) => p.insuranceCompany === name && ACTIVE_POLICY_STATUSES.includes(p.status),
      )
      const primaVigenteUsd = activePolicies.reduce((s, p) => s + (p.totalInsuredAmountUsd ?? 0), 0)
      const assetsCoveredCount = new Set(
        activePolicies.flatMap((p) => coveragesOf(p).map((c) => c.assetId)).filter((id): id is string => !!id),
      ).size
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
