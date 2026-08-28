import { CheckboxGroup, type CheckboxGroupSection } from '../../../shared/components/forms/CheckboxGroup'
import type { AvailableAuditPeriod } from '../../../shared/api/fire-extinguisher-audits.api'
import { formatPeriodLabel } from './findingsReportFields'

interface CleanlinessHistoryPeriodPickerProps {
  // Ya viene ordenado desc (más reciente primero) — ver getAvailablePeriods (backend).
  availablePeriods: AvailableAuditPeriod[]
  selected: string[]
  onChange: (periods: string[]) => void
}

// formatPeriodLabel da "Agosto de 2026" — acá solo interesa "Agosto", el año
// ya está en el encabezado de la sección del CheckboxGroup.
function monthLabel(period: string): string {
  return formatPeriodLabel(period).split(' de ')[0]
}

const QUICK_PICK_COUNTS = [3, 6, 12]

export function CleanlinessHistoryPeriodPicker({ availablePeriods, selected, onChange }: CleanlinessHistoryPeriodPickerProps) {
  const sections: CheckboxGroupSection[] = []
  const byYear = new Map<string, AvailableAuditPeriod[]>()
  for (const p of availablePeriods) {
    const year = p.period.slice(0, 4)
    if (!byYear.has(year)) byYear.set(year, [])
    byYear.get(year)!.push(p)
  }
  // availablePeriods ya viene ordenado desc, así que el Map preserva año más
  // reciente primero sin necesidad de un sort extra acá.
  for (const [year, periods] of byYear) {
    sections.push({
      label: year,
      options: periods.map((p) => ({ value: p.period, label: `${monthLabel(p.period)} (${p.auditCount})` })),
    })
  }

  // "Últimos N" solo tiene sentido si selecciona MENOS que el total — con 2
  // meses cargados, "Últimos 3/6/12" seleccionarían los 2 iguales, tres
  // botones idénticos entre sí y contra "Seleccionar todos". Se ocultan para
  // no ofrecer una opción que no distingue nada.
  const quickPicks = QUICK_PICK_COUNTS.filter((count) => count < availablePeriods.length)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden">
            {quickPicks.map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => onChange(availablePeriods.slice(0, count).map((p) => p.period))}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors border-r border-slate-200 last:border-r-0"
              >
                Últimos {count}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(availablePeriods.map((p) => p.period))}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors border-r border-slate-200 last:border-r-0"
            >
              Seleccionar todos
            </button>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Limpiar
              </button>
            )}
          </div>
        </div>
        {/* Confirmación explícita de cuántos quedaron tildados — no depender
            solo de distinguir el estado de cada checkbox a simple vista. */}
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
          {selected.length} de {availablePeriods.length} mes{availablePeriods.length !== 1 ? 'es' : ''} seleccionado
          {selected.length !== 1 ? 's' : ''}
        </span>
      </div>

      <CheckboxGroup sections={sections} value={selected} onChange={onChange} />
    </div>
  )
}
