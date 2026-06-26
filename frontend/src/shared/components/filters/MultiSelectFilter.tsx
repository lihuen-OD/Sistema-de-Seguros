import { useState, useEffect, useRef } from 'react'
import { ChevronDown, X } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface Props {
  label: string
  options: Option[]
  value: string[]
  onChange: (values: string[]) => void
  className?: string
}

export function MultiSelectFilter({ label, options, value, onChange, className }: Props) {
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

  function toggle(v: string) {
    if (value.includes(v)) {
      onChange(value.filter((x) => x !== v))
    } else {
      onChange([...value, v])
    }
  }

  const hasSelection = value.length > 0
  const buttonLabel = hasSelection
    ? `${label} · ${value.length}`
    : label

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
          open || hasSelection
            ? 'bg-blue-50 border-blue-300 text-blue-700'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
        }`}
      >
        <span>{buttonLabel}</span>
        {hasSelection ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]) }}
            className="ml-0.5 p-0.5 rounded hover:bg-blue-100 transition-colors"
            title="Limpiar filtro"
          >
            <X size={11} />
          </button>
        ) : (
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1.5 z-30 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
          style={{ minWidth: 180 }}
        >
          <div className="py-1 max-h-64 overflow-y-auto">
            {/* Todos */}
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors"
            >
              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                !hasSelection
                  ? 'border-blue-600 bg-blue-600'
                  : 'border-slate-300 bg-white'
              }`}>
                {!hasSelection && (
                  <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                    <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span className={`text-sm ${!hasSelection ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                Todos
              </span>
            </button>

            {/* Options */}
            {options.map((opt) => {
              const checked = value.includes(opt.value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors"
                >
                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    checked
                      ? 'border-blue-600 bg-blue-600'
                      : 'border-slate-300 bg-white hover:border-blue-400'
                  }`}>
                    {checked && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-sm ${checked ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
