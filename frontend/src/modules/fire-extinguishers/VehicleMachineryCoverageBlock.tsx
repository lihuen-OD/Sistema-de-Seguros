import { useState, type ElementType } from 'react'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import type { VehicleMachineryCoverageGroup } from '../../shared/api/fire-extinguishers.api'

// `assetType` es un string libre — algunos activos cargados antes de existir
// el catálogo de categorías tienen valores legacy en snake_case y sin
// mayúsculas (p. ej. "maquinaria_agricola"). Se prolija solo la presentación
// (no cambia el dato guardado) y solo si detecta ese patrón legacy — una
// etiqueta canónica como "Vehículo" o "Implemento agrícola" ya viene bien
// formada y se deja intacta (un título por palabra con regex rompería sus
// acentos, ver \b\w no reconoce letras acentuadas como parte de la palabra).
function prettifyAssetType(assetType: string): string {
  const looksLegacy = assetType.includes('_') || assetType === assetType.toLowerCase()
  if (!looksLegacy) return assetType
  const spaced = assetType.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

// Alto de 4 filas (56px medidas c/u) — con 4 o menos activos el bloque queda
// compacto a su contenido real; con más, se corta ahí y scrollea adentro en
// vez de estirar la card indefinidamente.
const FOUR_ROWS_MAX_HEIGHT = 224

interface VehicleMachineryCoverageBlockProps {
  title: string
  icon: ElementType
  group: VehicleMachineryCoverageGroup
  onSelectAsset: (assetId: string) => void
}

/** Bloque de cobertura de matafuegos para un grupo de activos (Vehículos o Maquinaria). */
export function VehicleMachineryCoverageBlock({ title, icon: Icon, group, onSelectAsset }: VehicleMachineryCoverageBlockProps) {
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()
  const filteredItems = q
    ? group.items.filter((item) =>
        [item.code, item.name, prettifyAssetType(item.assetType)].some((v) => v.toLowerCase().includes(q)),
      )
    : group.items

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
            <Icon size={14} />
          </div>
          <span className="text-sm font-semibold text-slate-800 truncate">{title}</span>
        </div>
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap flex-shrink-0">
          {group.conMatafuego}/{group.total} con matafuego
        </span>
      </div>

      {group.items.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-6">Sin activos de este tipo.</p>
      ) : (
        <>
          <div className="px-4 py-2.5 border-b border-slate-100">
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código o nombre…" />
          </div>

          {filteredItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Sin resultados para &quot;{search}&quot;.</p>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: FOUR_ROWS_MAX_HEIGHT }}>
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectAsset(item.id)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {item.code} · {item.name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{prettifyAssetType(item.assetType)}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5 flex-shrink-0 max-w-[55%]">
                    {item.fireExtinguishers.length > 0 ? (
                      item.fireExtinguishers.map((fe) => <StatusPill key={fe.id} status={fe.status} label={fe.code} size="sm" />)
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 whitespace-nowrap">
                        Sin matafuego
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
