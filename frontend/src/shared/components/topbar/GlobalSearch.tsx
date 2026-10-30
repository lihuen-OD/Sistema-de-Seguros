import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Loader2, Package, Search, ShieldCheck, X } from 'lucide-react'
import clsx from 'clsx'
import { searchQueries } from '../../api/search.api'
import { StatusPill } from '../badges/StatusPill'
import { EmptyState } from '../empty-states/EmptyState'
import { ErrorState } from '../empty-states/ErrorState'
import { LoadingState } from '../empty-states/LoadingState'
import {
  GLOBAL_SEARCH_DEBOUNCE_MS,
  GLOBAL_SEARCH_MAX_LENGTH,
  GLOBAL_SEARCH_MIN_LENGTH,
  buildGlobalSearchPlaceholder,
  buildGlobalSearchSections,
  canRunGlobalSearch,
  flattenGlobalSearchSections,
  normalizeGlobalSearchQuery,
  type GlobalSearchCategory,
  type GlobalSearchEntry,
} from '../../utils/globalSearch'

// Mismos íconos que el Sidebar para cada sección.
const CATEGORY_ICONS: Record<GlobalSearchCategory, React.ElementType> = {
  assets: Package,
  policies: ShieldCheck,
  documents: FileText,
}

interface GlobalSearchProps {
  /** Categorías que el usuario puede abrir — solo arma el placeholder; los grupos los decide el backend. */
  categories: GlobalSearchCategory[]
}

// Buscador global del Topbar: un request a GET /search por término (debounce
// de 300 ms, mínimo 2 caracteres), resultados agrupados y navegación directa
// al detalle con mouse, teclado (↑ ↓ Enter Esc, ⌘K / Ctrl+K) o touch. Mismo
// patrón de panel flotante + click-outside que SearchableSelect; en mobile el
// panel ocupa el ancho de la pantalla debajo del Topbar.
export function GlobalSearch({ categories }: GlobalSearchProps) {
  const navigate = useNavigate()
  const listboxId = useId()
  const [input, setInput] = useState('')
  // Término ya normalizado y con debounce — es la queryKey real.
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data, isError, isFetching, isPlaceholderData, refetch } = useQuery({
    ...searchQueries.global(query),
    enabled: canRunGlobalSearch(query),
  })

  const sections = useMemo(() => (data ? buildGlobalSearchSections(data) : []), [data])
  const entries = useMemo(() => flattenGlobalSearchSections(sections), [sections])
  const entryIndex = useMemo(() => new Map(entries.map((entry, i) => [entry.key, i])), [entries])

  const normalizedInput = normalizeGlobalSearchQuery(input)
  const belowMinLength = normalizedInput.length < GLOBAL_SEARCH_MIN_LENGTH
  // Los datos en pantalla son de un término anterior: todavía corre el
  // debounce o el request del término nuevo no volvió.
  const isStale = normalizedInput !== query || isPlaceholderData
  const showResults = !belowMinLength && !(isError && !isStale) && entries.length > 0
  // El índice se acota al render en vez de resetearlo con un efecto cuando
  // cambian los resultados.
  const activeIndex = showResults ? Math.min(highlightedIndex, entries.length - 1) : -1
  const activeEntry = activeIndex >= 0 ? entries[activeIndex] : undefined

  const optionId = (entry: GlobalSearchEntry) => `${listboxId}-${entry.key}`
  const activeOptionId = activeEntry ? optionId(activeEntry) : undefined

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      // Desde otro campo editable no se intercepta: en macOS Ctrl+K borra
      // hasta el fin de línea, y quien está completando un formulario no
      // espera que el foco salte al buscador.
      const target = e.target as HTMLElement | null
      const fromOtherField = target !== inputRef.current && !!target?.closest?.('input, textarea, select, [contenteditable="true"]')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !fromOtherField) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    // jsdom no implementa scrollIntoView — de ahí el optional call.
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeOptionId])

  function clearPendingSearch() {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = null
  }

  function handleChange(value: string) {
    setInput(value)
    setOpen(true)
    setHighlightedIndex(0)
    clearPendingSearch()
    const normalized = normalizeGlobalSearchQuery(value)
    // Por debajo del mínimo no hay nada que esperar: se apaga la query ya.
    if (!canRunGlobalSearch(normalized)) {
      setQuery('')
      return
    }
    debounceRef.current = setTimeout(() => setQuery(normalized), GLOBAL_SEARCH_DEBOUNCE_MS)
  }

  function reset() {
    clearPendingSearch()
    setInput('')
    setQuery('')
    setOpen(false)
    setHighlightedIndex(0)
  }

  function selectEntry(entry: GlobalSearchEntry) {
    reset()
    inputRef.current?.blur()
    navigate(entry.href)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (open) setOpen(false)
      else reset()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      if (!showResults) return
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setHighlightedIndex(Math.max(0, Math.min(activeIndex + delta, entries.length - 1)))
      return
    }
    if (e.key === 'Enter' && open && activeEntry) {
      e.preventDefault()
      selectEntry(activeEntry)
    }
  }

  function renderBody() {
    if (belowMinLength) {
      return (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          Escribí al menos {GLOBAL_SEARCH_MIN_LENGTH} caracteres para buscar.
        </p>
      )
    }
    if (isError && !isStale) {
      return (
        <ErrorState
          title="No se pudo completar la búsqueda"
          description="Intentá nuevamente en unos segundos."
          action={<button type="button" onClick={() => refetch()} className="text-sm font-semibold text-brand-600">Reintentar</button>}
        />
      )
    }
    // Sin datos todavía, o datos vacíos de un término anterior: mostrar
    // "sin resultados" de algo que ya no se está buscando confundiría.
    if (!data || (entries.length === 0 && isStale)) return <LoadingState rows={3} />
    if (entries.length === 0) {
      return <EmptyState title="Sin resultados" description={`No encontramos coincidencias para «${query}».`} />
    }
    return (
      <div id={listboxId} role="listbox" aria-label="Resultados de búsqueda" className="divide-y divide-slate-100">
        {sections.map((section) => {
          const Icon = CATEGORY_ICONS[section.category]
          const headingId = `${listboxId}-${section.category}`
          return (
            <div key={section.category} role="group" aria-labelledby={headingId} className="py-1.5">
              <div id={headingId} className="px-4 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section.label}
              </div>
              {section.entries.map((entry) => {
                const index = entryIndex.get(entry.key) ?? -1
                const isActive = index === activeIndex
                return (
                  <div
                    key={entry.key}
                    id={optionId(entry)}
                    role="option"
                    aria-selected={isActive}
                    // Sin esto el input pierde el foco en el mousedown y el
                    // click-outside cierra el panel antes del click.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectEntry(entry)}
                    className={clsx(
                      'mx-1.5 flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors',
                      isActive ? 'bg-slate-100' : 'hover:bg-slate-50',
                    )}
                  >
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{entry.title}</span>
                      {entry.subtitle && <span className="block truncate text-xs text-slate-500">{entry.subtitle}</span>}
                    </span>
                    <span className="flex-shrink-0">
                      <StatusPill status={entry.status} size="sm" />
                    </span>
                  </div>
                )
              })}
              {section.hasMore && (
                <p className="px-4 pt-1 pb-0.5 text-xs text-slate-400">
                  Hay más coincidencias — refiná la búsqueda para acotarlas.
                </p>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const showSpinner = isFetching && !belowMinLength

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="relative">
        {showSpinner ? (
          <Loader2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400 pointer-events-none" />
        ) : (
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        )}
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Buscar en el sistema"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open ? activeOptionId : undefined}
          aria-keyshortcuts="Control+K Meta+K"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          maxLength={GLOBAL_SEARCH_MAX_LENGTH}
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (input) setOpen(true) }}
          onKeyDown={handleKeyDown}
          placeholder={buildGlobalSearchPlaceholder(categories)}
          // text-base en mobile: con menos de 16px iOS hace zoom al enfocar.
          className="w-full pl-9 pr-8 py-1.5 text-base sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all"
        />
        {input && (
          <button
            type="button"
            onClick={() => { reset(); inputRef.current?.focus() }}
            aria-label="Limpiar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-x-0 top-16 bottom-0 z-30 overflow-y-auto bg-white border-t border-slate-200 sm:absolute sm:inset-x-0 sm:top-full sm:bottom-auto sm:mt-2 sm:max-h-[min(32rem,calc(100vh-6rem))] sm:rounded-xl sm:border sm:shadow-lg">
          {renderBody()}
        </div>
      )}
    </div>
  )
}
