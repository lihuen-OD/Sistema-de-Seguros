// Suma asegurada ATRIBUIDA por imputación (R4-B) — cálculo puro, sin
// consultas. Separa dos importes que no se mezclan:
// - contractual: lo que dice la línea (insuredAmountArs/Usd), sin tocar;
// - atribuido: la parte de esa línea que corresponde a las empresas / centros
//   de costo filtrados, según los porcentajes de las asignaciones del activo.
//
// Reglas aprobadas:
// - Sin filtro de empresa ni de centro de costo, cada línea vigente cuenta una
//   sola vez por su importe contractual (el filtro de tipo de activo solo
//   decide qué líneas entran, no prorratea).
// - Línea con activo: aporta (Σ % de las asignaciones del activo que cumplen
//   TODOS los filtros) / 100 de su importe. Los porcentajes se guardan en
//   escala 0–100 (60 = 60 %, ver AllocationInputSchema).
// - Línea sin activo: no tiene asignaciones — aporta completa si su propia
//   empresa / centro de costo cumplen los filtros, si no nada.
// - Activo sin asignaciones: queda en el global; con filtros de imputación no
//   aporta a ninguna empresa (no se inventan asignaciones).
// - Porcentajes incompletos no se normalizan. Si los que coinciden suman más
//   de 100 (dato inválido: la API exige que sumen 100), se topea en 100 para
//   no atribuir más que el importe contratado, y se informa.

/** Misma tolerancia que la validación de alta (AllocationInputSchema). */
const PERCENTAGE_TOLERANCE = 0.01

export interface AttributionFilters {
  companyIds?: string[]
  costCenterId?: string
}

export interface AllocationShare {
  companyId: string
  costCenterId: string
  percentage: number
}

/** Líneas vigentes agrupadas por póliza / activo / imputación directa, con su suma contractual. */
export interface InsuredLineGroup {
  policyId: string
  assetId: string | null
  companyId: string | null
  costCenterId: string | null
  insuredAmountArs: number
  insuredAmountUsd: number
}

export interface InsurerInsuredAmount {
  insurer: string
  insuredActiveArs: number
  insuredActiveUsd: number
  policyCount: number
}

export interface InsuredAttribution {
  /** true = importes prorrateados por imputación; false = importes contractuales. */
  attributed: boolean
  insuredActiveArs: number
  insuredActiveUsd: number
  byInsurer: InsurerInsuredAmount[]
  activeCoveragePolicyCount: number
  insuredAssetCount: number
  /** Activos en alcance cuyas asignaciones no suman 100 % (solo con filtros de imputación). */
  allocationIssues: { underAllocatedAssets: number; overAllocatedAssets: number }
  allocationIssueAssetIds: { underAllocated: string[]; overAllocated: string[] }
}

export function hasAllocationFilters(filters: AttributionFilters): boolean {
  return Boolean(filters.companyIds?.length) || Boolean(filters.costCenterId)
}

function matchesFilters(filters: AttributionFilters, companyId: string | null, costCenterId: string | null): boolean {
  const companyOk = !filters.companyIds?.length || (companyId != null && filters.companyIds.includes(companyId))
  const costCenterOk = !filters.costCenterId || costCenterId === filters.costCenterId
  return companyOk && costCenterOk
}

/** Fracción (0–1) de la línea que corresponde al alcance de imputación. */
export function lineAttributionShare(
  line: { assetId: string | null; companyId: string | null; costCenterId: string | null },
  allocations: AllocationShare[] | undefined,
  filters: AttributionFilters,
): number {
  if (!hasAllocationFilters(filters)) return 1
  if (!line.assetId) return matchesFilters(filters, line.companyId, line.costCenterId) ? 1 : 0
  const matched = (allocations ?? []).reduce(
    (total, allocation) => (matchesFilters(filters, allocation.companyId, allocation.costCenterId) ? total + allocation.percentage : total),
    0,
  )
  return Math.min(matched, 100) / 100
}

export function allocationTotalIssue(allocations: AllocationShare[] | undefined): 'under' | 'over' | null {
  const total = (allocations ?? []).reduce((sum, allocation) => sum + allocation.percentage, 0)
  if (total > 100 + PERCENTAGE_TOLERANCE) return 'over'
  if (total < 100 - PERCENTAGE_TOLERANCE) return 'under'
  return null
}

const roundToCents = (value: number) => Math.round(value * 100) / 100

export function attributeInsured(
  groups: InsuredLineGroup[],
  allocationsByAsset: ReadonlyMap<string, AllocationShare[]>,
  filters: AttributionFilters,
  insurerByPolicy: ReadonlyMap<string, string> = new Map(),
): InsuredAttribution {
  const attributed = hasAllocationFilters(filters)
  let ars = 0
  let usd = 0
  const byInsurer = new Map<string, { ars: number; usd: number; policyIds: Set<string> }>()
  const policyIds = new Set<string>()
  const assetIds = new Set<string>()

  for (const group of groups) {
    const share = lineAttributionShare(group, group.assetId ? allocationsByAsset.get(group.assetId) : undefined, filters)
    if (share <= 0) continue
    const groupArs = group.insuredAmountArs * share
    const groupUsd = group.insuredAmountUsd * share
    ars += groupArs
    usd += groupUsd
    policyIds.add(group.policyId)
    if (group.assetId) assetIds.add(group.assetId)

    const insurer = insurerByPolicy.get(group.policyId)
    if (insurer !== undefined) {
      const entry = byInsurer.get(insurer) ?? { ars: 0, usd: 0, policyIds: new Set<string>() }
      entry.ars += groupArs
      entry.usd += groupUsd
      entry.policyIds.add(group.policyId)
      byInsurer.set(insurer, entry)
    }
  }

  let underAllocatedAssets = 0
  let overAllocatedAssets = 0
  const underAllocatedAssetIds: string[] = []
  const overAllocatedAssetIds: string[] = []
  if (attributed) {
    for (const assetId of assetIds) {
      const issue = allocationTotalIssue(allocationsByAsset.get(assetId))
      if (issue === 'under') {
        underAllocatedAssets++
        underAllocatedAssetIds.push(assetId)
      }
      if (issue === 'over') {
        overAllocatedAssets++
        overAllocatedAssetIds.push(assetId)
      }
    }
  }

  return {
    attributed,
    insuredActiveArs: roundToCents(ars),
    insuredActiveUsd: roundToCents(usd),
    byInsurer: [...byInsurer.entries()]
      .map(([insurer, entry]) => ({
        insurer,
        insuredActiveArs: roundToCents(entry.ars),
        insuredActiveUsd: roundToCents(entry.usd),
        policyCount: entry.policyIds.size,
      }))
      .sort((a, b) => b.insuredActiveArs - a.insuredActiveArs || a.insurer.localeCompare(b.insurer, 'es')),
    activeCoveragePolicyCount: policyIds.size,
    insuredAssetCount: assetIds.size,
    allocationIssues: { underAllocatedAssets, overAllocatedAssets },
    allocationIssueAssetIds: { underAllocated: underAllocatedAssetIds, overAllocated: overAllocatedAssetIds },
  }
}
