import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export type BreakdownFieldKey = 'net' | 'vat' | 'other' | 'total'

export const BREAKDOWN_FIELD_DEFS: { key: BreakdownFieldKey; label: string }[] = [
  { key: 'net', label: 'Neto' },
  { key: 'vat', label: 'IVA' },
  { key: 'other', label: 'Otros impuestos' },
  { key: 'total', label: 'Total' },
]

interface RenewalFieldSelectorPopoverProps {
  selected: BreakdownFieldKey[]
  onToggle: (key: BreakdownFieldKey) => void
}

export function RenewalFieldSelectorPopover({ selected, onToggle }: RenewalFieldSelectorPopoverProps) {
  const [open, setOpen] = useState(false)
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

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          open || selected.length > 0
            ? 'bg-brand-50 border-brand-300 text-brand-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
        }`}
        title="Elegir qué mostrar arriba de cada mes"
      >
        Detalle por mes
        {selected.length > 0 && (
          <span className="text-[10px] font-bold bg-brand-600 text-white px-1.5 py-0.5 rounded-full leading-none">
            {selected.length}
          </span>
        )}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5"
          style={{ width: 190 }}
        >
          <p className="px-3 pb-1.5 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide">
            Mostrar arriba de cada mes
          </p>
          {BREAKDOWN_FIELD_DEFS.map((f) => {
            const checked = selected.includes(f.key)
            return (
              <label
                key={f.key}
                className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(f.key)}
                  className="w-3.5 h-3.5 rounded accent-brand-600"
                />
                {f.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
