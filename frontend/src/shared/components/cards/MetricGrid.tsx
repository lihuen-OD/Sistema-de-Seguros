import clsx from 'clsx'

interface MetricGridProps {
  children: React.ReactNode
  cols?: 2 | 3 | 4 | 5
  className?: string
}

const colsMap = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
}

export function MetricGrid({ children, cols = 4, className }: MetricGridProps) {
  return (
    <div className={clsx('grid gap-4', colsMap[cols], className)}>
      {children}
    </div>
  )
}
