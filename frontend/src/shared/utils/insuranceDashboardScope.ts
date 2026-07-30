import type { Asset, Claim, Policy } from '../types'

export interface InsuranceDashboardScope {
  assets: Asset[]
  policies: Policy[]
  claims: Claim[]
}

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
  if (companyIds.length === 0) return { assets, policies, claims }

  const selectedCompanyIds = new Set(companyIds)
  const assetRatioById = new Map<string, number>()

  for (const asset of assets) {
    const allocations = asset.allocations?.length
      ? asset.allocations
      : [{
          id: `legacy-${asset.id}`,
          companyId: asset.companyId,
          costCenterId: asset.costCenterId,
          percentage: 100,
        }]
    const selectedPercentage = allocations.reduce(
      (total, allocation) =>
        selectedCompanyIds.has(allocation.companyId)
          ? total + allocation.percentage
          : total,
      0,
    )
    const ratio = Math.min(1, Math.max(0, selectedPercentage / 100))
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

  return {
    assets: scopedAssets,
    policies: scopedPolicies,
    claims: scopedClaims,
  }
}
