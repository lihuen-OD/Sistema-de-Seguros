import type { Asset, Claim, Policy } from '../types'
import { lineAttributionShare } from './insuredAttribution'

export interface InsuranceDashboardScope {
  assets: Asset[]
  policies: Policy[]
  claims: Claim[]
  /**
   * Parte de cada línea de cobertura (por id) que corresponde a las empresas
   * elegidas, según las asignaciones de su activo (R4-B) — 1 sin filtro. Solo
   * para sumas aseguradas: las pólizas se conservan enteras para el gasto.
   */
  lineShare: (coverageId: string) => number
}

const FULL_SHARE = () => 1

function scaleAmount(
  value: number | null | undefined,
  ratio: number,
): number | null | undefined {
  return value == null ? value : value * ratio
}

function scaleAssetValue(asset: Asset, ratio: number): Asset {
  if (ratio === 1) return asset

  return {
    ...asset,
    patrimonialValueUsd: scaleAmount(asset.patrimonialValueUsd, ratio) ?? null,
    patrimonialValueNew: scaleAmount(asset.patrimonialValueNew, ratio) ?? null,
    currentValueArs: scaleAmount(asset.currentValueArs, ratio),
    currentValueUsd: scaleAmount(asset.currentValueUsd, ratio),
    patrimonialValueNewArs: scaleAmount(asset.patrimonialValueNewArs, ratio),
    patrimonialValueNewUsd: scaleAmount(asset.patrimonialValueNewUsd, ratio),
  }
}

function scaleClaimAmounts(claim: Claim, ratio: number): Claim {
  if (ratio === 1) return claim

  return {
    ...claim,
    claimedAmountArs: scaleAmount(claim.claimedAmountArs, ratio) ?? 0,
    claimedAmountUsd: scaleAmount(claim.claimedAmountUsd, ratio),
    realAmountArs: scaleAmount(claim.realAmountArs, ratio),
    realAmountUsd: scaleAmount(claim.realAmountUsd, ratio),
    settledAmountArs: scaleAmount(claim.settledAmountArs, ratio) ?? null,
    settledAmountUsd: scaleAmount(claim.settledAmountUsd, ratio),
    deductibleArs: scaleAmount(claim.deductibleArs, ratio) ?? null,
    deductibleUsd: scaleAmount(claim.deductibleUsd, ratio),
  }
}

/**
 * Construye un único alcance multiempresa para las seis vistas del dashboard.
 *
 * - Las pólizas usan su `companyId`, que es la imputación empresarial directa.
 * - Los activos usan todas sus allocations y prorratean sus valuaciones.
 * - Los siniestros con póliza siguen la empresa de esa póliza.
 * - Los siniestros sin póliza siguen la allocation del activo y prorratean
 *   sus montos, evitando duplicarlos completos entre empresas.
 */
export function buildInsuranceDashboardScope(
  assets: Asset[],
  policies: Policy[],
  claims: Claim[],
  companyIds: string[],
): InsuranceDashboardScope {
  if (companyIds.length === 0) return { assets, policies, claims, lineShare: FULL_SHARE }

  const selectedCompanyIds = new Set(companyIds)
  const assetRatioById = new Map<string, number>()

  for (const asset of assets) {
    const ratio = lineAttributionShare(
      { assetId: asset.id, companyId: asset.companyId, costCenterId: asset.costCenterId },
      asset.allocations,
      { companyIds },
    )
    if (ratio > 0) assetRatioById.set(asset.id, ratio)
  }

  const scopedAssets = assets
    .filter((asset) => assetRatioById.has(asset.id))
    .map((asset) => scaleAssetValue(asset, assetRatioById.get(asset.id) ?? 0))

  // Una póliza puede tener varias líneas de cobertura: algunas "sin activo"
  // (imputadas directamente a una empresa) y otras atadas a un activo (cuya
  // empresa sale de las allocations de ESE activo). Entra en el alcance si
  // CUALQUIERA de sus líneas cae dentro de las empresas seleccionadas —
  // requiere que el caller haya pedido policyQueries.list con
  // includeCoverages:true, si no `policy.coverages` viene vacío/undefined.
  const scopedPolicies = policies.filter((policy) =>
    (policy.coverages ?? []).some((coverage) =>
      coverage.assetId
        ? assetRatioById.has(coverage.assetId)
        : coverage.companyId != null && selectedCompanyIds.has(coverage.companyId),
    ),
  )
  const scopedPolicyIds = new Set(scopedPolicies.map((policy) => policy.id))
  const policyById = new Map(policies.map((policy) => [policy.id, policy]))

  const scopedClaims = claims.flatMap((claim): Claim[] => {
    if (claim.policyId) {
      const linkedPolicy = policyById.get(claim.policyId)
      if (linkedPolicy) return scopedPolicyIds.has(linkedPolicy.id) ? [claim] : []
    }

    if (!claim.assetId) return []
    const ratio = assetRatioById.get(claim.assetId)
    return ratio ? [scaleClaimAmounts(claim, ratio)] : []
  })

  // Prorrateo de la suma asegurada por línea (mismo criterio que el backend):
  // un activo 60/40 aporta 60 % a la empresa A; una línea sin activo, completa
  // si su empresa directa está elegida; un activo sin asignaciones, nada.
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const shareByLineId = new Map<string, number>()
  for (const policy of scopedPolicies) {
    for (const coverage of policy.coverages ?? []) {
      const allocations = coverage.assetId ? assetById.get(coverage.assetId)?.allocations : undefined
      shareByLineId.set(coverage.id, lineAttributionShare(coverage, allocations, { companyIds }))
    }
  }

  return {
    assets: scopedAssets,
    policies: scopedPolicies,
    claims: scopedClaims,
    lineShare: (coverageId) => shareByLineId.get(coverageId) ?? 0,
  }
}
