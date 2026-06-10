import clsx from 'clsx'

interface FilterOption {
  value: string
  label: string
}

interface FilterItem {
  key: string
  label: string
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
}

interface FilterBarProps {
  filters: FilterItem[]
  className?: string
  children?: React.ReactNode
}

export function FilterBar({ filters, className, children }: FilterBarProps) {
  return (
    <div className={clsx('flex flex-wrap items-center gap-3', className)}>
      {filters.map((filter) => (
        <div key={filter.key} className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 whitespace-nowrap hidden sm:block">
            {filter.label}
          </label>
          <select
            value={filter.value}
            onChange={(e) => filter.onChange(e.target.value)}
            className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all min-w-[140px]"
          >
            <option value="">Todos</option>
            {filter.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {children}
    </div>
  )
}
