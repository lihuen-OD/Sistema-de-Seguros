import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'

interface OverflowCellProps {
  value?: string | null
  className?: string
  lines?: 1 | 2 | 3
  emptyLabel?: string
}

export function OverflowCell({
  value,
  className,
  lines = 2,
  emptyLabel = '—',
}: OverflowCellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)

  if (!value) {
    return <span className="text-slate-400 text-xs">{emptyLabel}</span>
  }

  const handleEnter = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()

    const POPOVER_W = 300
    const ESTIMATE_H = 110

    let left = rect.left
    let top = rect.bottom + 8

    if (left + POPOVER_W > window.innerWidth - 16) left = window.innerWidth - POPOVER_W - 16
    if (left < 8) left = 8
    if (top + ESTIMATE_H > window.innerHeight - 16) top = rect.top - ESTIMATE_H - 8

    setCoords({ top, left })
    setIsOpen(true)
  }

  return (
    <>
      <div
        ref={triggerRef}
        className={clsx('overflow-cell-trigger', `lines-${lines}`, className)}
        onMouseEnter={handleEnter}
        onMouseLeave={() => setIsOpen(false)}
      >
        {value}
      </div>
      {isOpen &&
        createPortal(
          <div
            className="overflow-cell-popover"
            style={{ top: coords.top, left: coords.left }}
            onMouseEnter={() => setIsOpen(true)}
            onMouseLeave={() => setIsOpen(false)}
          >
            {value}
          </div>,
          document.body,
        )}
    </>
  )
}
