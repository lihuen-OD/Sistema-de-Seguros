import { normalizeAssetType } from '../fire-extinguishers/asset-type-classification'

const PLEDGE_ELIGIBLE_ASSET_TYPES = new Set([
  'vehiculo',
  'camioneta',
  'camion',
  'moto',
  'transportepasajeros',
  'transportedepasajeros',
  'tractor',
  'cosechadora',
  'pulverizadora',
  'implemento',
  'implementoagricola',
  'maquinaria',
  'maquinariaagricola',
])

// Deny-by-default: tipos desconocidos o ambiguos nunca habilitan prendas.
export function isPledgeEligibleAssetType(assetType: string): boolean {
  return PLEDGE_ELIGIBLE_ASSET_TYPES.has(normalizeAssetType(assetType))
}
