import { CheckCircle2, X } from 'lucide-react'

interface AuditBulkApproveBarProps {
  selectedCount: number
  onApproveClick: () => void
  onClear: () => void
}

export function AuditBulkApproveBar({ selectedCount, onApproveClick, onClear }: AuditBulkApproveBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="px-5 py-2.5 bg-brand-50 border-b border-brand-100 flex flex-wrap items-center gap-3">
      <span className="text-sm font-medium text-brand-800">
        {selectedCount} auditoría{selectedCount !== 1 ? 's' : ''} seleccionada{selectedCount !== 1 ? 's' : ''}
      </span>
      <button
        type="button"
        onClick={onApproveClick}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
      >
        <CheckCircle2 size={13} />
        Aprobar seleccionadas
      </button>
      <button
        type="button"
        onClick={onClear}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 rounded-lg transition-colors ml-auto"
      >
        <X size={13} />
        Limpiar selección
      </button>
    </div>
  )
}
