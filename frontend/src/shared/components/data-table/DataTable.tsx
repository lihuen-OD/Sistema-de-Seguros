import { useEffect, useMemo, useRef, useState } from 'react'
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
}: DataTableProps<T>) {
  const [sortState, setSortState] = useState<SortState | null>(null)

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

  return (
    <TableShell minWidth={minWidth}>
      <table className="enterprise-table">
        <thead className={clsx(stickyHeader && 'sticky top-0 z-10')}>
          <tr>
            {selectable && (
              <th className="w-10 px-4 py-3 bg-slate-50">
                <SelectAllCheckbox
                  checked={!!allSelected}
                  indeterminate={!!someSelected && !allSelected}
                  onChange={(checked) => onToggleAll?.(checked)}
                />
              </th>
            )}
            {columns.map((col, i) => {
              const colId = col.id ?? String(col.key)
              const isSorted = sortState?.key === colId
              return (
                <th
                  key={String(col.key) + i}
                  className={clsx('px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50', col.headerClassName)}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(colId)}
                      className={clsx(
                        'flex items-center gap-1 w-full hover:text-slate-700 transition-colors',
                        col.headerClassName?.includes('text-right') && 'justify-end',
                        col.headerClassName?.includes('text-center') && 'justify-center',
                        isSorted && 'text-slate-700',
                      )}
                    >
                      {col.label}
                      {isSorted
                        ? (sortState!.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                        : <ArrowUpDown size={12} className="text-slate-300" />}
                    </button>
                  ) : (
                    col.label
                  )}
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
                    <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
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
                        className={clsx('px-4 py-3 text-sm text-slate-700 whitespace-nowrap', col.className)}
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
