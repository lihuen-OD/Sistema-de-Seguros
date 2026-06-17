import type { AccountingDocument, DocumentPolicyAllocation, Installment } from '../../shared/types'
import { mockDocuments, mockDocumentAllocations } from '../../data/mock-documents'
import { mockInstallments } from '../../data/mock-installments'

export const accountingDocumentRepository = {
  findAll(): AccountingDocument[] {
    return [...mockDocuments]
  },

  create(data: Omit<AccountingDocument, 'id' | 'createdAt' | 'updatedAt'>): AccountingDocument {
    const today = new Date().toISOString().slice(0, 10)
    const doc: AccountingDocument = { ...data, id: `doc-${Date.now()}`, createdAt: today, updatedAt: today }
    mockDocuments.push(doc)
    return doc
  },

  findById(id: string): AccountingDocument | undefined {
    return mockDocuments.find((d) => d.id === id)
  },

  findByPaymentStatus(status: AccountingDocument['paymentStatus']): AccountingDocument[] {
    return mockDocuments.filter((d) => d.paymentStatus === status)
  },

  findByDocumentType(type: AccountingDocument['documentType']): AccountingDocument[] {
    return mockDocuments.filter((d) => d.documentType === type)
  },

  findAllocationsByDocument(documentId: string): DocumentPolicyAllocation[] {
    return mockDocumentAllocations.filter((a) => a.accountingDocumentId === documentId)
  },

  findAllocationsByPolicy(policyId: string): DocumentPolicyAllocation[] {
    return mockDocumentAllocations.filter((a) => a.policyId === policyId)
  },

  findInstallmentsByDocument(documentId: string): Installment[] {
    return mockInstallments.filter((i) => i.accountingDocumentId === documentId)
  },

  findAllInstallments(): Installment[] {
    return [...mockInstallments]
  },

  findInstallmentsByStatus(status: Installment['paymentStatus']): Installment[] {
    return mockInstallments.filter((i) => i.paymentStatus === status)
  },

  getTotalPending(): number {
    return mockDocuments
      .filter((d) => d.paymentStatus !== 'pagado')
      .reduce((sum, d) => sum + Math.abs(d.totalAmount), 0)
  },

  getTotalByStatus() {
    const paid = mockDocuments
      .filter((d) => d.paymentStatus === 'pagado')
      .reduce((sum, d) => sum + d.totalAmount, 0)
    const pending = mockDocuments
      .filter((d) => d.paymentStatus === 'pendiente')
      .reduce((sum, d) => sum + d.totalAmount, 0)
    const partial = mockDocuments
      .filter((d) => d.paymentStatus === 'parcial')
      .reduce((sum, d) => sum + d.totalAmount, 0)
    return { paid, pending, partial, total: paid + pending + partial }
  },
}
