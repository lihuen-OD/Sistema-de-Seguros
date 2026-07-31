import type { Asset } from '../types'

// Texto adicional (nunca mostrado, solo para filtrar) que le da a los
// selectores de activos más para buscar además de nombre/código — patente,
// bien de uso, chasis, motor, etc. — sin ensuciar la etiqueta visible del
// selector con todos estos datos.
export function buildAssetSearchKeywords(asset: Asset): string {
  return [
    asset.plate,
    asset.serialNumber,
    asset.chassisNumber,
    asset.engineNumber,
    asset.brand,
    asset.model,
    asset.assetType,
    asset.fixedAsset?.code,
    asset.fixedAsset?.name,
    asset.productiveUnit,
    asset.area,
  ]
    .filter(Boolean)
    .join(' ')
}
