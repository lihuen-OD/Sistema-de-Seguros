import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { bienDeUsoRepository } from '../../../services/repositories/bien-de-uso.repository'

// Catálogo estático — se inicializa una sola vez al cargar el módulo, no en cada render
const ALL_BIENES_DE_USO = bienDeUsoRepository.findAll()

interface BienDeUsoFieldProps {
  value: string
  onChange: (id: string) => void
  categoryFilter?: string[]
}

export function BienDeUsoField({ value, onChange, categoryFilter }: BienDeUsoFieldProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const allBienesDeUso = ALL_BIENES_DE_USO

  const filteredCatalog = useMemo(() => {
    if (!categoryFilter?.length) return allBienesDeUso
    return allBienesDeUso.filter((b) => categoryFilter.includes(b.category))
  }, [categoryFilter, allBienesDeUso])

  const results = useMemo(() => {
    if (!query.trim()) return filteredCatalog.slice(0, 8)
    const q = query.toLowerCase()
    return filteredCatalog.filter(
      (b) => b.code.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    ).slice(0, 8)
  }, [query, filteredCatalog])

  const selected = allBienesDeUso.find((b) => b.id === value)

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-start justify-between gap-2 px-3 py-3 rounded-lg border border-blue-300 bg-blue-50">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-blue-700 font-mono tracking-wide">{selected.code}</p>
              <span className="text-xs text-blue-400 bg-blue-100 px-1.5 py-0.5 rounded font-medium">{selected.category}</span>
            </div>
            <p className="text-sm font-medium text-slate-700">{selected.description}</p>
            <div className="flex items-center gap-3 pt-0.5">
              <span className="text-xs text-slate-500">
                Incorporación: <span className="font-medium">{selected.incorporationDate}</span>
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                VU: <span className="font-medium">{selected.usefulLifeYears} años</span>
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-500">
                Amort: <span className="font-medium">{selected.depreciationRate}% anual</span>
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { onChange(''); setQuery('') }}
            className="flex-shrink-0 p-1 text-slate-400 hover:text-red-500 transition-colors mt-0.5"
            title="Limpiar selección"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Buscar por código o descripción en Finnegans…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {results.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseDown={() => { onChange(b.id); setQuery(''); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 text-left transition-colors"
                >
                  <span className="text-xs font-mono font-semibold text-blue-600 flex-shrink-0 w-[72px]">{b.code}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{b.description}</p>
                    <p className="text-xs text-slate-400">{b.category}</p>
                  </div>
                </button>
              ))}
              <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400 italic">
                Catálogo de muestra — en producción conecta con Finnegans
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
