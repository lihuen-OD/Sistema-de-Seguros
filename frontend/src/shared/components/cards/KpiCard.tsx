import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  info:    { icon: 'bg-brand-100 text-brand-600',       label: 'text-brand-600',    border: 'border-l-2 border-l-brand-400' },
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
  const valueRef = useRef<HTMLSpanElement>(null)
  const [tooltip, setTooltip] = useState<{ top: number; left: number } | null>(null)

  // El valor puede truncarse en cards angostas (montos largos). Si no está
  // truncado, no hay nada que mostrar — solo abrimos el popover cuando
  // scrollWidth > clientWidth (overflow real, no un chequeo por longitud fija).
  const showValueTooltip = () => {
    const el = valueRef.current
    if (!el || el.scrollWidth <= el.clientWidth) return
    const rect = el.getBoundingClientRect()
    const POPOVER_MAX_W = 260
    let left = rect.left
    if (left + POPOVER_MAX_W > window.innerWidth - 16) left = window.innerWidth - POPOVER_MAX_W - 16
    if (left < 8) left = 8
    setTooltip({ top: rect.bottom + 6, left })
  }
  const hideValueTooltip = () => setTooltip(null)

  // En touch no existe mouseleave — sin esto el popover quedaría abierto
  // para siempre después de un tap. Se cierra al tocar/clickear afuera.
  useEffect(() => {
    if (!tooltip) return
    function handleOutside(e: Event) {
      if (valueRef.current?.contains(e.target as Node)) return
      hideValueTooltip()
    }
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('mousedown', handleOutside)
    return () => {
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('mousedown', handleOutside)
    }
  }, [tooltip])

  return (
    <div
      className={clsx(
        'card p-5 flex flex-col gap-3',
        styles.border,
        onClick && 'cursor-pointer hover:border-brand-300 hover:shadow-md transition-all',
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
        <span
          ref={valueRef}
          className="text-2xl font-bold text-slate-900 leading-none block truncate cursor-default"
          onMouseEnter={showValueTooltip}
          onMouseLeave={hideValueTooltip}
          onClick={(e) => {
            // En touch no hay hover — el tap togglea el popover. stopPropagation
            // evita que además dispare el onClick de la card (si lo tuviera).
            e.stopPropagation()
            if (tooltip) {
              hideValueTooltip()
            } else {
              showValueTooltip()
            }
          }}
        >
          {value}
        </span>
        {tooltip &&
          createPortal(
            <div
              className="overflow-cell-popover"
              style={{ top: tooltip.top, left: tooltip.left, maxWidth: 260 }}
              onMouseEnter={showValueTooltip}
              onMouseLeave={hideValueTooltip}
            >
              {value}
            </div>,
            document.body,
          )}
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
