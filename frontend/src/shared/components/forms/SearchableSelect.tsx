import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'
import { SearchInput } from '../filters/SearchInput'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyOptionLabel?: string
  noResultsMessage?: string
  disabled?: boolean
}

// Select de valor único con buscador integrado, para listas largas donde un
// <select> nativo deja de ser usable (ej. activos, a medida que crece el
// parque). No hay un combobox genérico reutilizable en el proyecto todavía —
// este componente cubre ese hueco siguiendo la mecánica de panel flotante +
// click-outside de MultiSelectFilter y el estilo visual de fila de AssetSelector.
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Seleccionar…',
  searchPlaceholder = 'Buscar…',
  emptyOptionLabel = '— Ninguno —',
  noResultsMessage = 'Ningún resultado coincide con la búsqueda',
  disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
    )
  }, [options, query])

  function handleSelect(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm bg-white border rounded-lg text-left transition-all',
          open ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-200',
          disabled && 'bg-slate-50 text-slate-500 cursor-not-allowed',
        )}
      >
        <span className={clsx('min-w-0 truncate', selected ? 'text-slate-800' : 'text-slate-400')}>
          {selected ? (
            <>
              {selected.label}
              {selected.sublabel && <span className="text-slate-400"> — {selected.sublabel}</span>}
            </>
          ) : (
            placeholder
          )}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onChange('') }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange('') } }}
              className="p-0.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Limpiar selección"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={14} className={clsx('text-slate-400 transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100">
            <SearchInput value={query} onChange={setQuery} placeholder={searchPlaceholder} />
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={clsx(
                'w-full flex items-center px-3 py-2 text-sm text-left hover:bg-slate-50 transition-colors',
                value === '' ? 'font-medium text-slate-700' : 'text-slate-400',
              )}
            >
              {emptyOptionLabel}
            </button>
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">{noResultsMessage}</p>
            ) : (
              filteredOptions.map((o) => {
                const isSelected = o.value === value
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => handleSelect(o.value)}
                    className={clsx(
                      'w-full flex items-center px-3 py-2 text-sm text-left transition-colors',
                      isSelected ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-700 hover:bg-slate-50',
                    )}
                  >
                    <span className="truncate">
                      {o.label}
                      {o.sublabel && <span className={clsx('ml-1.5 text-xs', isSelected ? 'text-blue-500' : 'text-slate-400')}>({o.sublabel})</span>}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
