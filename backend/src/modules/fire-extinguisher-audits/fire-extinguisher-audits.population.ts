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
  asset: { assetType: string; fireExtinguisherAuditable: boolean } | null
}

interface ExtinguisherScopeFields extends ExtinguisherPopulationFields {
  establishment: string | null
}

// true si `fe` pertenece a la población pedida. Un matafuego "pertenece" a
// ASSET si está vinculado a un Asset clasificado como vehículo/maquinaria
// (classifyAssetType) Y ese activo tiene el tilde `fireExtinguisherAuditable`
// — un vehículo con matafuego pero sin el tilde (ej. está en otro lugar, no
// corresponde auditarlo este ciclo) queda AFUERA de las dos auditorías, no
// cae en ESTABLISHMENT por descarte: sigue siendo un matafuego de vehículo,
// no de edificio. Un matafuego "pertenece" a ESTABLISHMENT en caso contrario
// (no vinculado a vehículo/maquinaria en absoluto).
export function matchesAuditPopulation(fe: ExtinguisherPopulationFields, population: FireExtAuditPopulation): boolean {
  const linkedToVehicleOrMachinery = !!fe.assetId && !!fe.asset && classifyAssetType(fe.asset.assetType) !== null
  if (population === 'ASSET') return linkedToVehicleOrMachinery && !!fe.asset?.fireExtinguisherAuditable
  return !linkedToVehicleOrMachinery
}

// La categoría de activo (una de las 9 AUDITABLE_ASSET_CATEGORIES) para
// población ASSET — usada solo para MOSTRAR/agrupar en la UI (ver
// fire-extinguisher-audits.service.ts#getCoverage). NO usar para el chequeo
// de alcance — ver auditScopeMatchValueFor.
export function auditScopeKeyFor(fe: ExtinguisherScopeFields, population: FireExtAuditPopulation): string | null {
  return population === 'ESTABLISHMENT' ? fe.establishment : fe.asset ? classifyAuditableAssetCategory(fe.asset.assetType) : null
}

// El valor real contra el que se compara UserAuditScope.scopeValue para
// decidir si un matafuego está en el alcance del usuario: establecimiento
// para ESTABLISHMENT (sin cambios), el propio assetId para ASSET — la
// asignación de Auditoría de Rodados es por activo individual, no por
// categoría (ver asset-audits-assignments.service.ts). Deliberadamente
// distinta de auditScopeKeyFor, que sigue siendo la categoría para mostrar.
export function auditScopeMatchValueFor(fe: ExtinguisherScopeFields, population: FireExtAuditPopulation): string | null {
  return population === 'ESTABLISHMENT' ? fe.establishment : fe.assetId
}
