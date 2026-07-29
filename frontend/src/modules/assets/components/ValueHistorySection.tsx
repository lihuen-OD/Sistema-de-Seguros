import { TrendingUp, Calendar } from 'lucide-react'
import clsx from 'clsx'
import { formatDate } from '../../../shared/utils/format'
import type { AssetValueEntry } from '../../../shared/types'

interface ValueHistorySectionProps {
  history: AssetValueEntry[]
  currentValue: string
}

function EntryColumn({
  entries,
  label,
  accent,
}: {
  entries: AssetValueEntry[]
  label: string
  accent: 'blue' | 'purple'
}) {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date))
  const colors =
    accent === 'purple'
      ? { header: 'text-purple-700', ring: 'bg-purple-100', icon: 'text-purple-500', value: 'text-purple-700', badge: 'text-purple-600' }
      : { header: 'text-brand-700', ring: 'bg-brand-100', icon: 'text-brand-500', value: 'text-brand-700', badge: 'text-brand-600' }

  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${colors.header}`}>{label}</p>
      {sorted.length === 0 ? (
        <div className="py-5 text-center text-xs text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
          Sin registros
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
          {sorted.map((h, idx) => {
            const isLatest = idx === 0
            return (
              <div key={h.id} className={clsx('flex items-center justify-between gap-3 px-3 py-2.5', isLatest && 'bg-slate-50')}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0', isLatest ? colors.ring : 'bg-slate-100')}>
                    <Calendar size={11} className={isLatest ? colors.icon : 'text-slate-400'} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700">{formatDate(h.date)}</p>
                    {h.notes && <p className="text-[10px] text-slate-400 truncate">{h.notes}</p>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={clsx('text-xs font-semibold font-mono tabular-nums', isLatest ? colors.value : 'text-slate-600')}>
                    US$ {h.valueUsd.toLocaleString('es-AR')}
                  </p>
                  {isLatest && <p className={clsx('text-[9px] font-bold uppercase tracking-wide', colors.badge)}>Actual</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ValueHistorySection({ history, currentValue }: ValueHistorySectionProps) {
  const realEntries = history.filter((e) => e.type === 'real')
  const nuevoEntries = history.filter((e) => e.type === 'nuevo')

  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-slate-800">Historial de valuaciones USD</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Se registra solo al guardar cambios en el valor patrimonial de arriba.
        </p>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <TrendingUp size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin historial de valuaciones registrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <EntryColumn entries={realEntries} label="Valor Patrimonial Real" accent="blue" />
          <EntryColumn entries={nuevoEntries} label="Valor Patrimonial a Nuevo" accent="purple" />
        </div>
      )}

      {currentValue && parseFloat(currentValue) > 0 && (
        <p className="text-xs text-slate-400 mt-2 text-right">
          Valor actual del formulario: US$ {parseFloat(currentValue).toLocaleString('es-AR')}
        </p>
      )}
    </div>
  )
}
