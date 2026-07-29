import type { AccountingDocument } from '../types'

export const UNSPECIFIED_PAYMENT_METHOD = 'Sin especificar'

export function normalizePaymentMethod(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized || null
}

export function resolveDocumentPaymentMethod(
  documentId: string,
  documentsById: ReadonlyMap<string, AccountingDocument>,
): string {
  const visited = new Set<string>()
  let current = documentsById.get(documentId)

  while (current && !visited.has(current.id)) {
    visited.add(current.id)

    const ownPaymentMethod = normalizePaymentMethod(current.paymentMethod)
    if (ownPaymentMethod) return ownPaymentMethod

    current = current.linkedDocumentId
      ? documentsById.get(current.linkedDocumentId)
      : undefined
  }

  return UNSPECIFIED_PAYMENT_METHOD
}
