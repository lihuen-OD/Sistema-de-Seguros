import { useMemo, useState } from 'react'
import { SearchInput } from '../filters/SearchInput'
import type { Asset } from '../../types'

interface AssetSelectorProps {
  assets: Asset[]
  selected: string[]
  onToggle: (id: string) => void
  error?: string
}

export function AssetSelector({ assets, selected, onToggle, error }: AssetSelectorProps) {
  const [query, setQuery] = useState('')

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return assets
    return assets.filter(
      (a) =>
        a.internalCode?.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.assetType.toLowerCase().includes(q),
    )
  }, [assets, query])

  if (assets.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-5 text-center">
        <p className="text-sm text-slate-400">No hay activos activos disponibles</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-xs text-slate-500">
          {selected.length === 0
            ? 'Ninguno seleccionado'
            : `${selected.length} activo${selected.length !== 1 ? 's' : ''} seleccionado${selected.length !== 1 ? 's' : ''}`}
        </p>
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar por código, nombre o tipo…"
          className="w-64 max-w-[60%]"
        />
      </div>
      {filteredAssets.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-5 text-center">
          <p className="text-sm text-slate-400">Ningún activo coincide con la búsqueda</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100 max-h-72 overflow-y-auto">
          {filteredAssets.map((asset) => {
            const checked = selected.includes(asset.id)
            return (
              <div
                key={asset.id}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onClick={() => onToggle(asset.id)}
                onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(asset.id) } }}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors select-none ${
                  checked ? 'bg-brand-50' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                  }`}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm leading-snug min-w-0 ${checked ? 'text-brand-800 font-medium' : 'text-slate-700'}`}>
                  <span className="font-mono text-xs mr-1.5">{asset.internalCode}</span>
                  {asset.name}
                  <span className="text-slate-400 ml-1.5 text-xs">({asset.assetType})</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}
