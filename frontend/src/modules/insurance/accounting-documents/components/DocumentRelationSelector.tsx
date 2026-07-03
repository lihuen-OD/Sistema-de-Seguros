import { FormSelect } from '../../../../shared/components/forms/FormSection'
import type { AccountingDocument } from '../../../../shared/types'

interface DocumentRelationSelectorProps {
  documents: AccountingDocument[]
  value: string
  onChange: (id: string) => void
  required?: boolean
  helperText?: string
  emptyMessage?: string
}

// Select de "documento vinculado" reutilizado por NC, ND, Endoso, Ajuste y
// Refacturación. El filtrado por tipo/estado/compañía es responsabilidad de
// cada formulario (no vive acá) — a propósito, para no recrear un único
// "isRefDoc" genérico que mezcle las reglas de los 5 tipos distintos.
export function DocumentRelationSelector({
  documents,
  value,
  onChange,
  required,
  helperText,
  emptyMessage,
}: DocumentRelationSelectorProps) {
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-4 text-center">
        <p className="text-sm text-slate-400">
          {emptyMessage ?? 'No hay documentos disponibles para vincular.'}
        </p>
      </div>
    )
  }

  return (
    <div>
      <FormSelect value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        <option value="">Seleccionar documento…</option>
        {documents.map((d) => (
          <option key={d.id} value={d.id}>
            {d.documentNumber} — {d.issueDate} — {d.currency === 'USD' ? 'US$' : 'AR$'}{' '}
            {d.totalAmount.toLocaleString('es-AR')}
          </option>
        ))}
      </FormSelect>
      {helperText && <p className="text-xs text-slate-400 mt-1">{helperText}</p>}
    </div>
  )
}
