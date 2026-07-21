import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

interface PageHeaderProps {
  title: string
  subtitle?: string
  category?: string
  backTo?: string
  backLabel?: string
  actions?: React.ReactNode
  badge?: React.ReactNode
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  category,
  backTo,
  backLabel = 'Volver',
  actions,
  badge,
  className,
}: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className={clsx('mb-6', className)}>
      {backTo && (
        <button
          onClick={() => navigate(backTo)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 transition-colors group"
        >
          <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
          {backLabel}
        </button>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {category && (
            <p className="text-xs font-semibold text-brand-600 mb-1 uppercase tracking-wider">{category}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900 leading-tight">{title}</h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  )
}
