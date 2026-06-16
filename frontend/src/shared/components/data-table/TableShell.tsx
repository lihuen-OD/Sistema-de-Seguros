import type { ReactNode } from 'react'
import clsx from 'clsx'

interface TableShellProps {
  children: ReactNode
  className?: string
  minWidth?: number | string
}

export function TableShell({ children, className, minWidth = 900 }: TableShellProps) {
  const minW = typeof minWidth === 'number' ? `${minWidth}px` : minWidth
  return (
    <div
      className={clsx('table-shell scrollbar-thin', className)}
      style={{ '--table-min-width': minW } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
