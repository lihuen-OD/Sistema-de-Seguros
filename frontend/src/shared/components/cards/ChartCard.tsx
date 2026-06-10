import clsx from 'clsx'

interface ChartCardProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  height?: number
}

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className,
  height = 280,
}: ChartCardProps) {
  return (
    <div className={clsx('card', className)}>
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      <div className="p-5" style={{ height }}>
        {children}
      </div>
    </div>
  )
}
