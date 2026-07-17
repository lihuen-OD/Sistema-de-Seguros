import { Factory, Wrench, Building2, MoreHorizontal, MapPin } from 'lucide-react'
import type { FireExtinguisherStatusBucket } from '../../shared/api/fire-extinguishers.api'

const ZONE_ICONS: Record<string, React.ElementType> = {
  PLANTA: Factory,
  TALLER: Wrench,
  OFICINA: Building2,
  OTROS: MoreHorizontal,
}

const STATUS_COLORS = { vigente: '#10b981', proximo_vencer: '#f59e0b', vencido: '#ef4444' }

interface EstablishmentZoneCardProps {
  zone: FireExtinguisherStatusBucket
}

/** Tarjeta de una zona del "mapa esquemático" — vista lógica por establecimiento, no geográfica. */
export function EstablishmentZoneCard({ zone }: EstablishmentZoneCardProps) {
  const Icon = ZONE_ICONS[zone.establishment] ?? MapPin
  const segments = [
    { key: 'vigente', value: zone.vigente },
    { key: 'proximo_vencer', value: zone.proximo_vencer },
    { key: 'vencido', value: zone.vencido },
  ] as const

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0">
            <Icon size={16} />
          </div>
          <span className="text-sm font-semibold text-slate-800 truncate">{zone.establishment}</span>
        </div>
        <span className="text-lg font-bold text-slate-900 tabular-nums">{zone.total}</span>
      </div>

      {zone.total === 0 ? (
        <p className="text-xs text-slate-400">Sin matafuegos registrados</p>
      ) : (
        <>
          <div className="flex w-full h-1.5 rounded-full overflow-hidden bg-slate-100">
            {segments.map(
              (s) =>
                s.value > 0 && (
                  <div
                    key={s.key}
                    style={{ width: `${(s.value / zone.total) * 100}%`, backgroundColor: STATUS_COLORS[s.key] }}
                  />
                ),
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Vigentes: <strong className="text-slate-700">{zone.vigente}</strong></span>
            <span>Próx.: <strong className="text-slate-700">{zone.proximo_vencer}</strong></span>
            <span>Vencidos: <strong className="text-slate-700">{zone.vencido}</strong></span>
          </div>

          {zone.byLocationType.length > 1 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Por asignación física</p>
              {zone.byLocationType.map((lt) => (
                <div key={lt.locationType} className="flex items-center justify-between text-xs">
                  <span className="text-slate-600 truncate">{lt.locationType}</span>
                  <span className="text-slate-500 flex-shrink-0">
                    {lt.total}
                    {lt.vencido > 0 && <span className="text-red-500 font-medium"> ({lt.vencido} venc.)</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
