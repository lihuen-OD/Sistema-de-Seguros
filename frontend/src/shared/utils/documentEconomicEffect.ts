import type { DocumentType, DocumentStatus, AdjustmentSign } from '../types'

// Efecto económico neto de un documento contable, con signo, para reportes
// que suman montos totales SIN pasar por DocumentPolicyAllocation (ej. KPI de
// costo total, gráfico mensual). Factura y Nota de Débito suman; Nota de
// Crédito resta solo si está aplicada; Asiento de Ajuste suma o resta según su
// signo solo si está aplicado; Endoso y Refacturación no aportan; cualquier
// documento anulado no aporta.
export function getDocumentEconomicEffect(doc: {
  documentType: DocumentType
  documentStatus: DocumentStatus
  totalAmount: number
  adjustmentSign?: AdjustmentSign
}): number {
  if (doc.documentStatus === 'CANCELLED') return 0

  switch (doc.documentType) {
    case 'INVOICE':
    case 'DEBIT_NOTE':
      return doc.totalAmount
    case 'CREDIT_NOTE':
      return doc.documentStatus === 'APPLIED' ? -doc.totalAmount : 0
    case 'ADJUSTMENT_ENTRY':
      return doc.documentStatus === 'APPLIED'
        ? doc.totalAmount * (doc.adjustmentSign === 'NEGATIVE' ? -1 : 1)
        : 0
    case 'ENDORSEMENT':
    case 'REBILLING':
    default:
      return 0
  }
}
