import type { DocumentType, DocumentStatus, AdjustmentSign, EconomicImpactType } from '../types'

// Efecto económico neto de un documento contable, con signo, para reportes
// que suman montos totales SIN pasar por DocumentPolicyAllocation (ej. KPI de
// costo total, gráfico mensual). Factura y Nota de Débito suman; Nota de
// Crédito resta solo si está aplicada; Asiento de Ajuste suma o resta según su
// signo solo si está aplicado; Endoso suma o resta según su impacto económico
// solo si está aplicado; cualquier documento anulado no aporta.
export function getDocumentEconomicEffect(doc: {
  documentType: DocumentType
  documentStatus: DocumentStatus
  totalAmount: number
  adjustmentSign?: AdjustmentSign
  economicImpactType?: EconomicImpactType | null
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
      return doc.documentStatus === 'APPLIED'
        ? doc.totalAmount * (doc.economicImpactType === 'DECREASES_COST' ? -1 : 1)
        : 0
    default:
      return 0
  }
}

/**
 * Sentido económico de un documento (+1 suma, −1 resta, 0 no impacta), con la
 * MISMA regla que getDocumentEconomicEffect (tipo y estado). Lo usan las
 * tablas que reparten un documento por sus asignaciones: cada asignación
 * aporta |importe asignado| × sentido, así una NC aplicada resta aunque su
 * distribución se haya cargado con importes positivos, y una NC sin aplicar
 * no impacta — igual que el KPI.
 */
export function getDocumentEconomicDirection(doc: Parameters<typeof getDocumentEconomicEffect>[0]): -1 | 0 | 1 {
  return Math.sign(getDocumentEconomicEffect({ ...doc, totalAmount: 1 })) as -1 | 0 | 1
}
