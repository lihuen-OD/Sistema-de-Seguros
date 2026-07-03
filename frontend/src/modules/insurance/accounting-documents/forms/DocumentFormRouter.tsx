import DocumentoFacturaForm from './DocumentoFacturaForm'
import DocumentoNotaCreditoForm from './DocumentoNotaCreditoForm'
import DocumentoNotaDebitoForm from './DocumentoNotaDebitoForm'
import DocumentoEndosoForm from './DocumentoEndosoForm'
import DocumentoAsientoAjusteForm from './DocumentoAsientoAjusteForm'
import DocumentoRefacturacionForm from './DocumentoRefacturacionForm'
import type { AccountingDocument, DocumentType } from '../../../../shared/types'

interface DocumentFormRouterProps {
  documentType: DocumentType
  initialDoc?: AccountingDocument
  sourcePolicyId?: string
}

// Elige el formulario dedicado según el tipo de documento — el tipo es
// inmutable una vez elegido (ver DocumentTypePicker / DocumentNewPage), así
// que no hace falta que cada formulario sepa manejar un cambio de tipo.
export function DocumentFormRouter({ documentType, initialDoc, sourcePolicyId }: DocumentFormRouterProps) {
  switch (documentType) {
    case 'INVOICE':
      return <DocumentoFacturaForm initialDoc={initialDoc} sourcePolicyId={sourcePolicyId} />
    case 'CREDIT_NOTE':
      return <DocumentoNotaCreditoForm initialDoc={initialDoc} />
    case 'DEBIT_NOTE':
      return <DocumentoNotaDebitoForm initialDoc={initialDoc} />
    case 'ENDORSEMENT':
      return <DocumentoEndosoForm initialDoc={initialDoc} />
    case 'ADJUSTMENT_ENTRY':
      return <DocumentoAsientoAjusteForm initialDoc={initialDoc} />
    case 'REBILLING':
      return <DocumentoRefacturacionForm initialDoc={initialDoc} />
    default:
      return null
  }
}
