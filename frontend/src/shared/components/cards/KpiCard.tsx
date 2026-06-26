import clsx from 'clsx'

interface KpiCardProps {
  label: string
  value: string | number
  description?: string
  icon?: React.ElementType
  iconClassName?: string
  trend?: {
    value: string
    direction: 'up' | 'down' | 'neutral'
  }
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
  onClick?: () => void
}

const variantStyles = {
  default: { icon: 'bg-slate-100 text-slate-500',    label: 'text-slate-500', border: '' },
  success: { icon: 'bg-emerald-100 text-emerald-600', label: 'text-emerald-600', border: 'border-l-2 border-l-emerald-400' },
  warning: { icon: 'bg-amber-100 text-amber-600',    label: 'text-amber-600',   border: 'border-l-2 border-l-amber-400' },
  danger:  { icon: 'bg-red-100 text-red-600',        label: 'text-red-600',     border: 'border-l-2 border-l-red-400' },
  info:    { icon: 'bg-blue-100 text-blue-600',       label: 'text-blue-600',    border: 'border-l-2 border-l-blue-400' },
}

export function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  iconClassName,
  trend,
  variant = 'default',
  className,
  onClick,
}: KpiCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={clsx(
        'card p-5 flex flex-col gap-3',
        styles.border,
        onClick && 'cursor-pointer hover:border-blue-300 hover:shadow-md transition-all',
        className,
      )}
      onClick={onClick}
    >
      {/* Top row: label + icon */}
      <div className="flex items-start justify-between gap-3">
        <span className={clsx('text-sm font-medium leading-snug', styles.label)}>{label}</span>
        {Icon && (
          <div
            className={clsx(
              'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
              iconClassName || styles.icon,
            )}
          >
            <Icon size={18} />
          </div>
        )}
      </div>

      {/* Value — separate row, no icon overlap possible */}
      <div className="min-w-0">
        <span className="text-2xl font-bold text-slate-900 leading-none block truncate">
          {value}
        </span>
        {description && (
          <span className="text-xs text-slate-500 mt-1 block">{description}</span>
        )}
        {trend && (
          <span
            className={clsx(
              'text-xs font-medium mt-1 block',
              trend.direction === 'up' && 'text-emerald-600',
              trend.direction === 'down' && 'text-red-500',
              trend.direction === 'neutral' && 'text-slate-500',
            )}
          >
            {trend.value}
          </span>
        )}
      </div>
    </div>
  )
}
