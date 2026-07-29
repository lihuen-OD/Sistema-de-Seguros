import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import type { TableColumn } from '../../types'
import { EmptyState } from '../empty-states/EmptyState'
import { LoadingState } from '../empty-states/LoadingState'
import { TableShell } from './TableShell'

type SortDirection = 'asc' | 'desc'
interface SortState { key: string; direction: SortDirection }

// Comparación "natural": números como números, texto con acentos/ñ en orden
// de diccionario español, y strings con números adentro (ej. códigos
// "MAT-2" vs "MAT-10") en el orden que espera un humano, no el lexicográfico
// puro. Fechas ISO ("YYYY-MM-DD") ya ordenan bien como string, así que no
// necesitan un caso especial — para eso alcanza con no ordenar por el texto
// ya formateado (ver `sortValue`/fallback a `row[key]` más abajo). No maneja
// nulos — eso lo resuelve `sortedData` para que los vacíos queden siempre al
// final sin importar la dirección (invertir un array ya ordenado los movería
// al principio, que se ve como un bug).
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b

  const aStr = String(a)
  const bStr = String(b)
  return aStr.localeCompare(bStr, 'es', { numeric: true, sensitivity: 'base' })
}

const MIN_COL_WIDTH = 60
const CHECKBOX_COL_WIDTH = 40

function widthsStorageKey(tableKey: string): string {
  return `col-widths:${tableKey}`
}

function loadWidths(tableKey?: string): Record<string, number> {
  if (!tableKey) return {}
  try {
    const raw = localStorage.getItem(widthsStorageKey(tableKey))
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, width]) => id.length > 0 && typeof width === 'number' && Number.isFinite(width) && width >= MIN_COL_WIDTH,
      ),
    )
  } catch {
    return {}
  }
}

interface DataTableProps<T extends object> {
  columns: TableColumn<T>[]
  data: T[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  rowKey?: keyof T
  onRowClick?: (row: T) => void
  stickyHeader?: boolean
  minWidth?: number | string
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleOne?: (id: string) => void
  onToggleAll?: (checked: boolean) => void
  /** Si se provee, las filas para las que devuelve false muestran el checkbox deshabilitado en vez de tildable. */
  isRowSelectable?: (row: T) => boolean
  rowClassName?: (row: T, index: number) => string | undefined
  /** Si se provee, el ancho de columna ajustado a mano (arrastrando el borde) se
   *  guarda en localStorage bajo esta key — igual criterio que useColumnConfig,
   *  así que conviene reusar la misma key. Sin ella, el resize funciona igual
   *  pero solo dura la visita actual a la página. */
  tableKey?: string
}

function SelectAllCheckbox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean
  indeterminate: boolean
  onChange: (v: boolean) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 rounded border-slate-300 text-brand-600 cursor-pointer accent-brand-600"
    />
  )
}

export function DataTable<T extends object>({
  columns,
  data,
  loading,
  emptyTitle = 'Sin registros',
  emptyDescription = 'No hay datos para mostrar con los filtros actuales.',
  rowKey,
  onRowClick,
  stickyHeader,
  minWidth,
  selectable,
  selectedIds,
  onToggleOne,
  onToggleAll,
  isRowSelectable,
  rowClassName,
  tableKey,
}: DataTableProps<T>) {
  const [sortState, setSortState] = useState<SortState | null>(null)
  const [widths, setWidths] = useState<Record<string, number>>(() => loadWidths(tableKey))
  const [isResizing, setIsResizing] = useState(false)
  const widthsRef = useRef(widths)
  const initialWidthsRef = useRef<Record<string, number>>({})
  const theadRef = useRef<HTMLTableSectionElement>(null)
  const dragRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startWidth: number
    neighborId?: string
    neighborWidth?: number
  } | null>(null)

  const colIds = useMemo(() => columns.map((c) => c.id ?? String(c.key)), [columns])

  // Mide el ancho "natural" (auto-layout, como si nunca se hubiera tocado
  // nada) de cada columna la primera vez que aparece — recién a partir de ahí
  // queda fijo y arrastrable. Sin esto, pasar a table-layout:fixed de entrada
  // dejaría todas las columnas con el mismo ancho arbitrario en vez de
  // respetar el layout prolijo que ya tenía la tabla.
  useLayoutEffect(() => {
    const headerRow = theadRef.current?.querySelector('tr')
    if (!headerRow) return
    const ths = Array.from(headerRow.querySelectorAll<HTMLTableCellElement>('th[data-col-id]'))
    setWidths((prev) => {
      let changed = false
      const next = { ...prev }
      for (const th of ths) {
        const id = th.dataset.colId as string
        const measuredWidth = Math.max(MIN_COL_WIDTH, Math.round(th.getBoundingClientRect().width))
        initialWidthsRef.current[id] ??= measuredWidth
        if (next[id] == null) {
          next[id] = measuredWidth
          changed = true
        }
      }
      widthsRef.current = changed ? next : prev
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colIds.join('|')])

  const persistWidths = useCallback((next: Record<string, number>) => {
    if (!tableKey) return
    try { localStorage.setItem(widthsStorageKey(tableKey), JSON.stringify(next)) } catch { /* noop */ }
  }, [tableKey])

  const finishResize = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    setIsResizing(false)
    persistWidths(widthsRef.current)
  }, [persistWidths])

  useEffect(() => {
    if (!isResizing) return
    document.body.classList.add('is-resizing-table-column')
    return () => document.body.classList.remove('is-resizing-table-column')
  }, [isResizing])

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag || event.pointerId !== drag.pointerId) return

      const requestedWidth = Math.max(MIN_COL_WIDTH, Math.round(drag.startWidth + event.clientX - drag.startX))
      const appliedDelta = requestedWidth - drag.startWidth

      setWidths((prev) => {
        const next = { ...prev, [drag.id]: requestedWidth }
        if (drag.neighborId && drag.neighborWidth != null) {
          // Mientras haya espacio, la columna vecina absorbe el cambio para
          // conservar el ancho total de la tabla. Si llega al mínimo, la tabla
          // crece y el TableShell habilita el scroll horizontal.
          next[drag.neighborId] = Math.max(MIN_COL_WIDTH, drag.neighborWidth - appliedDelta)
        }
        widthsRef.current = next
        return next
      })
    }
    const onPointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) finishResize()
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      finishResize()
    }
  }, [finishResize])

  function updateWidths(next: Record<string, number>) {
    widthsRef.current = next
    setWidths(next)
    persistWidths(next)
  }

  function resizeByKeyboard(id: string, direction: -1 | 1) {
    const index = colIds.indexOf(id)
    const neighborId = colIds[index + 1]
    const step = direction * 10
    const currentWidth = widthsRef.current[id] ?? initialWidthsRef.current[id] ?? 150
    const requestedWidth = Math.max(MIN_COL_WIDTH, currentWidth + step)
    const appliedDelta = requestedWidth - currentWidth
    const next = { ...widthsRef.current, [id]: requestedWidth }
    if (neighborId) {
      const neighborWidth = widthsRef.current[neighborId] ?? initialWidthsRef.current[neighborId] ?? 150
      next[neighborId] = Math.max(MIN_COL_WIDTH, neighborWidth - appliedDelta)
    }
    updateWidths(next)
  }

  function resetWidth(id: string) {
    const initialWidth = initialWidthsRef.current[id]
    if (initialWidth == null) return
    updateWidths({ ...widthsRef.current, [id]: initialWidth })
  }

  function startResize(e: React.PointerEvent, id: string) {
    if (!e.isPrimary || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const index = colIds.indexOf(id)
    const neighborId = colIds[index + 1]
    dragRef.current = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: widthsRef.current[id] ?? initialWidthsRef.current[id] ?? 150,
      neighborId,
      neighborWidth: neighborId
        ? (widthsRef.current[neighborId] ?? initialWidthsRef.current[neighborId] ?? 150)
        : undefined,
    }
    setIsResizing(true)
  }

  function toggleSort(colId: string) {
    setSortState((prev) => {
      if (!prev || prev.key !== colId) return { key: colId, direction: 'asc' }
      if (prev.direction === 'asc') return { key: colId, direction: 'desc' }
      return null
    })
  }

  const sortedData = useMemo(() => {
    if (!sortState) return data
    const col = columns.find((c) => (c.id ?? String(c.key)) === sortState.key)
    if (!col) return data
    const getValue = (row: T) =>
      col.sortValue ? col.sortValue(row) : (col.key in row ? (row as Record<string, unknown>)[col.key as string] : undefined)
    const dir = sortState.direction === 'desc' ? -1 : 1
    return [...data].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      const aNil = av === null || av === undefined || av === ''
      const bNil = bv === null || bv === undefined || bv === ''
      if (aNil && bNil) return 0
      if (aNil) return 1
      if (bNil) return -1
      return dir * compareValues(av, bv)
    })
  }, [data, columns, sortState])

  if (loading) {
    return <LoadingState />
  }

  const selectableRows = isRowSelectable ? data.filter(isRowSelectable) : data
  const allSelected = selectable && selectableRows.length > 0 && selectableRows.every((row) => selectedIds?.has(String(row[rowKey as keyof T])))
  const someSelected = selectable && selectableRows.some((row) => selectedIds?.has(String(row[rowKey as keyof T])))

  // table-layout: fixed recién una vez medidas todas las columnas visibles —
  // si falta alguna (recién montó, o se acaba de tildar una nueva desde el
  // selector de columnas), se deja auto para que el navegador la mida bien
  // en el próximo paso del layoutEffect, sin flash visual intermedio.
  const allMeasured = colIds.every((id) => widths[id] != null)
  const measuredTableWidth = allMeasured
    ? colIds.reduce((total, id) => total + widths[id], selectable ? CHECKBOX_COL_WIDTH : 0)
    : undefined

  return (
    <TableShell minWidth={minWidth}>
      <table
        className="enterprise-table"
        // `table-layout: fixed` solo respeta de forma determinista los anchos
        // del colgroup cuando la tabla tiene un ancho explícito. Con
        // `width: auto`, el navegador vuelve al algoritmo de contenido y el
        // handle parece arrastrarse, pero la columna no se mueve.
        style={allMeasured ? { tableLayout: 'fixed', width: measuredTableWidth } : undefined}
      >
        <colgroup>
          {selectable && <col style={{ width: CHECKBOX_COL_WIDTH }} />}
          {columns.map((col, i) => {
            const id = colIds[i]
            return <col key={id} style={widths[id] != null ? { width: widths[id] } : undefined} />
          })}
        </colgroup>
        <thead ref={theadRef} className={clsx(stickyHeader && 'sticky top-0 z-10')}>
          <tr>
            {selectable && (
              <th className="px-4 py-3 bg-slate-50">
                <SelectAllCheckbox
                  checked={!!allSelected}
                  indeterminate={!!someSelected && !allSelected}
                  onChange={(checked) => onToggleAll?.(checked)}
                />
              </th>
            )}
            {columns.map((col, i) => {
              const colId = colIds[i]
              const isSorted = sortState?.key === colId
              return (
                <th
                  key={colId}
                  data-col-id={colId}
                  className={clsx('relative group/col px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50', col.headerClassName)}
                >
                  <div className="truncate">
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(colId)}
                        className={clsx(
                          'flex items-center gap-1 w-full min-w-0 hover:text-slate-700 transition-colors',
                          col.headerClassName?.includes('text-right') && 'justify-end',
                          col.headerClassName?.includes('text-center') && 'justify-center',
                          isSorted && 'text-slate-700',
                        )}
                      >
                        <span className="truncate">{col.label}</span>
                        {isSorted
                          ? (sortState!.direction === 'asc' ? <ArrowUp size={12} className="flex-shrink-0" /> : <ArrowDown size={12} className="flex-shrink-0" />)
                          : <ArrowUpDown size={12} className="text-slate-300 flex-shrink-0" />}
                      </button>
                    ) : (
                      col.label
                    )}
                  </div>
                  {/* Handle de resize — arrastrar cambia el ancho de esta columna, como en Excel/Sheets */}
                  <span
                    role="separator"
                    aria-label={`Cambiar ancho de la columna ${col.label}`}
                    aria-orientation="vertical"
                    aria-valuemin={MIN_COL_WIDTH}
                    aria-valuenow={Math.round(widths[colId] ?? MIN_COL_WIDTH)}
                    tabIndex={0}
                    onPointerDown={(e) => startResize(e, colId)}
                    onDoubleClick={() => resetWidth(colId)}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
                      e.preventDefault()
                      resizeByKeyboard(colId, e.key === 'ArrowLeft' ? -1 : 1)
                    }}
                    className="absolute top-0 right-0 bottom-0 w-3 touch-none cursor-col-resize -mr-1.5 z-10 flex justify-center opacity-0 group-hover/col:opacity-100 hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500 transition-opacity"
                    title="Arrastrar para cambiar el ancho · Doble clic para restablecer"
                  >
                    <span className="w-px h-full bg-brand-400" />
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-12">
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            sortedData.map((row, rowIdx) => {
              const key = rowKey ? String(row[rowKey]) : String(rowIdx)
              const isSelected = selectable && !!selectedIds?.has(key)
              const rowSelectable = !isRowSelectable || isRowSelectable(row)
              return (
                <tr
                  key={key}
                  className={clsx(
                    'border-b border-slate-100 transition-colors',
                    rowClassName
                      ? rowClassName(row, rowIdx)
                      : clsx(rowIdx % 2 === 1 && 'bg-slate-50/40', onRowClick && 'hover:bg-brand-50/50'),
                    onRowClick && 'cursor-pointer',
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={!rowSelectable}
                        onChange={() => onToggleOne?.(key)}
                        className={clsx(
                          'w-4 h-4 rounded border-slate-300 accent-brand-600',
                          rowSelectable ? 'text-brand-600 cursor-pointer' : 'cursor-not-allowed opacity-40',
                        )}
                      />
                    </td>
                  )}
                  {columns.map((col, colIdx) => {
                    const rawValue = col.key in row ? (row as Record<string, unknown>)[col.key as string] : undefined
                    return (
                      <td
                        key={String(col.key) + colIdx}
                        className={clsx('px-4 py-3 text-sm text-slate-700 overflow-hidden text-ellipsis whitespace-nowrap', col.className)}
                      >
                        {col.render ? col.render(rawValue, row) : (rawValue !== null && rawValue !== undefined ? String(rawValue) : '—')}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </TableShell>
  )
}
