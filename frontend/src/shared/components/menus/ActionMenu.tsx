import { useEffect, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface ActionMenuOption {
  label: string
  onClick: () => void
}

interface ActionMenuProps {
  triggerLabel: string
  triggerIcon: LucideIcon
  triggerClassName: string
  options: ActionMenuOption[]
  align?: 'left' | 'right'
  className?: string
}

// Popover chico y autocontenido para "elegí una de estas 2-3 acciones" — mismo
// mecanismo de apertura/cierre (click afuera cierra) que ya usa
// RenewalFieldSelectorPopover, generalizado acá para no reimplementarlo cada
// vez que aparece un botón que despliega un menú corto. `triggerClassName`
// queda 100% a cargo de quien lo usa para no imponer un estilo de botón único.
export function ActionMenu({ triggerLabel, triggerIcon: Icon, triggerClassName, options, align = 'left', className }: ActionMenuProps) {
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
    <div className={className ?? 'relative inline-block'}>
      <button ref={buttonRef} type="button" onClick={() => setOpen((v) => !v)} className={triggerClassName}>
        <Icon size={14} />
        {triggerLabel}
      </button>

      {open && (
        <div
          ref={panelRef}
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 z-30 min-w-[190px] bg-white border border-slate-200 rounded-xl shadow-lg py-1.5`}
        >
          {options.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => { setOpen(false); opt.onClick() }}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
