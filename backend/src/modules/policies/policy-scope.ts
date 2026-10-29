import type { Prisma } from '@prisma/client'
import type { ListPoliciesQueryDTO } from './policies.schemas'

// Alcance del Dashboard general (empresa / centro de costo / tipo de activo),
// mismo criterio que su filtro en memoria (DashboardPage): cada LÍNEA de
// cobertura se imputa por su propia empresa/centro de costo si es "sin
// activo", o por las asignaciones (AssetAllocation) del activo cubierto.
//
// Una sola definición, a nivel línea, para los dos usos:
// - el listado/conteos: una póliza entra si tiene alguna línea que cumple
//   cada condición (buildScopeConditions — comportamiento de siempre);
// - la suma asegurada activa (summarize): solo suman las líneas que cumplen
//   TODAS las condiciones (buildScopeLineConditions). Que una línea de la
//   póliza esté en alcance no habilita a sumar las demás.
//
// Un activo compartido entre empresas (asignaciones 60/40) entra completo en
// el alcance de cada una — membresía, no prorrateo por porcentaje, igual que
// el filtro de pólizas.

type ScopeQuery = Pick<ListPoliciesQueryDTO, 'scopeCompanyIds' | 'scopeCostCenterId' | 'scopeAssetType'>

/** Una condición por filtro activo, sobre PolicyAssetCoverage. */
export function buildScopeLineConditions(query: ScopeQuery): Prisma.PolicyAssetCoverageWhereInput[] {
  const conditions: Prisma.PolicyAssetCoverageWhereInput[] = []
  const companyIds = query.scopeCompanyIds?.length ? query.scopeCompanyIds : undefined
  if (companyIds) {
    conditions.push({
      OR: [
        { assetId: null, companyId: { in: companyIds } },
        { asset: { is: { allocations: { some: { companyId: { in: companyIds } } } } } },
      ],
    })
  }
  if (query.scopeCostCenterId) {
    conditions.push({
      OR: [
        { assetId: null, costCenterId: query.scopeCostCenterId },
        {
          asset: {
            is: {
              allocations: {
                some: { costCenterId: query.scopeCostCenterId, ...(companyIds && { companyId: { in: companyIds } }) },
              },
            },
          },
        },
      ],
    })
  }
  if (query.scopeAssetType) {
    conditions.push({ asset: { is: { assetType: query.scopeAssetType } } })
  }
  return conditions
}

/**
 * Las mismas condiciones a nivel póliza: cada una es una cláusula propia dentro
 * de un AND, así no pisan la clave `coverages` de los filtros existentes.
 */
export function buildScopeConditions(query: ScopeQuery): Prisma.PolicyWhereInput[] {
  return buildScopeLineConditions(query).map((line) => ({ coverages: { some: line } }))
}
