import clsx from 'clsx'

interface LoadingStateProps {
  rows?: number
  className?: string
}

export function LoadingState({ rows = 5, className }: LoadingStateProps) {
  return (
    <div className={clsx('p-4 space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-9 bg-slate-100 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}
