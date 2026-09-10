import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import clsx from 'clsx'
import { SearchInput } from '../filters/SearchInput'

export interface SearchableSelectOption {
  value: string
  label: string
  sublabel?: string
  /** Texto adicional por el que se puede buscar (ej. patente, bien de uso) sin mostrarse en la fila. */
  keywords?: string
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
  /** Opciones todavía en camino (ej. useQuery en curso) — reemplaza la lista por un mensaje de carga. */
  loading?: boolean
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
  loading,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // Índice resaltado por teclado dentro de la lista navegable (fila "vacío"
  // + opciones filtradas, mismo orden en que se ven) — independiente de cuál
  // esté seleccionada (value).
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

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
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.sublabel?.toLowerCase().includes(q) ||
        o.keywords?.toLowerCase().includes(q),
    )
  }, [options, query])

  // Fila "vacío" siempre primero, igual que se renderiza el panel — permite
  // navegar con flechas por las mismas filas que se ven, incluida esa.
  const navigableOptions = useMemo(
    () => [{ value: '', label: emptyOptionLabel } as SearchableSelectOption, ...filteredOptions],
    [filteredOptions, emptyOptionLabel],
  )

  useEffect(() => {
    if (!open || loading) return
    optionRefs.current.get(highlightedIndex)?.scrollIntoView({ block: 'nearest' })
  }, [highlightedIndex, open, loading])

  // El resaltado arranca de nuevo arriba de todo junto con la acción que lo
  // invalida (tipear en el buscador, abrir el panel) — en el mismo handler,
  // no vía efecto: tras filtrar, el índice viejo podía apuntar a una fila que
  // ya no está.
  function handleQueryChange(v: string) {
    setQuery(v)
    setHighlightedIndex(0)
  }

  function toggleOpen() {
    setOpen((v) => !v)
    setHighlightedIndex(0)
  }

  function handleSelect(v: string) {
    onChange(v)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
      buttonRef.current?.focus()
      return
    }
    if (!open || loading) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.min(i + 1, navigableOptions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = navigableOptions[highlightedIndex]
      if (opt) handleSelect(opt.value)
    }
  }

  return (
    <div className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={clsx(
          'w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm bg-white border rounded-lg text-left transition-all',
          open ? 'border-brand-400 ring-2 ring-brand-500/20' : 'border-slate-200',
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
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100">
            <SearchInput value={query} onChange={handleQueryChange} placeholder={searchPlaceholder} />
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-sm text-slate-400 text-center">Cargando…</p>
            ) : (
              <>
                <button
                  ref={(el) => { if (el) optionRefs.current.set(0, el); else optionRefs.current.delete(0) }}
                  type="button"
                  role="option"
                  aria-selected={value === ''}
                  onClick={() => handleSelect('')}
                  className={clsx(
                    'w-full flex items-center px-3 py-2 text-sm text-left transition-colors',
                    value === '' ? 'font-medium text-slate-700' : 'text-slate-400',
                    highlightedIndex === 0 && 'bg-slate-100',
                  )}
                >
                  {emptyOptionLabel}
                </button>
                {filteredOptions.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-slate-400 text-center">{noResultsMessage}</p>
                ) : (
                  filteredOptions.map((o, i) => {
                    const navIndex = i + 1
                    const isSelected = o.value === value
                    const isHighlighted = highlightedIndex === navIndex
                    return (
                      <button
                        key={o.value}
                        ref={(el) => { if (el) optionRefs.current.set(navIndex, el); else optionRefs.current.delete(navIndex) }}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelect(o.value)}
                        className={clsx(
                          'w-full flex items-center px-3 py-2 text-sm text-left transition-colors',
                          isSelected ? 'bg-brand-50 text-brand-800 font-medium' : isHighlighted ? 'bg-slate-100 text-slate-800' : 'text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        <span className="truncate">
                          {o.label}
                          {o.sublabel && <span className={clsx('ml-1.5 text-xs', isSelected ? 'text-brand-500' : 'text-slate-400')}>({o.sublabel})</span>}
                        </span>
                      </button>
                    )
                  })
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
