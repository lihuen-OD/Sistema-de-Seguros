import type { Prisma } from '@prisma/client'
import { toDateStr } from '../../shared/utils/dates'
import { computeTotalAmount } from './document-amounts'

// Criterio de búsqueda de documentos compartido por el selector de
// "documento vinculado" (documentsService.search) y el buscador global del
// Topbar (search.service.ts) — mismo patrón que assets/asset-search.ts.

export function buildDocumentSearchWhere(q: string): Prisma.AccountingDocumentWhereInput {
  return {
    OR: [
      { documentNumber: { contains: q, mode: 'insensitive' } },
      { insuranceCompany: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ],
  }
}

// El número de documento es el identificador — el buscador global antepone
// su coincidencia exacta a las parciales (caso particular de buildDocumentSearchWhere).
export function buildDocumentExactMatchWhere(q: string): Prisma.AccountingDocumentWhereInput {
  return { documentNumber: { equals: q, mode: 'insensitive' } }
}

export function isDocumentExactMatch(doc: { documentNumber: string }, q: string): boolean {
  return doc.documentNumber.toLowerCase() === q.toLowerCase()
}

export const DOCUMENT_SEARCH_SELECT = {
  id: true,
  documentNumber: true,
  documentType: true,
  issueDate: true,
  insuranceCompany: true,
  currency: true,
  netAmount: true,
  vatAmount: true,
  otherTaxesAmount: true,
  paymentStatus: true,
  paymentMethod: true,
} satisfies Prisma.AccountingDocumentSelect

type DocumentSearchRow = Prisma.AccountingDocumentGetPayload<{ select: typeof DOCUMENT_SEARCH_SELECT }>

export function mapDocumentSearchResult(doc: DocumentSearchRow) {
  return {
    id: doc.id,
    documentNumber: doc.documentNumber,
    type: doc.documentType,
    issueDate: toDateStr(doc.issueDate),
    insuranceCompany: doc.insuranceCompany,
    currency: doc.currency,
    totalAmount: computeTotalAmount(doc),
    paymentStatus: doc.paymentStatus,
    paymentMethod: doc.paymentMethod,
  }
}
