import clsx from 'clsx'
import type { TableColumn } from '../../types'
import { EmptyState } from '../empty-states/EmptyState'
import { LoadingState } from '../empty-states/LoadingState'

interface DataTableProps<T extends object> {
  columns: TableColumn<T>[]
  data: T[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  rowKey?: keyof T
  onRowClick?: (row: T) => void
  stickyHeader?: boolean
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
}: DataTableProps<T>) {
  if (loading) {
    return <LoadingState />
  }

  return (
    <div className="table-container">
      <table className="enterprise-table">
        <thead className={clsx(stickyHeader && 'sticky top-0 z-10')}>
          <tr>
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
              <td colSpan={columns.length} className="py-12">
                <EmptyState title={emptyTitle} description={emptyDescription} />
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => {
              const key = rowKey ? String(row[rowKey]) : String(rowIdx)
              return (
                <tr
                  key={key}
                  className={clsx(
                    'border-b border-slate-100 transition-colors',
                    rowIdx % 2 === 1 && 'bg-slate-50/40',
                    onRowClick && 'cursor-pointer hover:bg-blue-50/50',
                  )}
                  onClick={() => onRowClick?.(row)}
                >
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
    </div>
  )
}
