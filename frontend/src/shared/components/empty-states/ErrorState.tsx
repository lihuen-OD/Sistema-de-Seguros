import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'

interface ErrorStateProps {
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function ErrorState({
  title = 'Error al cargar',
  description = 'No se pudo cargar la información. Intentá nuevamente.',
  action,
  className,
}: ErrorStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-12 px-4 text-center', className)}>
      <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-3">
        <AlertTriangle size={22} className="text-red-500" />
      </div>
      <p className="text-sm font-semibold text-slate-700 mb-1">{title}</p>
      <p className="text-sm text-slate-500 max-w-xs">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
