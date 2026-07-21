import clsx from 'clsx'

export interface CheckboxOption {
  value: string
  label: string
}

export interface CheckboxGroupSection {
  label: string
  options: CheckboxOption[]
}

interface CheckboxGroupProps {
  sections: CheckboxGroupSection[]
  value: string[]
  onChange: (values: string[]) => void
}

// Multi-selección siempre visible, agrupada en secciones — a diferencia de
// MultiSelectFilter (dropdown colapsado, pensado para filtros de tabla), esto
// se usa en formularios donde conviene ver todas las opciones de una.
export function CheckboxGroup({ sections, value, onChange }: CheckboxGroupProps) {
  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.label}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
            {section.label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {section.options.map((opt) => {
              const checked = value.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                >
                  <span
                    className={clsx(
                      'w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                      checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300 bg-white hover:border-brand-400',
                    )}
                  >
                    {checked && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={clsx('text-sm', checked ? 'font-medium text-slate-700' : 'text-slate-500')}>
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
