import type { AssetCategory, Silo } from '../types'
import { CATEGORY_LABEL } from '../constants/asset-categories'

// Subconjunto de campos de formulario que buildMetadata necesita — tanto
// AssetNewPage como AssetEditPage tienen estos mismos campos (con más nombres
// propios de cada uno, que no hacen falta acá).
export interface AssetMetadataFormFields {
  chassisNumber: string
  plate: string
  engineNumber: string
  color: string
  fuelType: string
  powerHp: string
  cutWidth: string
  tankCapacity: string
  workWidth: string
  implementType: string
  surfaceM2: string
  buildingPurpose: string
  constructionType: string
  floors: string
  constructionYear: string
  address: string
  surfaceHa: string
  province: string
  locality: string
  cadastralReference: string
  landUse: string
  irrigatedSurfaceHa: string
  forestedSurfaceHa: string
  infraType: string
  infraCapacityTons: string
  infraContent: string
  technicalSpec: string
}

// Igual que EstBuilding (modules/assets/components/EstBuildingsSection.tsx) —
// se redeclara acá en vez de importarla para no crear una dependencia de
// shared/ hacia un componente de módulo; cualquier EstBuilding real ya
// cumple esta forma.
export interface AssetMetadataBuilding {
  name: string
  surfaceM2: string
  purpose: string
  constructionType: string
  constructionYear: string
}

// Categorías reusadas tanto por buildMetadata (qué campos persistir) como por
// buildAssetDifferentiator (qué campo mostrar para diferenciar) — una sola
// lista evita que las dos clasificaciones se desincronicen.
export const VEHICLE_TYPES = ['vehiculo', 'camioneta', 'camion', 'moto', 'transporte_pasajeros']
export const HEAVY_MACHINERY_TYPES = ['tractor', 'cosechadora', 'pulverizadora']

// Mapea la categoría de activo a su metadata específica (Asset.metadata,
// JSON libre) — misma lógica que antes vivía duplicada en AssetNewPage.tsx y
// AssetEditPage.tsx. Devuelve solo los campos con valor (nunca claves vacías).
export function buildMetadata(
  category: AssetCategory | '',
  form: AssetMetadataFormFields,
  buildings: AssetMetadataBuilding[],
  silos: Silo[],
): Record<string, unknown> {
  const opt = (v: string) => v.trim() || undefined
  const num = (v: string) => v ? parseFloat(v) : undefined
  const int = (v: string) => v ? parseInt(v, 10) : undefined

  if (VEHICLE_TYPES.includes(category)) {
    return {
      ...(opt(form.chassisNumber) && { chassisNumber: form.chassisNumber.trim() }),
      ...(opt(form.plate) && { plate: form.plate.trim() }),
      ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
      ...(opt(form.color) && { color: form.color.trim() }),
      ...(opt(form.fuelType) && { fuelType: form.fuelType }),
    }
  }
  if (HEAVY_MACHINERY_TYPES.includes(category)) {
    return {
      ...(opt(form.plate) && { plate: form.plate.trim() }),
      ...(opt(form.engineNumber) && { engineNumber: form.engineNumber.trim() }),
      ...(num(form.powerHp) !== undefined && { powerHp: num(form.powerHp) }),
      ...(num(form.cutWidth) !== undefined && { cutWidth: num(form.cutWidth) }),
      ...(num(form.tankCapacity) !== undefined && { tankCapacity: num(form.tankCapacity) }),
      ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
    }
  }
  if (category === 'implemento') {
    return {
      ...(opt(form.plate) && { plate: form.plate.trim() }),
      ...(opt(form.implementType) && { implementType: form.implementType }),
      ...(num(form.workWidth) !== undefined && { workWidth: num(form.workWidth) }),
    }
  }
  if (category === 'edificio') {
    return {
      ...(num(form.surfaceM2) !== undefined && { surfaceM2: num(form.surfaceM2) }),
      ...(opt(form.buildingPurpose) && { buildingPurpose: form.buildingPurpose }),
      ...(opt(form.constructionType) && { constructionType: form.constructionType.trim() }),
      ...(int(form.floors) !== undefined && { floors: int(form.floors) }),
      ...(int(form.constructionYear) !== undefined && { constructionYear: int(form.constructionYear) }),
      ...(opt(form.address) && { address: form.address.trim() }),
    }
  }
  if (category === 'establecimiento') {
    return {
      ...(num(form.surfaceHa) !== undefined && { surfaceHa: num(form.surfaceHa) }),
      ...(opt(form.province) && { province: form.province }),
      ...(opt(form.locality) && { locality: form.locality.trim() }),
      ...(opt(form.address) && { address: form.address.trim() }),
      ...(buildings.length > 0 && {
        buildings: buildings.map((b) => ({
          name: b.name,
          ...(b.surfaceM2 && { surfaceM2: parseFloat(b.surfaceM2) }),
          ...(b.purpose && { purpose: b.purpose }),
          ...(b.constructionType && { constructionType: b.constructionType }),
          ...(b.constructionYear && { constructionYear: parseInt(b.constructionYear, 10) }),
        })),
      }),
      ...(silos.length > 0 && {
        silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
      }),
    }
  }
  if (category === 'campo_terreno') {
    return {
      ...(num(form.surfaceHa) !== undefined && { surfaceHa: num(form.surfaceHa) }),
      ...(opt(form.province) && { province: form.province }),
      ...(opt(form.locality) && { locality: form.locality.trim() }),
      ...(opt(form.address) && { address: form.address.trim() }),
      ...(opt(form.cadastralReference) && { cadastralReference: form.cadastralReference.trim() }),
      ...(opt(form.landUse) && { landUse: form.landUse }),
      ...(num(form.irrigatedSurfaceHa) !== undefined && { irrigatedSurfaceHa: num(form.irrigatedSurfaceHa) }),
      ...(num(form.forestedSurfaceHa) !== undefined && { forestedSurfaceHa: num(form.forestedSurfaceHa) }),
    }
  }
  if (category === 'infraestructura') {
    return {
      ...(opt(form.infraType) && { infraType: form.infraType }),
      ...(num(form.infraCapacityTons) !== undefined && { infraCapacityTons: num(form.infraCapacityTons) }),
      ...(opt(form.infraContent) && { infraContent: form.infraContent }),
      ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
      ...(silos.length > 0 && {
        silos: silos.map((s) => ({ capacityTons: s.capacityTons, content: s.content })),
      }),
    }
  }
  if (['equipo', 'maquinaria'].includes(category)) {
    return {
      ...(opt(form.technicalSpec) && { technicalSpec: form.technicalSpec.trim() }),
    }
  }
  return {}
}

interface AssetLabelFallback {
  brand?: string | null
  model?: string | null
}

// assetType es String libre en el schema (no enum) — datos cargados fuera
// del flujo normal de alta (import, seed, catálogo viejo) pueden traer la
// etiqueta visible ("Transporte de pasajeros") en vez de la clave interna
// ("transporte_pasajeros"), con o sin acentos/mayúsculas/espacios. Mismo
// enfoque que normalizeAssetType en el backend
// (backend/src/modules/fire-extinguishers/asset-type-classification.ts):
// se resuelve contra el propio CATEGORY_LABEL (única fuente de verdad
// clave↔etiqueta) en vez de adivinar variantes categoría por categoría —
// buildMetadata no lo necesita porque solo recibe la clave interna, siempre
// controlada por el <select> del formulario de alta/edición.
const ASSET_TYPE_ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

function normalizeAssetTypeValue(value: string): string {
  const lower = value.toLowerCase()
  let result = ''
  for (const ch of lower) result += ASSET_TYPE_ACCENTS[ch] ?? ch
  return result.replace(/[^a-z0-9]/g, '')
}

const CATEGORY_BY_NORMALIZED_VALUE: Record<string, AssetCategory> = Object.fromEntries(
  (Object.entries(CATEGORY_LABEL) as [AssetCategory, string][]).flatMap(([key, label]) => [
    [normalizeAssetTypeValue(key), key],
    [normalizeAssetTypeValue(label), key],
  ]),
)

function resolveAssetCategory(assetType: string): AssetCategory | undefined {
  return CATEGORY_BY_NORMALIZED_VALUE[normalizeAssetTypeValue(assetType)]
}

// Lado lectura de la misma clasificación por assetType que buildMetadata usa
// del lado escritura — dado que Asset.metadata es JSON libre sin columnas
// dedicadas por tipo, decide qué dato mostrar para diferenciar activos que
// comparten nombre o Bien de Uso (que no es único por activo, ver
// PolicySelector.tsx). Devuelve null si el activo no tiene cargado ningún
// dato específico de su tipo — a propósito no cae a un código interno como
// último recurso: un código autogenerado (ACT-XXXXX) no es un dato útil para
// identificar el activo a simple vista, mejor no mostrar nada de más.
export function buildAssetDifferentiator(
  assetType: string,
  metadata: Record<string, unknown> | null | undefined,
  fallback: AssetLabelFallback = {},
): string | null {
  const meta = metadata ?? {}
  const category = resolveAssetCategory(assetType)
  const str = (key: string) => (typeof meta[key] === 'string' && meta[key] ? (meta[key] as string) : undefined)

  if (category && [...VEHICLE_TYPES, ...HEAVY_MACHINERY_TYPES, 'implemento'].includes(category)) {
    const plate = str('plate')
    if (plate) return `Patente ${plate}`
    const chassis = str('chassisNumber')
    return chassis ? `Chasis ${chassis}` : null
  }
  if (category === 'edificio') return str('address') ?? null
  if (category === 'establecimiento' || category === 'campo_terreno') {
    const localityProvince = [str('locality'), str('province')].filter(Boolean).join(', ')
    return localityProvince || str('cadastralReference') || null
  }
  if (category === 'equipo' || category === 'maquinaria' || category === 'infraestructura') return str('technicalSpec') ?? null
  if (category === 'carga_animal') {
    const especieRaza = [fallback.brand, fallback.model].filter(Boolean).join(' · ')
    return especieRaza || null
  }
  return null
}

export interface AssetLabelInput {
  name: string
  assetType: string
  metadata?: Record<string, unknown> | null
  brand?: string | null
  model?: string | null
  fixedAssetName?: string | null
}

// Label completo a mostrar en selectores/listas de activos — nombre +
// diferenciador (patente u otro dato según el tipo, si está cargado) + Bien
// de Uso, omitiendo los segmentos que falten. Usado en PolicySelector.tsx y
// DocumentDetailPage.tsx (selector y detalle de "Pólizas Asociadas" en Documentos).
export function buildAssetLabel(asset: AssetLabelInput): string {
  const diff = buildAssetDifferentiator(asset.assetType, asset.metadata, { brand: asset.brand, model: asset.model })
  const label = diff ? `${asset.name} — ${diff}` : asset.name
  return asset.fixedAssetName ? `${label} · ${asset.fixedAssetName}` : label
}
