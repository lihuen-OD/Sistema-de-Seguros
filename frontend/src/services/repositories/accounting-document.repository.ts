import type { AccountingDocument, Currency, DocumentPolicyAllocation, Installment } from '../../shared/types'
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

  updateInstallment(
    id: string,
    updates: Partial<Pick<Installment, 'amount' | 'paymentStatus' | 'paidAt' | 'dueDate'>>,
  ): void {
    const idx = mockInstallments.findIndex((i) => i.id === id)
    if (idx >= 0) {
      mockInstallments[idx] = { ...mockInstallments[idx], ...updates }
    }
  },

  update(
    id: string,
    data: Partial<Omit<AccountingDocument, 'id' | 'createdAt'>>,
  ): void {
    const idx = mockDocuments.findIndex((d) => d.id === id)
    if (idx >= 0) {
      const today = new Date().toISOString().slice(0, 10)
      mockDocuments[idx] = { ...mockDocuments[idx], ...data, updatedAt: today }
    }
  },

  replaceAllocations(
    docId: string,
    allocations: Array<{ policyId: string; allocatedAmount: number; allocationPercentage: number }>,
  ): void {
    const removeIdx: number[] = []
    mockDocumentAllocations.forEach((a, i) => {
      if (a.accountingDocumentId === docId) removeIdx.push(i)
    })
    for (let i = removeIdx.length - 1; i >= 0; i--) {
      mockDocumentAllocations.splice(removeIdx[i], 1)
    }
    allocations.forEach((a, i) => {
      mockDocumentAllocations.push({
        id: `alloc-${docId}-${i}-${Date.now()}`,
        accountingDocumentId: docId,
        policyId: a.policyId,
        allocatedAmount: a.allocatedAmount,
        allocationPercentage: a.allocationPercentage,
      })
    })
  },

  replaceInstallments(
    docId: string,
    rows: Array<{ installmentNumber: number; dueDate: string; amount: number }>,
    currency: Currency,
  ): void {
    const existing = mockInstallments.filter((i) => i.accountingDocumentId === docId)
    const removeIdx: number[] = []
    mockInstallments.forEach((inst, i) => {
      if (inst.accountingDocumentId === docId) removeIdx.push(i)
    })
    for (let i = removeIdx.length - 1; i >= 0; i--) {
      mockInstallments.splice(removeIdx[i], 1)
    }
    rows.forEach((row) => {
      const prev = existing.find((e) => e.installmentNumber === row.installmentNumber)
      mockInstallments.push({
        id: prev?.id ?? `inst-${docId}-${row.installmentNumber}-${Date.now()}`,
        accountingDocumentId: docId,
        installmentNumber: row.installmentNumber,
        dueDate: row.dueDate,
        amount: row.amount,
        currency,
        paymentStatus: prev?.paymentStatus ?? 'pendiente',
        paidAt: prev?.paidAt ?? null,
      })
    })
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
