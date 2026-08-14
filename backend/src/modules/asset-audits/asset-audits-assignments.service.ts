import { prisma } from '../../config/database'
import {
  classifyAuditableAssetCategory,
  getAuditAssetAssignments,
  saveAuditAssetAssignment,
  type AssignableAssetRef,
} from '../../shared/services/audit-domain.service'
import { matchesAuditPopulation } from '../fire-extinguisher-audits/fire-extinguisher-audits.population'

// Asignación por activo individual para Auditoría de Rodados — reemplaza a
// la asignación por categoría (ver fire-extinguisher-audits.population.ts#
// auditScopeMatchValueFor): dos auditores de la misma categoría (ej.
// "camioneta") pueden repartirse vehículos puntuales en vez de ver todos los
// de la categoría. Vive fuera del motor compartido de fire-extinguisher-audits
// porque es lógica exclusiva de esta población, no del ciclo de vida de las
// auditorías en sí.
export const assetAuditsAssignmentsService = {
  async getAssignments() {
    return getAuditAssetAssignments('asset_audit_coverage', 'ASSET_AUDIT', fetchCandidateAssets)
  },

  async saveAssignment(userId: string, assetIds: string[]) {
    await saveAuditAssetAssignment(userId, assetIds, 'ASSET_AUDIT', fetchValidAssetIds)
  },
}

// Mismo criterio de elegibilidad que Cobertura (getCoverage, población
// ASSET, en fire-extinguisher-audits.service.ts): un activo con el tilde
// fireExtinguisherAuditable pero SIN ningún matafuego activo vinculado
// nunca aparece en Cobertura — asignarlo acá sería engañoso, el auditor
// jamás lo va a ver para auditar.
async function fetchCandidateAssets(): Promise<AssignableAssetRef[]> {
  const fireExtinguishers = await prisma.fireExtinguisher.findMany({
    where: { isActive: true },
    select: {
      assetId: true,
      asset: { select: { id: true, code: true, name: true, assetType: true, fireExtinguisherAuditable: true, metadata: true } },
    },
  })
  const assetsById = new Map<string, NonNullable<(typeof fireExtinguishers)[number]['asset']>>()
  for (const fe of fireExtinguishers) {
    if (!fe.asset || !matchesAuditPopulation(fe, 'ASSET')) continue
    if (!assetsById.has(fe.asset.id)) assetsById.set(fe.asset.id, fe.asset)
  }
  return [...assetsById.values()].sort((a, b) => a.assetType.localeCompare(b.assetType) || a.name.localeCompare(b.name))
}

async function fetchValidAssetIds(assetIds: string[]): Promise<Set<string>> {
  const found = await prisma.fireExtinguisher.findMany({
    where: { isActive: true, assetId: { in: assetIds } },
    select: { assetId: true, asset: { select: { assetType: true, fireExtinguisherAuditable: true } } },
  })
  return new Set(
    found
      .filter((fe) => matchesAuditPopulation(fe, 'ASSET') && classifyAuditableAssetCategory(fe.asset!.assetType) !== null)
      .map((fe) => fe.assetId!),
  )
}
