// Código interno visible de un activo: el `code` asignado por el sistema
// (ACT-XXXXX) o, para activos legacy sin código, un derivado estable del id.
export function assetInternalCode(asset: { id: string; code: string | null }): string {
  return asset.code ?? `ACT-${asset.id.slice(0, 8).toUpperCase()}`
}
