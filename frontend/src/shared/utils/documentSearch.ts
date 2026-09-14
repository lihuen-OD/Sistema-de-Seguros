import { DOCUMENT_TYPE_LABELS } from '../constants'
import type { AccountingDocument } from '../types'

// Texto adicional (nunca mostrado, solo para filtrar) que le da al selector
// de "documento vinculado" (NC/ND/Endoso/Ajuste) más por qué buscar además
// del número de documento — tipo, aseguradora, fecha, moneda e importe, y la
// póliza si el documento ya trae sus allocations cargadas (no se pide un
// fetch nuevo para esto). Mismo patrón que buildAssetSearchKeywords/
// buildPolicySearchKeywords.
export function buildDocumentSearchKeywords(doc: AccountingDocument): string {
  return [
    doc.documentNumber,
    DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType,
    doc.insuranceCompany,
    doc.issueDate,
    doc.currency,
    String(doc.totalAmount),
    ...(doc.allocations ?? []).flatMap((a) => [a.policy?.policyNumber, a.policy?.insuranceCompany]),
  ]
    .filter(Boolean)
    .join(' ')
}
