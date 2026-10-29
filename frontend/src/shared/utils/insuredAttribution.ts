import type { Asset } from '../types'

// Suma asegurada ATRIBUIDA por imputación (R4-B) — misma regla que el backend
// (backend/src/modules/policies/insured-attribution.ts), probada con el mismo
// fixture (test-fixtures/insured-attribution.json):
// - sin filtro de empresa / centro de costo, cada línea aporta completa (importe contractual);
// - línea con activo: aporta (Σ % de las asignaciones que cumplen TODOS los
//   filtros) / 100 — porcentajes en escala 0–100, topeado en 100 % si un dato
//   inválido (duplicado) lo supera, sin normalizar los incompletos;
// - línea sin activo: completa si su propia empresa / centro de costo cumplen;
// - activo sin asignaciones: con filtros no aporta a ninguna empresa.
// El importe contratado de la línea nunca se modifica: esto solo calcula qué
// parte corresponde a un alcance.

export interface AttributionFilters {
  companyIds?: string[]
  costCenterId?: string
}

export interface AllocationShare {
  companyId: string
  costCenterId: string
  percentage: number
}

export function hasAllocationFilters(filters: AttributionFilters): boolean {
  return Boolean(filters.companyIds?.length) || Boolean(filters.costCenterId)
}

export function allocationIssueAssetLabels(
  assetIds: string[],
  assets: Pick<Asset, 'id' | 'internalCode' | 'name'>[],
): string {
  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const labels = assetIds.flatMap((id) => {
    const asset = assetById.get(id)
    return asset ? [asset.internalCode ? `${asset.internalCode} (${asset.name})` : asset.name] : []
  })
  const missingCount = assetIds.length - labels.length
  const visibleLabels = labels.slice(0, 5)
  if (labels.length > 5) visibleLabels.push(`y ${labels.length - 5} más`)
  if (missingCount > 0) visibleLabels.push(`${missingCount} sin detalle cargado`)
  return visibleLabels.join(', ')
}

function matchesFilters(filters: AttributionFilters, companyId: string | null | undefined, costCenterId: string | null | undefined): boolean {
  const companyOk = !filters.companyIds?.length || (companyId != null && filters.companyIds.includes(companyId))
  const costCenterOk = !filters.costCenterId || costCenterId === filters.costCenterId
  return companyOk && costCenterOk
}

/** Fracción (0–1) de la línea que corresponde al alcance de imputación. */
export function lineAttributionShare(
  line: { assetId: string | null; companyId?: string | null; costCenterId?: string | null },
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
