import { useState } from 'react'
import { Plus, Check, TrendingUp, Calendar } from 'lucide-react'
import clsx from 'clsx'
import { formatDate } from '../../../shared/utils/format'
import type { AssetValueEntry } from '../../../shared/types'

type NewValueEntry = { date: string; valueUsd: string; type: 'real' | 'nuevo'; notes: string }
const EMPTY: NewValueEntry = { date: '', valueUsd: '', type: 'real', notes: '' }

interface ValueHistorySectionProps {
  history: AssetValueEntry[]
  currentValue: string
  onAdd: (entry: Omit<AssetValueEntry, 'id'>) => void
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
      : { header: 'text-blue-700', ring: 'bg-blue-100', icon: 'text-blue-500', value: 'text-blue-700', badge: 'text-blue-600' }

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

export function ValueHistorySection({ history, currentValue, onAdd }: ValueHistorySectionProps) {
  const [adding, setAdding] = useState(false)
  const [entry, setEntry] = useState<NewValueEntry>(EMPTY)

  const realEntries = history.filter((e) => e.type === 'real')
  const nuevoEntries = history.filter((e) => e.type === 'nuevo')

  function handleAdd() {
    if (!entry.date || !entry.valueUsd) return
    onAdd({
      date: entry.date,
      valueUsd: parseFloat(entry.valueUsd),
      type: entry.type,
      notes: entry.notes.trim() || undefined,
    })
    setEntry(EMPTY)
    setAdding(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Historial de valuaciones USD</p>
          <p className="text-xs text-slate-500 mt-0.5">Registro histórico para seguimiento patrimonial.</p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            <Plus size={14} />
            Nueva entrada
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Nueva entrada de valuación</p>
          <div className="flex gap-2 mb-3">
            {(['real', 'nuevo'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setEntry((p) => ({ ...p, type: t }))}
                className={clsx(
                  'flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors',
                  entry.type === t
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300',
                )}
              >
                {t === 'real' ? 'Valor Patrimonial Real' : 'Valor Patrimonial a Nuevo'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
              <input
                type="date"
                value={entry.date}
                onChange={(e) => setEntry((p) => ({ ...p, date: e.target.value }))}
                className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor USD</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">$</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Ej: 32000"
                  value={entry.valueUsd}
                  onChange={(e) => setEntry((p) => ({ ...p, valueUsd: e.target.value }))}
                  className="w-full text-sm rounded-lg border border-slate-200 bg-white pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
              <input
                type="text"
                placeholder="Ej: Revaluación por tasador externo"
                value={entry.notes}
                onChange={(e) => setEntry((p) => ({ ...p, notes: e.target.value }))}
                className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={!entry.date || !entry.valueUsd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <Check size={14} />
              Registrar
            </button>
            <button
              type="button"
              onClick={() => { setAdding(false); setEntry(EMPTY) }}
              className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {history.length === 0 && !adding ? (
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
