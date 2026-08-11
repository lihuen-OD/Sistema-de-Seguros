import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { replaceUserAuditScope } from '../../shared/services/audit-scope.service'
import { matchesAuditPopulation } from '../fire-extinguisher-audits/fire-extinguisher-audits.population'
import { classifyAuditableAssetCategory } from './asset-audit-category-classification'

// Patente/chasis/motor viven en Asset.metadata, no son columnas propias —
// mismo criterio que insurance-audits.service.ts#extractVehicleMeta.
function extractVehicleMeta(metadata: unknown): { plate: string | null; chassisNumber: string | null; engineNumber: string | null } {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  return {
    plate: asString(meta.plate),
    chassisNumber: asString(meta.chassisNumber),
    engineNumber: asString(meta.engineNumber),
  }
}

// Asignación por activo individual para Auditoría de Rodados — reemplaza a
// la asignación por categoría (ver fire-extinguisher-audits.population.ts#
// auditScopeMatchValueFor): dos auditores de la misma categoría (ej.
// "camioneta") pueden repartirse vehículos puntuales en vez de ver todos los
// de la categoría. Vive fuera del motor compartido de fire-extinguisher-audits
// porque es lógica exclusiva de esta población, no del ciclo de vida de las
// auditorías en sí.
export const assetAuditsAssignmentsService = {
  async getAssignments() {
    const [auditors, fireExtinguishers, scopes] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true, accessProfile: { modules: { has: 'asset_audit_coverage' } } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
      // Mismo criterio de elegibilidad que Cobertura (getCoverage, población
      // ASSET, en fire-extinguisher-audits.service.ts): un activo con el
      // tilde fireExtinguisherAuditable pero SIN ningún matafuego activo
      // vinculado nunca aparece en Cobertura — asignarlo acá sería engañoso,
      // el auditor jamás lo va a ver para auditar.
      prisma.fireExtinguisher.findMany({
        where: { isActive: true },
        select: {
          assetId: true,
          asset: { select: { id: true, code: true, name: true, assetType: true, fireExtinguisherAuditable: true, metadata: true } },
        },
      }),
      prisma.userAuditScope.findMany({
        where: { area: 'ASSET_AUDIT' },
        select: { userId: true, scopeValue: true },
      }),
    ])

    const assetIdsByUser = new Map<string, string[]>()
    for (const s of scopes) {
      const list = assetIdsByUser.get(s.userId)
      if (list) list.push(s.scopeValue)
      else assetIdsByUser.set(s.userId, [s.scopeValue])
    }

    const assetsById = new Map<string, NonNullable<(typeof fireExtinguishers)[number]['asset']>>()
    for (const fe of fireExtinguishers) {
      if (!fe.asset || !matchesAuditPopulation(fe, 'ASSET')) continue
      if (!assetsById.has(fe.asset.id)) assetsById.set(fe.asset.id, fe.asset)
    }

    const auditableAssets = [...assetsById.values()]
    const eligibleAssets = auditableAssets
      .map((asset) => ({ asset, category: classifyAuditableAssetCategory(asset.assetType) }))
      .filter((x): x is { asset: typeof auditableAssets[number]; category: NonNullable<typeof x.category> } => x.category !== null)
      .sort((a, b) => a.asset.assetType.localeCompare(b.asset.assetType) || a.asset.name.localeCompare(b.asset.name))

    // Un activo puede haber quedado asignado antes de perder elegibilidad
    // (se le quitó el tilde, se dio de baja su único matafuego, etc.) — no
    // mostrarlo como asignado ni devolverlo, porque tampoco se puede
    // desmarcar desde la UI (ni aparece ahí). Se limpia solo la próxima vez
    // que se guarde la asignación de ese usuario (ver saveAssignment).
    const eligibleAssetIds = new Set(eligibleAssets.map((x) => x.asset.id))

    return {
      auditors: auditors.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        assetIds: (assetIdsByUser.get(u.id) ?? []).filter((id) => eligibleAssetIds.has(id)),
      })),
      assets: eligibleAssets.map(({ asset, category }) => ({
        id: asset.id,
        code: asset.code,
        name: asset.name,
        assetType: asset.assetType,
        category,
        ...extractVehicleMeta(asset.metadata),
      })),
    }
  },

  async saveAssignment(userId: string, assetIds: string[]) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')

    // Se descarta en silencio lo que ya no es elegible en vez de rechazar
    // todo el guardado — el checklist de la UI solo puede enviar activos
    // elegibles, así que un id no elegible acá solo puede ser un resabio de
    // una asignación vieja (activo que perdió el tilde o se le dio de baja
    // el matafuego después de haber sido asignado) o una carrera con otro
    // cambio — nunca algo que el admin eligió a propósito. Bloquear todo el
    // guardado dejaría al admin sin forma de sacar ese resabio, porque
    // tampoco aparece en la UI para desmarcarlo.
    let validAssetIds = assetIds
    if (assetIds.length > 0) {
      const found = await prisma.fireExtinguisher.findMany({
        where: { isActive: true, assetId: { in: assetIds } },
        select: { assetId: true, asset: { select: { assetType: true, fireExtinguisherAuditable: true } } },
      })
      const validIds = new Set(
        found
          .filter((fe) => matchesAuditPopulation(fe, 'ASSET') && classifyAuditableAssetCategory(fe.asset!.assetType) !== null)
          .map((fe) => fe.assetId!),
      )
      validAssetIds = assetIds.filter((id) => validIds.has(id))
    }

    await replaceUserAuditScope(userId, 'ASSET_AUDIT', validAssetIds)
  },
}
