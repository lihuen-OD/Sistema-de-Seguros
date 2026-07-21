import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, Search } from 'lucide-react'
import { fixedAssetQueries } from '../../../shared/api/fixed-assets.api'

interface BienDeUsoFieldProps {
  value: string
  onChange: (id: string) => void
}

export function BienDeUsoField({ value, onChange }: BienDeUsoFieldProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { data: allBienesDeUso = [] } = useQuery(fixedAssetQueries.list())

  const results = useMemo(() => {
    if (!query.trim()) return allBienesDeUso.slice(0, 8)
    const q = query.toLowerCase()
    return allBienesDeUso.filter(
      (b) => b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q),
    ).slice(0, 8)
  }, [query, allBienesDeUso])

  const selected = allBienesDeUso.find((b) => b.id === value)

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-start justify-between gap-2 px-3 py-3 rounded-lg border border-brand-300 bg-brand-50">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-brand-700 font-mono tracking-wide">{selected.code}</p>
            </div>
            <p className="text-sm font-medium text-slate-700">{selected.name}</p>
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
            placeholder="Buscar por código o nombre…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {open && results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {results.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onMouseDown={() => { onChange(b.id); setQuery(''); setOpen(false) }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-brand-50 text-left transition-colors"
                >
                  <span className="text-xs font-mono font-semibold text-brand-600 flex-shrink-0 w-[72px]">{b.code}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{b.name}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
