import { Link } from 'react-router-dom'
import { CheckSquare } from 'lucide-react'
import type { InsuranceTypeConfig } from '../../../../shared/api/insurance-types.api'

// Checklist de coberturas de un tipo de seguro — usado tanto por la edición
// completa de póliza (PolicyEditPage) como por la reincorporación de una
// línea dada de baja (ReAddCoverageModal), para no duplicar el mismo
// checklist/estilo en los dos lugares.
export function CoverageSelector({
  insuranceType,
  insuranceTypes,
  selected,
  onChange,
  error,
  disabled,
}: {
  insuranceType: string
  insuranceTypes: InsuranceTypeConfig[]
  selected: string[]
  onChange: (v: string[]) => void
  error?: string
  disabled?: boolean
}) {
  const config = insuranceTypes.find((t) => t.label === insuranceType)

  if (!insuranceType) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-5 text-center">
        <CheckSquare size={18} className="mx-auto text-slate-300 mb-1.5" />
        <p className="text-sm text-slate-400">Seleccioná primero el tipo de seguro</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-400">Sin coberturas configuradas para este tipo.</p>
        <Link to="/settings/insurance-types" className="text-xs text-brand-600 hover:underline mt-1 block">
          Configurar tipos de seguro →
        </Link>
      </div>
    )
  }

  const coverageItems = config.coverageObjects ?? config.coverages.map((c) => ({ id: c, name: c }))

  const toggle = (id: string) => {
    if (disabled) return
    onChange(
      selected.includes(id)
        ? selected.filter((c) => c !== id)
        : [...selected, id],
    )
  }

  const allSelected = coverageItems.every((c) => selected.includes(c.id))
  const toggleAll = () => {
    if (disabled) return
    onChange(allSelected ? [] : coverageItems.map((c) => c.id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-slate-500">
          {selected.length === 0
            ? 'Ninguna seleccionada'
            : `${selected.length} de ${coverageItems.length} seleccionada${selected.length !== 1 ? 's' : ''}`}
        </p>
        {!disabled && (
          <button type="button" onClick={toggleAll} className="text-xs text-brand-600 hover:text-brand-700 font-medium">
            {allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
          </button>
        )}
      </div>

      <div className={`rounded-xl border border-slate-200 overflow-hidden ${disabled ? 'opacity-70' : ''}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2">
          {coverageItems.map((coverage, idx) => {
            const checked = selected.includes(coverage.id)
            const isLastRow = idx >= coverageItems.length - (coverageItems.length % 2 === 0 ? 2 : 1)
            return (
              <label
                key={coverage.id}
                className={[
                  'relative flex items-center gap-2.5 px-3 py-2 transition-colors select-none',
                  disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  checked ? 'bg-brand-50' : disabled ? 'bg-slate-50' : 'bg-white hover:bg-slate-50',
                  idx % 2 === 0 && idx < coverageItems.length - 1 ? 'sm:border-r border-slate-100' : '',
                  !isLastRow ? 'border-b border-slate-100' : '',
                ].join(' ')}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                  }`}
                >
                  {checked && (
                    <svg width="9" height="7" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(coverage.id)} className="sr-only" />
                <span className={`text-sm leading-snug ${checked ? 'text-brand-800 font-medium' : 'text-slate-700'}`}>
                  {coverage.name}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}
