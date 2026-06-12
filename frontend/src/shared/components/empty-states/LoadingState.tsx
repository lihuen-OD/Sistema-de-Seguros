import clsx from 'clsx'

interface LoadingStateProps {
  rows?: number
  className?: string
}

const ROW_OPACITY = ['opacity-100', 'opacity-90', 'opacity-75', 'opacity-60', 'opacity-50', 'opacity-40']

export function LoadingState({ rows = 5, className }: LoadingStateProps) {
  return (
    <div className={clsx('p-4 space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={clsx('h-9 bg-slate-100 rounded-lg animate-pulse', ROW_OPACITY[Math.min(i, ROW_OPACITY.length - 1)])}
        />
      ))}
    </div>
  )
}
