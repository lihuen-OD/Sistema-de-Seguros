import { normalizeAssetType } from '../fire-extinguishers/asset-type-classification'
import type { AuditableAssetCategory } from '../../shared/types'

// Clasificación fina (una de las 9 AUDITABLE_ASSET_CATEGORIES) a partir del
// `Asset.assetType` libre — a diferencia de classifyAssetType() (que solo
// distingue vehículo/maquinaria para excluir matafuegos de vehículos), esta
// necesita el detalle real de categoría para el alcance de auditoría por
// categoría (UserAuditScope, área ASSET_AUDIT/INSURANCE_AUDIT).
const NORMALIZED_TO_CATEGORY: Record<string, AuditableAssetCategory> = {
  vehiculo: 'vehiculo',
  camioneta: 'camioneta',
  camion: 'camion',
  transportedepasajeros: 'transporte_pasajeros',
  tractor: 'tractor',
  cosechadora: 'cosechadora',
  pulverizadora: 'pulverizadora',
  implemento: 'implemento',
  implementoagricola: 'implemento',
  maquinaria: 'maquinaria',
  maquinariaagricola: 'maquinaria',
}

export function classifyAuditableAssetCategory(assetType: string): AuditableAssetCategory | null {
  return NORMALIZED_TO_CATEGORY[normalizeAssetType(assetType)] ?? null
}
