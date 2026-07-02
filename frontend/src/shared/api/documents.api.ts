import { apiClient } from './client'
import type {
  AccountingDocument,
  PaymentStatus,
  DocumentType,
  DocumentStatus,
  RelationType,
  AdjustmentSign,
  DocumentTypeDef,
  AdjustmentReasonOption,
  AccountingDocumentAttachment,
  Installment,
  DocumentPolicyAllocation,
  DocumentBalance,
  DocumentAuditLog,
} from '../types'

export interface DocumentForFinancial extends AccountingDocument {
  installments: Installment[]
  allocations: Pick<DocumentPolicyAllocation, 'id' | 'accountingDocumentId' | 'policyId' | 'allocatedAmount' | 'allocationPercentage'>[]
}

interface BackendDocument {
  id: string; documentNumber: string; documentType: string; documentStatus: string; issueDate: string
  netAmount: number; vatAmount: number; otherTaxesAmount: number; totalAmount: number
  currency: string; exchangeRate: number; description: string | null
  paymentStatus: string; insuranceCompany: string | null; paymentMethod: string | null
  linkedDocumentId: string | null; relationType: string | null
  adjustmentReason: string | null; adjustmentSign: string | null
  createdAt: string; updatedAt: string
  allocations?: { policyId: string }[]
  _count?: { attachments: number }
}

interface BackendAllocation {
  id: string
  accountingDocumentId: string
  policyId: string
  allocatedAmount: number
  allocationPercentage: number
  policy?: { id: string; policyNumber: string; insuredName: string }
}

interface BackendInstallment {
  id: string
  accountingDocumentId: string
  installmentNumber: number
  dueDate: string
  amount: number
  currency: string
  paymentStatus: string
  paidAt: string | null
  paymentMethod: string | null
  notes: string | null
}

interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function mapDocument(b: BackendDocument): AccountingDocument {
  return {
    id: b.id,
    documentType: b.documentType as DocumentType,
    documentStatus: b.documentStatus as DocumentStatus,
    documentNumber: b.documentNumber,
    issueDate: b.issueDate?.slice(0, 10) ?? '',
    currency: b.currency,
    exchangeRate: b.exchangeRate,
    netAmount: b.netAmount,
    vatAmount: b.vatAmount,
    otherTaxesAmount: b.otherTaxesAmount,
    totalAmount: b.totalAmount,
    paymentStatus: b.paymentStatus as PaymentStatus,
    insuranceCompany: b.insuranceCompany ?? undefined,
    paymentMethod: b.paymentMethod ?? undefined,
    linkedDocumentId: b.linkedDocumentId ?? undefined,
    relationType: (b.relationType as RelationType) ?? undefined,
    adjustmentReason: b.adjustmentReason ?? undefined,
    adjustmentSign: (b.adjustmentSign as AdjustmentSign) ?? undefined,
    policyIds: b.allocations?.map((a) => a.policyId) ?? [],
    attachmentsCount: b._count?.attachments ?? 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface AllocationInput {
  policyId: string
  allocatedAmount: number
  allocationPercentage: number
}

export interface InstallmentInput {
  installmentNumber: number
  dueDate: string
  amount: number
}

export interface DocumentCreateInput {
  documentType: string; documentNumber: string; issueDate: string
  netAmount: number; vatAmount?: number; otherTaxesAmount?: number
  currency?: string; exchangeRate?: number; description?: string
  insuranceCompany?: string; paymentMethod?: string; linkedDocumentId?: string
  documentStatus?: DocumentStatus; adjustmentReason?: string; adjustmentSign?: AdjustmentSign
  allocations?: AllocationInput[]
  installments?: InstallmentInput[]
}

export const documentsApi = {
  async getTypes(): Promise<{ types: DocumentTypeDef[]; adjustmentReasons: AdjustmentReasonOption[] }> {
    const res = await apiClient.get<{ data: { types: DocumentTypeDef[]; adjustmentReasons: AdjustmentReasonOption[] } }>(
      '/documents/types',
    )
    return res.data.data
  },

  async findAll(): Promise<AccountingDocument[]> {
    const res = await apiClient.get<Paginated<BackendDocument>>('/documents', { params: { limit: 200 } })
    return res.data.data.map(mapDocument)
  },

  async findAllForFinancial(params?: { from?: string; to?: string }): Promise<DocumentForFinancial[]> {
    const res = await apiClient.get<{ data: (Omit<BackendDocument, 'allocations'> & {
      installments: BackendInstallment[]
      allocations: BackendAllocation[]
    })[] }>('/documents/financial', { params })
    return res.data.data.map((b) => ({
      ...mapDocument(b),
      installments: b.installments.map((i) => ({
        id: i.id,
        accountingDocumentId: i.accountingDocumentId,
        installmentNumber: i.installmentNumber,
        dueDate: i.dueDate?.slice(0, 10) ?? '',
        amount: i.amount,
        currency: i.currency as Installment['currency'],
        paymentStatus: i.paymentStatus as Installment['paymentStatus'],
        paidAt: i.paidAt,
      })),
      allocations: b.allocations.map((a) => ({
        id: a.id,
        accountingDocumentId: a.accountingDocumentId,
        policyId: a.policyId,
        allocatedAmount: a.allocatedAmount,
        allocationPercentage: a.allocationPercentage,
      })),
    }))
  },

  async findById(id: string): Promise<AccountingDocument> {
    const res = await apiClient.get<{ data: BackendDocument }>(`/documents/${id}`)
    return mapDocument(res.data.data)
  },

  async create(input: DocumentCreateInput): Promise<AccountingDocument> {
    const res = await apiClient.post<{ data: BackendDocument }>('/documents', input)
    return mapDocument(res.data.data)
  },

  async update(id: string, input: Partial<Omit<DocumentCreateInput, 'documentNumber' | 'allocations' | 'installments'>>): Promise<AccountingDocument> {
    const res = await apiClient.put<{ data: BackendDocument }>(`/documents/${id}`, input)
    return mapDocument(res.data.data)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/documents/${id}`)
  },

  async getBalance(id: string): Promise<DocumentBalance> {
    const res = await apiClient.get<{ data: DocumentBalance }>(`/documents/${id}/balance`)
    return res.data.data
  },

  async apply(id: string): Promise<AccountingDocument> {
    const res = await apiClient.post<{ data: BackendDocument }>(`/documents/${id}/apply`)
    return mapDocument(res.data.data)
  },

  async cancel(id: string, reason?: string): Promise<AccountingDocument> {
    const res = await apiClient.post<{ data: BackendDocument }>(`/documents/${id}/cancel`, { reason })
    return mapDocument(res.data.data)
  },

  async getAuditLog(id: string): Promise<DocumentAuditLog[]> {
    const res = await apiClient.get<{ data: DocumentAuditLog[] }>(`/documents/${id}/audit-log`)
    return res.data.data
  },

  async checkDocumentNumber(documentNumber: string): Promise<{ exists: boolean }> {
    const res = await apiClient.get<{ data: { exists: boolean } }>('/documents/check-number', {
      params: { documentNumber },
    })
    return res.data.data
  },

  async findAllocations(documentId: string): Promise<BackendAllocation[]> {
    const res = await apiClient.get<{ data: BackendAllocation[] }>(`/documents/${documentId}/allocations`)
    return res.data.data
  },

  async findAllocationsBulk(documentIds: string[]): Promise<BackendAllocation[]> {
    if (documentIds.length === 0) return []
    const res = await apiClient.get<{ data: BackendAllocation[] }>('/documents/bulk/allocations', {
      params: { ids: documentIds.join(',') },
    })
    return res.data.data
  },

  async replaceAllocations(documentId: string, allocations: AllocationInput[]): Promise<void> {
    await apiClient.put(`/documents/${documentId}/allocations`, { allocations })
  },

  async findInstallments(documentId: string): Promise<BackendInstallment[]> {
    const res = await apiClient.get<{ data: BackendInstallment[] }>(`/documents/${documentId}/installments`)
    return res.data.data
  },

  async findInstallmentsBulk(documentIds: string[]): Promise<BackendInstallment[]> {
    if (documentIds.length === 0) return []
    const res = await apiClient.get<{ data: BackendInstallment[] }>('/documents/bulk/installments', {
      params: { ids: documentIds.join(',') },
    })
    return res.data.data
  },

  async replaceInstallments(documentId: string, installments: InstallmentInput[]): Promise<void> {
    await apiClient.put(`/documents/${documentId}/installments`, { installments })
  },

  async updateInstallment(
    documentId: string,
    installmentId: string,
    updates: { amount?: number; paymentStatus?: string; paidAt?: string | null; dueDate?: string },
  ): Promise<void> {
    const body: Record<string, unknown> = {}
    if (updates.amount !== undefined) body.amount = updates.amount
    if (updates.paymentStatus !== undefined) body.paymentStatus = updates.paymentStatus
    if (updates.dueDate !== undefined) body.dueDate = updates.dueDate
    if ('paidAt' in updates) body.paymentDate = updates.paidAt
    await apiClient.put(`/documents/${documentId}/installments/${installmentId}`, body)
  },

  async findAttachments(documentId: string): Promise<AccountingDocumentAttachment[]> {
    const res = await apiClient.get<{ data: AccountingDocumentAttachment[] }>(`/documents/${documentId}/attachments`)
    return res.data.data
  },

  async addAttachment(
    documentId: string,
    file: File,
    meta: { description?: string },
  ): Promise<AccountingDocumentAttachment> {
    const form = new FormData()
    form.append('file', file)
    if (meta.description) form.append('description', meta.description)
    const res = await apiClient.post<{ data: AccountingDocumentAttachment }>(
      `/documents/${documentId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.data
  },

  async deleteAttachment(documentId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/attachments/${attachmentId}`)
  },
}
