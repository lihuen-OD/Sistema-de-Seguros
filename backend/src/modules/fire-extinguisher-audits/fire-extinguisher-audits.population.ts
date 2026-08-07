import { classifyAssetType } from '../fire-extinguishers/asset-type-classification'
import { classifyAuditableAssetCategory } from '../asset-audits/asset-audit-category-classification'

// FireExtinguisherAudit sirve a dos poblaciones de FireExtinguisher, nunca
// mezcladas en una misma consulta: ESTABLISHMENT (matafuegos de edificio,
// "Auditoría de Matafuegos", alcance por establecimiento) y ASSET
// (matafuegos montados en un vehículo/maquinaria, "Auditoría de Activos",
// alcance por categoría de activo). La población nunca se guarda como
// columna — se deriva siempre de `assetId` + `classifyAssetType()`.
export const FIRE_EXT_AUDIT_POPULATIONS = ['ESTABLISHMENT', 'ASSET'] as const
export type FireExtAuditPopulation = (typeof FIRE_EXT_AUDIT_POPULATIONS)[number]

interface ExtinguisherPopulationFields {
  assetId: string | null
  asset: { assetType: string; auditable: boolean } | null
}

interface ExtinguisherScopeFields extends ExtinguisherPopulationFields {
  establishment: string | null
}

// true si `fe` pertenece a la población pedida. Un matafuego "pertenece" a
// ASSET si está vinculado a un Asset clasificado como vehículo/maquinaria
// (classifyAssetType) Y ese activo tiene el tilde `auditable` — un vehículo
// con matafuego pero sin el tilde (ej. está en otro lugar, no corresponde
// auditarlo este ciclo) queda AFUERA de las dos auditorías, no cae en
// ESTABLISHMENT por descarte: sigue siendo un matafuego de vehículo, no de
// edificio. Un matafuego "pertenece" a ESTABLISHMENT en caso contrario (no
// vinculado a vehículo/maquinaria en absoluto).
export function matchesAuditPopulation(fe: ExtinguisherPopulationFields, population: FireExtAuditPopulation): boolean {
  const linkedToVehicleOrMachinery = !!fe.assetId && !!fe.asset && classifyAssetType(fe.asset.assetType) !== null
  if (population === 'ASSET') return linkedToVehicleOrMachinery && !!fe.asset?.auditable
  return !linkedToVehicleOrMachinery
}

// La dimensión de alcance (UserAuditScope.scopeValue) que corresponde según
// la población: establecimiento para ESTABLISHMENT, categoría de activo (una
// de las 9 AUDITABLE_ASSET_CATEGORIES) para ASSET.
export function auditScopeKeyFor(fe: ExtinguisherScopeFields, population: FireExtAuditPopulation): string | null {
  return population === 'ESTABLISHMENT' ? fe.establishment : fe.asset ? classifyAuditableAssetCategory(fe.asset.assetType) : null
}
