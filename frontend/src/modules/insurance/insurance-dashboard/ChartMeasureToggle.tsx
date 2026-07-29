import clsx from 'clsx'

export type ChartMeasure = 'amount' | 'count'

interface ChartMeasureToggleProps {
  value: ChartMeasure
  onChange: (value: ChartMeasure) => void
}

const OPTIONS: { value: ChartMeasure; label: string }[] = [
  { value: 'amount', label: 'Gasto (USD)' },
  { value: 'count', label: 'Cantidad' },
]

export function ChartMeasureToggle({ value, onChange }: ChartMeasureToggleProps) {
  return (
    <div
      role="group"
      aria-label="Medida del gráfico"
      className="inline-flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-100 p-0.5"
    >
      {OPTIONS.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              isActive
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
