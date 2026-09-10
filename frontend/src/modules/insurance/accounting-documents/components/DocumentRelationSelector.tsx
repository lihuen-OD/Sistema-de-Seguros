import { SearchableSelect } from '../../../../shared/components/forms/SearchableSelect'
import { buildDocumentSearchKeywords } from '../../../../shared/utils/documentSearch'
import type { AccountingDocument } from '../../../../shared/types'

interface DocumentRelationSelectorProps {
  documents: AccountingDocument[]
  value: string
  onChange: (id: string) => void
  // Ya no se pasa a ningún atributo nativo (SearchableSelect no es un
  // <select>) — se mantiene en la interfaz para no romper los call sites que
  // lo pasan hoy. La validación real de "documento vinculado requerido" vive
  // en el validate() de cada formulario (errors.linkedDocumentId), nunca
  // dependió solo de esto.
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
      <SearchableSelect
        value={value}
        onChange={onChange}
        placeholder="Seleccionar documento…"
        searchPlaceholder="Buscar por número, tipo, aseguradora, fecha, importe…"
        emptyOptionLabel="Seleccionar documento…"
        options={documents.map((d) => ({
          value: d.id,
          label: `${d.documentNumber} — ${d.issueDate} — ${d.currency === 'USD' ? 'US$' : 'AR$'} ${d.totalAmount.toLocaleString('es-AR')}`,
          keywords: buildDocumentSearchKeywords(d),
        }))}
      />
      {helperText && <p className="text-xs text-slate-400 mt-1">{helperText}</p>}
    </div>
  )
}
