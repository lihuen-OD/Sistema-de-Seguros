import type { ReactNode } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'

// Chrome de "Filtros avanzados" compartido por los 3 dominios de auditoría —
// puramente presentacional, sin lógica de filtros propia. Cada página sigue
// siendo dueña de su propio estado/lista de filtros; esto solo evita repetir
// el mismo botón/contenedor 3 veces. Copiado tal cual de
// FireExtinguisherAuditsQueuePage.tsx (fuente original), sin cambiar
// className/texto/comportamiento.

interface AdvancedFiltersToggleButtonProps {
  active: boolean
  count: number
  onClick: () => void
}

export function AdvancedFiltersToggleButton({ active, count, onClick }: AdvancedFiltersToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
        active || count > 0
          ? 'bg-brand-50 border-brand-300 text-brand-700'
          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
      }`}
    >
      <SlidersHorizontal size={14} />
      <span>Filtros avanzados{count > 0 ? ` · ${count}` : ''}</span>
    </button>
  )
}

interface AdvancedFiltersPanelProps {
  show: boolean
  activeCount: number
  onClear: () => void
  children: ReactNode
}

export function AdvancedFiltersPanel({ show, activeCount, onClear, children }: AdvancedFiltersPanelProps) {
  if (!show) return null
  return (
    <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50/60">
      {children}
      {activeCount > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <X size={12} />
          Limpiar filtros avanzados
        </button>
      )}
    </div>
  )
}
