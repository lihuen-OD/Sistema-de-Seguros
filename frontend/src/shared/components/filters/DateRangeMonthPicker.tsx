import { CalendarDays } from 'lucide-react'
import clsx from 'clsx'

// Presets relative to reference date 2026-06-11
const PRESETS = [
  { label: '3M',       from: '2026-04', to: '2026-06' },
  { label: '6M',       from: '2026-01', to: '2026-06' },
  { label: '1A',       from: '2025-07', to: '2026-06' },
  { label: 'Este año', from: '2026-01', to: '2026-12' },
]

export interface DateRangeMonthPickerProps {
  from: string               // "YYYY-MM"
  to: string                 // "YYYY-MM"
  onChange: (from: string, to: string) => void
  className?: string
}

export function DateRangeMonthPicker({ from, to, onChange, className }: DateRangeMonthPickerProps) {
  const isPresetActive = (p: (typeof PRESETS)[number]) => p.from === from && p.to === to

  const inputCls = clsx(
    'border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white',
    'focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500',
    'tabular-nums cursor-pointer w-[130px]',
    '[&::-webkit-calendar-picker-indicator]:opacity-50',
    '[&::-webkit-calendar-picker-indicator]:hover:opacity-100',
    '[&::-webkit-calendar-picker-indicator]:cursor-pointer',
  )

  return (
    <div className={clsx('flex flex-wrap items-center gap-2', className)}>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <CalendarDays size={14} className="text-slate-400" />
        <span className="text-xs font-medium text-slate-500">Período</span>
      </div>

      <input
        type="month"
        value={from}
        max={to}
        onChange={(e) => { if (e.target.value) onChange(e.target.value, to) }}
        className={inputCls}
      />

      <span className="text-slate-300 text-sm select-none leading-none">→</span>

      <input
        type="month"
        value={to}
        min={from}
        onChange={(e) => { if (e.target.value) onChange(from, e.target.value) }}
        className={inputCls}
      />

      <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden ml-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.from, p.to)}
            className={clsx(
              'px-2.5 py-1.5 text-xs font-medium transition-colors border-r border-slate-200 last:border-r-0',
              isPresetActive(p)
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}
