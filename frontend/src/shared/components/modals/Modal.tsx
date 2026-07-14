import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import clsx from 'clsx'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface ModalProps {
  open: boolean
  onClose: () => void
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ElementType
  iconClassName?: string
  title?: ReactNode
  description?: ReactNode
  hideCloseButton?: boolean
  footer?: ReactNode
  closeOnBackdropClick?: boolean
  closeOnEscape?: boolean
  children?: ReactNode
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

export function Modal({
  open,
  onClose,
  size = 'sm',
  icon: Icon,
  iconClassName = 'bg-slate-100 text-slate-500',
  title,
  description,
  hideCloseButton = false,
  footer,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open || !closeOnEscape) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, closeOnEscape, onClose])

  // Foco: al abrir, entra al modal (primer elemento enfocable o el panel);
  // mientras está abierto, Tab/Shift+Tab queda atrapado adentro; al cerrar,
  // vuelve al elemento que lo abrió.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const firstFocusable = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    ;(firstFocusable ?? panel)?.focus()

    function handleTabTrap(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleTabTrap)
    return () => {
      window.removeEventListener('keydown', handleTabTrap)
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  const hasHeader = Boolean(title || description || Icon)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={closeOnBackdropClick ? onClose : undefined}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className={clsx(
          'relative z-10 w-full bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden outline-none',
          SIZE_CLASSES[size],
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {hasHeader && (
          <div className="flex items-start gap-4 px-6 pt-6 pb-4">
            {Icon && (
              <div className={clsx('flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center', iconClassName)}>
                <Icon size={20} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {title && <h3 className="text-sm font-semibold text-slate-900">{title}</h3>}
              {description && <p className="mt-1 text-sm text-slate-500 leading-relaxed">{description}</p>}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="flex-shrink-0 p-1 -m-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}

        {children && <div className={clsx('px-6', hasHeader ? 'pb-6' : 'py-6')}>{children}</div>}

        {footer && (
          <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
