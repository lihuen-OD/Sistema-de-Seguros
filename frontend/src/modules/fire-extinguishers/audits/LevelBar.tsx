import clsx from 'clsx'
import { formatPercent } from '../../../shared/utils/format'

interface LevelBarProps {
  label: string
  level: number | null
  compact?: boolean
}

// Barra horizontal de nivel % — un solo color de alerta (rojo, <50%), el
// resto en tinta/gris. Reusada tanto en la card ancha "Nivel por punto de
// control" (compact=false) como en las mini-barras de cada card de sector
// (compact=true), para no duplicar el markup de la barra en dos lugares.
export function LevelBar({ label, level, compact = false }: LevelBarProps) {
  const isCritical = level != null && level < 50
  const widthPct = level ?? 0

  return (
    <div className={clsx('flex items-center gap-2', compact ? 'text-xs' : 'text-sm')}>
      <span className={clsx('flex-shrink-0 text-slate-500', compact ? 'w-28 truncate' : 'w-40')}>{label}</span>
      <div className={clsx('flex-1 rounded-full bg-slate-100 overflow-hidden', compact ? 'h-1.5' : 'h-2.5')}>
        <div
          className={clsx('h-full rounded-full', isCritical ? 'bg-red-500' : 'bg-slate-700')}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <span
        className={clsx(
          'flex-shrink-0 text-right font-semibold tabular-nums',
          compact ? 'w-10' : 'w-14',
          isCritical ? 'text-red-600' : 'text-slate-800',
        )}
      >
        {level != null ? formatPercent(level) : '—'}
      </span>
    </div>
  )
}
