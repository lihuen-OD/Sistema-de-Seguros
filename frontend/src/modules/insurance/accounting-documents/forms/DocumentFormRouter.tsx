import DocumentoFacturaForm from './DocumentoFacturaForm'
import DocumentoNotaCreditoForm from './DocumentoNotaCreditoForm'
import DocumentoNotaDebitoForm from './DocumentoNotaDebitoForm'
import DocumentoEndosoForm from './DocumentoEndosoForm'
import DocumentoAsientoAjusteForm from './DocumentoAsientoAjusteForm'
import type { AccountingDocument, DocumentType } from '../../../../shared/types'

interface DocumentFormRouterProps {
  documentType: DocumentType
  initialDoc?: AccountingDocument
  sourcePolicyId?: string
  sourceLinkedDocumentId?: string
}

// Elige el formulario dedicado según el tipo de documento — el tipo es
// inmutable una vez elegido (ver DocumentTypePicker / DocumentNewPage), así
// que no hace falta que cada formulario sepa manejar un cambio de tipo.
export function DocumentFormRouter({ documentType, initialDoc, sourcePolicyId, sourceLinkedDocumentId }: DocumentFormRouterProps) {
  switch (documentType) {
    case 'INVOICE':
      return <DocumentoFacturaForm initialDoc={initialDoc} sourcePolicyId={sourcePolicyId} />
    case 'CREDIT_NOTE':
      return <DocumentoNotaCreditoForm initialDoc={initialDoc} sourceLinkedDocumentId={sourceLinkedDocumentId} />
    case 'DEBIT_NOTE':
      return <DocumentoNotaDebitoForm initialDoc={initialDoc} sourceLinkedDocumentId={sourceLinkedDocumentId} />
    case 'ENDORSEMENT':
      return <DocumentoEndosoForm initialDoc={initialDoc} sourcePolicyId={sourcePolicyId} />
    case 'ADJUSTMENT_ENTRY':
      return <DocumentoAsientoAjusteForm initialDoc={initialDoc} sourceLinkedDocumentId={sourceLinkedDocumentId} />
    default:
      return null
  }
}
