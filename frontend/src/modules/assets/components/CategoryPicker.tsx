import clsx from 'clsx'
import { Check } from 'lucide-react'
import { CATEGORY_GROUPS } from '../../../shared/constants/asset-categories'
import type { AssetCategory } from '../../../shared/types'

interface CategoryPickerProps {
  value: AssetCategory | ''
  onChange: (v: AssetCategory) => void
}

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  return (
    <div className="space-y-6">
      {CATEGORY_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
            {group.label}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {group.items.map((item) => {
              const selected = value === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChange(item.key)}
                  className={clsx(
                    'relative flex flex-col gap-2.5 p-3.5 rounded-xl border-2 text-left transition-all',
                    selected
                      ? 'border-brand-600 bg-brand-50/60 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60',
                  )}
                >
                  {selected && (
                    <span className="absolute top-2.5 right-2.5 w-4 h-4 bg-brand-600 rounded-full flex items-center justify-center">
                      <Check size={10} className="text-white" strokeWidth={3} />
                    </span>
                  )}
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', item.color)}>
                    <item.icon size={17} />
                  </div>
                  <div>
                    <p className={clsx('text-sm font-semibold leading-tight', selected ? 'text-brand-700' : 'text-slate-800')}>
                      {item.label}
                    </p>
                    <p className="text-xs text-slate-500 leading-snug mt-0.5 line-clamp-2">{item.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
