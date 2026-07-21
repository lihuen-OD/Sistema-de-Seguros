import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import type { TableColumn } from '../../types'
import { EmptyState } from '../empty-states/EmptyState'
import { LoadingState } from '../empty-states/LoadingState'
import { TableShell } from './TableShell'

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
  rowClassName,
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingState />
  }

  const allSelected = selectable && data.length > 0 && data.every((row) => selectedIds?.has(String(row[rowKey as keyof T])))
  const someSelected = selectable && data.some((row) => selectedIds?.has(String(row[rowKey as keyof T])))

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
            {columns.map((col, i) => (
              <th
                key={String(col.key) + i}
                className={clsx('px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap bg-slate-50', col.headerClassName)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="py-12">
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => {
              const key = rowKey ? String(row[rowKey]) : String(rowIdx)
              const isSelected = selectable && !!selectedIds?.has(key)
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
                        onChange={() => onToggleOne?.(key)}
                        className="w-4 h-4 rounded border-slate-300 text-brand-600 cursor-pointer accent-brand-600"
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
