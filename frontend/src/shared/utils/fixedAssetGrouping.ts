import type { Asset } from '../types'
import { UNASSIGNED_FIXED_ASSET_LABEL } from './insuranceDashboardCalc'

// Agrupación "Bien de uso" de los Análisis Financiero y Económico.
//
// La relación es la existente Asset.fixedAssetId → FixedAsset (un activo
// tiene como mucho un bien de uso). Cada asignación (línea de cobertura) ya
// se resuelve a un único activo, así que cae en exactamente UNA fila — nunca
// se duplica ni se prorratea. Para no perder importes, lo que no tiene bien
// de uso va a filas propias en vez de descartarse:
// - activo sin bien de uso asignado → "Sin Bien de Uso asignado";
// - línea de póliza sin activo (ej. RC general) → "Líneas sin activo".
// Se agrupa por id (no por nombre): dos bienes de uso con el mismo nombre
// siguen siendo filas distintas.

export const NO_FIXED_ASSET_ROW_ID = '__sin_bien_de_uso__'
export const NO_ASSET_LINE_ROW_ID = '__linea_sin_activo__'

/** Fila "Bien de uso" a la que va una asignación, según su activo. */
export function fixedAssetRowIdOf(assetId: string | null, assetById: Map<string, Asset>): string {
  if (!assetId) return NO_ASSET_LINE_ROW_ID
  return assetById.get(assetId)?.fixedAssetId ?? NO_FIXED_ASSET_ROW_ID
}

/**
 * Filas de la agrupación: cada bien de uso referenciado por algún activo
 * (ordenado por código), más las dos filas "sin" al final — siempre
 * presentes, igual que las demás agrupaciones muestran sus filas en cero.
 */
export function fixedAssetRows(assets: Asset[]): { id: string; label: string; sublabel?: string }[] {
  const byId = new Map<string, { code: string; name: string; assetCount: number }>()
  for (const asset of assets) {
    if (!asset.fixedAssetId) continue
    const entry = byId.get(asset.fixedAssetId) ?? {
      code: asset.fixedAsset?.code ?? '',
      name: asset.fixedAsset?.name?.trim() || 'Bien de uso',
      assetCount: 0,
    }
    entry.assetCount += 1
    byId.set(asset.fixedAssetId, entry)
  }
  const rows = [...byId.entries()]
    .sort(([, a], [, b]) => a.code.localeCompare(b.code, 'es') || a.name.localeCompare(b.name, 'es'))
    .map(([id, fa]) => ({
      id,
      label: fa.name,
      sublabel: `${fa.code ? `${fa.code} · ` : ''}${fa.assetCount} activo${fa.assetCount !== 1 ? 's' : ''}`,
    }))
  return [
    ...rows,
    { id: NO_FIXED_ASSET_ROW_ID, label: UNASSIGNED_FIXED_ASSET_LABEL, sublabel: 'Activos sin bien de uso' },
    { id: NO_ASSET_LINE_ROW_ID, label: 'Líneas sin activo', sublabel: 'Coberturas de póliza sin activo asociado' },
  ]
}
