// Helper compartido entre documents.service.ts y documents-balance.service.ts
// para evitar duplicar la lógica de cálculo de totalAmount y un import
// circular entre ambos servicios.

export function computeTotalAmount(doc: {
  netAmount: number
  vatAmount: number
  otherTaxesAmount: number
}): number {
  return +(doc.netAmount + doc.vatAmount + doc.otherTaxesAmount).toFixed(2)
}
