import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from '../modals/Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  // Mientras la acción confirmada está en curso: deshabilita ambos botones,
  // muestra un spinner en el de confirmar, y bloquea el cierre por backdrop
  // o Escape — sin esto, la request queda en vuelo sin ninguna señal visual
  // (ver DocumentDetailPage.tsx, aplicar/cancelar documento).
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="sm"
      hideCloseButton
      closeOnBackdropClick={!loading}
      closeOnEscape={!loading}
      icon={AlertTriangle}
      iconClassName={danger ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'}`}
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  )
}
