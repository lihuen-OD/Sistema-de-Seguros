import { AlertTriangle, ChevronRight, Info } from 'lucide-react'
import { Badge } from '../../../shared/components/badges/Badge'
import type { ObservationCategory, ObservationSeverity } from './renewalObservations'

// Panel compacto de observaciones: cerrado ocupa una sola línea con el
// resumen (cuántas categorías requieren revisión y cuántas son informativas),
// así los KPIs quedan a la vista. Abierto, cada categoría muestra su cantidad
// de casos y se despliega con el detalle (activos, comprobantes y fechas).
// <details>/<summary> nativos: accesibles por teclado sin estado propio.

const SEVERITY_META: Record<ObservationSeverity, { label: string; icon: typeof AlertTriangle; iconClass: string; badge: 'warning' | 'default' }> = {
  review: { label: 'Requieren revisión', icon: AlertTriangle, iconClass: 'text-amber-600', badge: 'warning' },
  info: { label: 'Informativas', icon: Info, iconClass: 'text-slate-400', badge: 'default' },
}

function CategoryItem({ category }: { category: ObservationCategory }) {
  const meta = SEVERITY_META[category.severity]
  const Icon = meta.icon
  return (
    <li>
      <details className="group/cat">
        <summary className="flex cursor-pointer list-none items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <ChevronRight size={14} className="mt-0.5 flex-shrink-0 text-slate-400 transition-transform group-open/cat:rotate-90" />
          <Icon size={14} className={`mt-0.5 flex-shrink-0 ${meta.iconClass}`} />
          <span className="min-w-0 flex-1 text-sm text-slate-700">{category.title}</span>
          <Badge variant={meta.badge} className="tabular-nums">
            {category.count} {category.countUnit}
          </Badge>
        </summary>
        <div className="ml-8 mr-2 mb-2 mt-0.5">
          <p className="text-xs text-slate-500">{category.description}</p>
          {category.details.length > 0 && (
            <ul className="mt-1.5 max-h-64 overflow-y-auto divide-y divide-slate-100 rounded-md border border-slate-100">
              {category.details.map((d, i) => (
                <li key={`${d.assetName ?? ''}-${i}`} className="px-2.5 py-1.5 text-xs text-slate-600 break-words">
                  {d.assetName && <span className="font-medium text-slate-800">{d.assetName}: </span>}
                  {d.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </li>
  )
}

export function RenewalObservationsPanel({ observations }: { observations: ObservationCategory[] }) {
  if (observations.length === 0) return null
  const review = observations.filter((o) => o.severity === 'review')
  const info = observations.filter((o) => o.severity === 'info')
  const groups = [
    { severity: 'review' as const, items: review },
    { severity: 'info' as const, items: info },
  ].filter((g) => g.items.length > 0)

  return (
    <details
      className={`group mb-5 rounded-lg border bg-white ${review.length > 0 ? 'border-amber-200' : 'border-slate-200'}`}
      aria-label="Observaciones de la proyección"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <ChevronRight size={16} className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
          {review.length > 0 ? <AlertTriangle size={16} className="flex-shrink-0 text-amber-600" /> : <Info size={16} className="flex-shrink-0 text-slate-400" />}
          <span className="text-sm font-semibold text-slate-800">Observaciones</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          {review.length > 0 && (
            <Badge variant="warning">
              {review.length} {review.length === 1 ? 'requiere revisión' : 'requieren revisión'}
            </Badge>
          )}
          {info.length > 0 && (
            <Badge>
              {info.length} {info.length === 1 ? 'informativa' : 'informativas'}
            </Badge>
          )}
        </span>
        <span className="ml-auto hidden text-xs text-slate-400 sm:inline group-open:sm:hidden">Ver detalle</span>
        <span className="ml-auto hidden text-xs text-slate-400 group-open:sm:inline">Ocultar</span>
      </summary>
      <div className="border-t border-slate-100 px-2 py-2 sm:px-3">
        {groups.map((g) => (
          <section key={g.severity} className="py-1">
            <h3 className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{SEVERITY_META[g.severity].label}</h3>
            <ul>
              {g.items.map((c) => (
                <CategoryItem key={c.key} category={c} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}
