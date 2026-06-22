import { apiClient } from './client'
import type { AccountingDocument, PaymentStatus, AccountingDocumentAttachment } from '../types'

interface BackendDocument {
  id: string; documentNumber: string; documentType: string; issueDate: string
  netAmount: number; vatAmount: number; otherTaxesAmount: number; totalAmount: number
  currency: string; exchangeRate: number; description: string | null
  paymentStatus: string; insuranceCompany: string | null; paymentMethod: string | null
  linkedDocumentId: string | null; createdAt: string; updatedAt: string
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function mapDocument(b: BackendDocument): AccountingDocument {
  return {
    id: b.id,
    documentType: b.documentType,
    documentNumber: b.documentNumber,
    issueDate: b.issueDate,
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
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface DocumentCreateInput {
  documentType: string; documentNumber: string; issueDate: string
  netAmount: number; vatAmount?: number; otherTaxesAmount?: number
  currency?: string; exchangeRate?: number; description?: string
  insuranceCompany?: string; paymentMethod?: string; linkedDocumentId?: string
}

export const documentsApi = {
  async findAll(): Promise<AccountingDocument[]> {
    const res = await apiClient.get<Paginated<BackendDocument>>('/documents', { params: { limit: 200 } })
    return res.data.data.map(mapDocument)
  },

  async findById(id: string): Promise<AccountingDocument> {
    const res = await apiClient.get<{ data: BackendDocument }>(`/documents/${id}`)
    return mapDocument(res.data.data)
  },

  async create(input: DocumentCreateInput): Promise<AccountingDocument> {
    const res = await apiClient.post<{ data: BackendDocument }>('/documents', input)
    return mapDocument(res.data.data)
  },

  async update(id: string, input: Partial<Omit<DocumentCreateInput, 'documentNumber'>>): Promise<AccountingDocument> {
    const res = await apiClient.put<{ data: BackendDocument }>(`/documents/${id}`, input)
    return mapDocument(res.data.data)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/documents/${id}`)
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
