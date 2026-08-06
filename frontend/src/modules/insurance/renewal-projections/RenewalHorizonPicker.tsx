import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'

const MONTH_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const PRESETS: { years: 1 | 2 | 3; label: string }[] = [
  { years: 1, label: '1 año' },
  { years: 2, label: '2 años' },
  { years: 3, label: '3 años' },
]

interface RenewalHorizonPickerProps {
  horizonYears: 1 | 2 | 3
  customEndMonthKey: string | null
  /** Ningún mes <= a este es seleccionable — no se puede proyectar hacia atrás. */
  lastRealMonthKey: string
  onSelectPreset: (years: 1 | 2 | 3) => void
  onSelectCustomEnd: (monthKey: string) => void
}

export function RenewalHorizonPicker({
  horizonYears,
  customEndMonthKey,
  lastRealMonthKey,
  onSelectPreset,
  onSelectCustomEnd,
}: RenewalHorizonPickerProps) {
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(() => Number(lastRealMonthKey.split('-')[0]))
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const [lastRealYear, lastRealMonth] = lastRealMonthKey.split('-').map(Number)

  function isDisabled(month: number): boolean {
    return viewYear < lastRealYear || (viewYear === lastRealYear && month <= lastRealMonth)
  }

  function isSelected(month: number): boolean {
    if (!customEndMonthKey) return false
    const [y, m] = customEndMonthKey.split('-').map(Number)
    return y === viewYear && m === month
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
        {PRESETS.map((p) => (
          <button
            key={p.years}
            onClick={() => onSelectPreset(p.years)}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-slate-200 last:border-r-0 ${
              !customEndMonthKey && horizonYears === p.years
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            customEndMonthKey
              ? 'bg-brand-50 border-brand-300 text-brand-700'
              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
          title="Elegir el período con un calendario"
        >
          <Calendar size={13} />
          {customEndMonthKey
            ? `Hasta ${MONTH_ABBR[Number(customEndMonthKey.split('-')[1]) - 1]} ${customEndMonthKey.split('-')[0]}`
            : 'Calendario'}
        </button>

        {open && (
          <div
            ref={panelRef}
            className="absolute left-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg p-3"
            style={{ width: 210 }}
          >
            <div className="flex items-center justify-between mb-2.5">
              <button type="button" onClick={() => setViewYear((y) => y - 1)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-semibold text-slate-700">{viewYear}</span>
              <button type="button" onClick={() => setViewYear((y) => y + 1)} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-50">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_ABBR.map((label, idx) => {
                const month = idx + 1
                const disabled = isDisabled(month)
                const selected = isSelected(month)
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelectCustomEnd(`${viewYear}-${String(month).padStart(2, '0')}`)
                      setOpen(false)
                    }}
                    className={`text-[11px] font-semibold py-1.5 rounded-md transition-colors ${
                      disabled
                        ? 'text-slate-300 cursor-not-allowed'
                        : selected
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-50 text-slate-700 hover:bg-brand-50'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-[10.5px] text-slate-400 leading-tight">
              Elegí el mes hasta el cual querés proyectar
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
