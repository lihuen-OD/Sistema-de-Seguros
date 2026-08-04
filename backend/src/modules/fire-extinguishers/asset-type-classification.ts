// `assetType` es un string libre (ver CATEGORY_GROUPS en el frontend), sin enum ni
// catálogo en el backend — se normaliza (sin acentos, sin espacios/guiones) para
// reconocer tanto las etiquetas canónicas ("Vehículo", "Implemento agrícola")
// como valores legacy cargados antes de existir el catálogo de categorías
// ("vehiculo", "maquinaria_agricola"). "Maquinaria" incluye toda la maquinaria
// agrícola (tractor, cosechadora, pulverizadora, implemento) y también la
// subcategoría "Otros > Maquinaria" — ambas comparten la misma etiqueta
// normalizada, así que quedan en el mismo bucket sin lógica adicional.
// "moto" queda afuera a propósito: las motos no llevan matafuego, así que no
// corresponde tratarlas como vehículo con/sin matafuego en ningún lado.
const VEHICLE_TYPE_KEYS = new Set(['vehiculo', 'camioneta', 'camion', 'transportedepasajeros'])
const MACHINERY_TYPE_KEYS = new Set([
  'maquinaria',
  'maquinariaagricola',
  'tractor',
  'cosechadora',
  'pulverizadora',
  'implemento',
  'implementoagricola',
])

const ASSET_TYPE_ACCENTS: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

export function normalizeAssetType(assetType: string): string {
  const lower = assetType.toLowerCase()
  let result = ''
  for (const ch of lower) result += ASSET_TYPE_ACCENTS[ch] ?? ch
  return result.replace(/[^a-z0-9]/g, '')
}

export type VehicleMachineryCategory = 'vehiculo' | 'maquinaria'

export function classifyAssetType(assetType: string): VehicleMachineryCategory | null {
  const normalized = normalizeAssetType(assetType)
  if (VEHICLE_TYPE_KEYS.has(normalized)) return 'vehiculo'
  if (MACHINERY_TYPE_KEYS.has(normalized)) return 'maquinaria'
  return null
}
