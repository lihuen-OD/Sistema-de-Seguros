import clsx from 'clsx'

export interface ChoiceOption {
  value: string
  label: string
}

interface ChoiceGroupProps {
  options: ChoiceOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}

/**
 * Selector tipo "píldoras" para preguntas de opción fija (SI/NO, escalas
 * cortas como limpieza/presión). Pensado para uso táctil — alguien
 * recorriendo la planta con el celular, no tipeando en un desktop — por eso
 * se prefiere a una serie de <select> para el checklist de auditoría.
 */
export function ChoiceGroup({ options, value, onChange, className }: ChoiceGroupProps) {
  return (
    <div className={clsx('flex flex-wrap gap-2', className)}>
      {options.map((option) => {
        const isActive = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={clsx(
              'px-3.5 py-2 text-sm font-medium rounded-full border transition-all',
              isActive
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
