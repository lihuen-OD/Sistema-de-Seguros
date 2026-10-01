import { prisma } from '../../config/database'

export interface PrimaryAllocationCounts {
  byCompany: Map<string, number>
  byCostCenter: Map<string, number>
}

// Activos en estado 'activo' por empresa y por centro de costo de su
// imputación PRINCIPAL (la de mayor porcentaje) — misma regla que usaban
// CompaniesPage/CostCentersPage en el frontend (companyId/costCenterId de
// allocations[0] en mapAsset, ordenadas por percentage desc), pero sobre
// todos los activos y no sobre /assets?limit=200. Un activo repartido entre
// varias empresas cuenta solo para la mayoritaria, así que los conteos por
// empresa suman el total de activos imputados (regla confirmada, Fase 3D).
//
// "La de mayor porcentaje por activo" no se puede expresar con Prisma
// (groupBy/_count), así que es una sola query SQL: DISTINCT ON por activo y
// GROUP BY sobre el resultado — devuelve como mucho una fila por par
// empresa/centro de costo, nunca las imputaciones crudas. Sin input del
// usuario. id desempata imputaciones con el mismo porcentaje (mismo orden
// que ASSET_LIST_INCLUDE en assets.service.ts).
export async function countActiveAssetsByPrimaryAllocation(): Promise<PrimaryAllocationCounts> {
  const rows = await prisma.$queryRaw<{ companyId: string; costCenterId: string; count: bigint }[]>`
    SELECT p."companyId", p."costCenterId", COUNT(*)::bigint AS count
    FROM (
      SELECT DISTINCT ON (aa."assetId") aa."companyId", aa."costCenterId"
      FROM asset_allocations aa
      JOIN assets a ON a.id = aa."assetId"
      WHERE a.status = 'activo'
      ORDER BY aa."assetId", aa.percentage DESC, aa.id ASC
    ) p
    GROUP BY p."companyId", p."costCenterId"
  `

  const byCompany = new Map<string, number>()
  const byCostCenter = new Map<string, number>()
  for (const row of rows) {
    const count = Number(row.count)
    byCompany.set(row.companyId, (byCompany.get(row.companyId) ?? 0) + count)
    byCostCenter.set(row.costCenterId, (byCostCenter.get(row.costCenterId) ?? 0) + count)
  }
  return { byCompany, byCostCenter }
}
