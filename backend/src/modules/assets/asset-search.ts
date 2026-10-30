import type { Prisma } from '@prisma/client'
import { normalizeLicensePlate } from '../../shared/utils/normalize'

// Criterio de búsqueda de activos compartido por el selector de los
// formularios (assetsService.search) y el buscador global del Topbar
// (search.service.ts) — un solo lugar decide por qué campos se encuentra un
// activo. Cada caller suma su propio alcance encima (el selector, solo
// activos asociables; el buscador global, todos, incluidos los de baja).

// Los campos de metadata se guardan con el casing que cargó el usuario y el
// filtro JSON de Prisma es case-sensitive — se prueban las tres variantes.
function metadataSearchTerms(q: string): string[] {
  return [...new Set([q, q.toUpperCase(), q.toLowerCase()])]
}

function metadataRecord(metadata: Prisma.JsonValue | null): Record<string, unknown> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {}
}

export function buildAssetSearchWhere(q: string): Prisma.AssetWhereInput {
  if (!q) return {}
  const normalizedPlate = normalizeLicensePlate(q)
  return {
    OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
      { model: { contains: q, mode: 'insensitive' } },
      { serialNumber: { contains: q, mode: 'insensitive' } },
      ...(normalizedPlate ? [{ licensePlateNormalized: { contains: normalizedPlate } }] : []),
      ...metadataSearchTerms(q).flatMap((term) => [
        { metadata: { path: ['plate'], string_contains: term } },
        { metadata: { path: ['chassisNumber'], string_contains: term } },
        { metadata: { path: ['engineNumber'], string_contains: term } },
      ]),
      { fixedAssetCode: { contains: q, mode: 'insensitive' } },
      { fixedAsset: { is: { code: { contains: q, mode: 'insensitive' } } } },
      { fixedAsset: { is: { name: { contains: q, mode: 'insensitive' } } } },
    ],
  }
}

// Identificadores del activo (código, serie, patente, chasis, motor) — el
// buscador global los antepone a las coincidencias parciales. Cada
// condición es un caso particular de buildAssetSearchWhere, así que toda
// coincidencia exacta también es parcial.
export function buildAssetExactMatchWhere(q: string): Prisma.AssetWhereInput {
  const normalizedPlate = normalizeLicensePlate(q)
  return {
    OR: [
      { code: { equals: q, mode: 'insensitive' } },
      { serialNumber: { equals: q, mode: 'insensitive' } },
      ...(normalizedPlate ? [{ licensePlateNormalized: normalizedPlate }] : []),
      ...metadataSearchTerms(q).flatMap((term) => [
        { metadata: { path: ['plate'], equals: term } },
        { metadata: { path: ['chassisNumber'], equals: term } },
        { metadata: { path: ['engineNumber'], equals: term } },
      ]),
    ],
  }
}

export function isAssetExactMatch(
  asset: {
    code: string | null
    serialNumber: string | null
    licensePlateNormalized: string | null
    metadata: Prisma.JsonValue | null
  },
  q: string,
): boolean {
  const needle = q.toLowerCase()
  const metadata = metadataRecord(asset.metadata)
  const normalizedPlate = normalizeLicensePlate(q)
  const identifiers = [asset.code, asset.serialNumber, metadata.plate, metadata.chassisNumber, metadata.engineNumber]
  return (
    identifiers.some((value) => typeof value === 'string' && value.toLowerCase() === needle) ||
    (!!normalizedPlate && asset.licensePlateNormalized === normalizedPlate)
  )
}

export const ASSET_SEARCH_SELECT = {
  id: true,
  code: true,
  name: true,
  assetType: true,
  status: true,
  metadata: true,
  fixedAssetCode: true,
  fixedAsset: { select: { code: true, name: true } },
} satisfies Prisma.AssetSelect

type AssetSearchRow = Prisma.AssetGetPayload<{ select: typeof ASSET_SEARCH_SELECT }>

export function mapAssetSearchResult(asset: AssetSearchRow) {
  const metadata = metadataRecord(asset.metadata)
  return {
    id: asset.id,
    name: asset.name,
    code: asset.code,
    status: asset.status,
    assetType: asset.assetType,
    plate: typeof metadata.plate === 'string' ? metadata.plate : null,
    fixedAssetCode: asset.fixedAsset?.code ?? asset.fixedAssetCode,
    fixedAssetName: asset.fixedAsset?.name ?? null,
  }
}
