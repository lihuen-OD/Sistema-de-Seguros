import { FileText, TrendingDown, TrendingUp, FileEdit, Scale, Repeat } from 'lucide-react'
import { PageContent } from '../../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../../shared/components/page-header/PageHeader'
import type { DocumentType, DocumentTypeDef } from '../../../../shared/types'

const TYPE_ICONS: Record<DocumentType, React.ElementType> = {
  INVOICE: FileText,
  CREDIT_NOTE: TrendingDown,
  DEBIT_NOTE: TrendingUp,
  ENDORSEMENT: FileEdit,
  ADJUSTMENT_ENTRY: Scale,
  REBILLING: Repeat,
}

const TYPE_DESCRIPTIONS: Record<DocumentType, string> = {
  INVOICE: 'Genera deuda o costo. Se asocia a una o varias pólizas.',
  CREDIT_NOTE: 'Reduce el saldo de una factura existente.',
  DEBIT_NOTE: 'Aumenta el saldo de una factura, o funciona como documento propio.',
  ENDORSEMENT: 'Modifica una póliza — cobertura, vigencia o datos. No mueve saldo por sí mismo.',
  ADJUSTMENT_ENTRY: 'Corrige o netea el saldo de otro documento. Uso interno.',
  REBILLING: 'Reemplaza o corrige una factura original.',
}

// Orden de presentación pensado para el flujo más frecuente primero.
const TYPE_ORDER: DocumentType[] = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ENDORSEMENT', 'ADJUSTMENT_ENTRY', 'REBILLING']

interface DocumentTypePickerProps {
  documentTypes: DocumentTypeDef[]
  onSelect: (type: DocumentType) => void
}

export function DocumentTypePicker({ documentTypes, onSelect }: DocumentTypePickerProps) {
  const ordered = TYPE_ORDER.map((key) => documentTypes.find((t) => t.key === key)).filter(
    (t): t is DocumentTypeDef => !!t,
  )

  return (
    <PageContent>
      <PageHeader
        title="Nuevo Documento Contable"
        subtitle="Elegí el tipo de documento — cada uno tiene su propio formulario y comportamiento"
        backTo="/insurance/documents"
        backLabel="Volver a documentos"
      />

      <div className="max-w-4xl grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ordered.map((t) => {
          const Icon = TYPE_ICONS[t.key]
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onSelect(t.key)}
              className="flex items-start gap-3 text-left p-5 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                <Icon size={18} className="text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{t.label}</p>
                <p className="text-xs text-slate-500 mt-1 leading-snug">{TYPE_DESCRIPTIONS[t.key]}</p>
              </div>
            </button>
          )
        })}
      </div>
    </PageContent>
  )
}
