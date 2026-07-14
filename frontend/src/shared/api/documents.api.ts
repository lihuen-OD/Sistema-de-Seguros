import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { triggerBlobDownload } from '../utils/downloadFile'
import type {
  AccountingDocument,
  PaymentStatus,
  DocumentType,
  DocumentStatus,
  RelationType,
  AdjustmentSign,
  EconomicImpactType,
  DocumentTypeDef,
  AdjustmentReasonOption,
  EndorsementTypeOption,
  EconomicImpactTypeOption,
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
  policyId: string | null; economicImpactType: string | null
  endorsementType: string | null; endorsementEffectiveDate: string | null
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
    description: b.description ?? null,
    linkedDocumentId: b.linkedDocumentId ?? undefined,
    relationType: (b.relationType as RelationType) ?? undefined,
    adjustmentReason: b.adjustmentReason ?? undefined,
    adjustmentSign: (b.adjustmentSign as AdjustmentSign) ?? undefined,
    policyId: b.policyId ?? null,
    economicImpactType: (b.economicImpactType as EconomicImpactType) ?? null,
    endorsementType: b.endorsementType ?? null,
    endorsementEffectiveDate: b.endorsementEffectiveDate?.slice(0, 10) ?? null,
    // Incluye tanto las pólizas asignadas financieramente (allocations) como la
    // póliza propia del Endoso — sin esto, los Endosos no aparecerían en
    // ninguna vista que filtre "documentos de esta póliza" por policyIds.
    policyIds: [
      ...new Set([...(b.allocations?.map((a) => a.policyId) ?? []), ...(b.policyId ? [b.policyId] : [])]),
    ],
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
  policyId?: string; economicImpactType?: EconomicImpactType
  endorsementType?: string; endorsementEffectiveDate?: string
  allocations?: AllocationInput[]
  installments?: InstallmentInput[]
}

export interface SendDocumentEmailInput {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  message?: string
}

export interface SendDocumentEmailResult {
  sent: boolean
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED' | 'CANCELLED'
  to: string[]
}

export interface DocumentTypesResponse {
  types: DocumentTypeDef[]
  adjustmentReasons: AdjustmentReasonOption[]
  endorsementTypes: EndorsementTypeOption[]
  economicImpactTypes: EconomicImpactTypeOption[]
}

export const documentsApi = {
  async getTypes(): Promise<DocumentTypesResponse> {
    const res = await apiClient.get<{ data: DocumentTypesResponse }>('/documents/types')
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

  async sendEmail(id: string, payload: SendDocumentEmailInput): Promise<SendDocumentEmailResult> {
    const res = await apiClient.post<{ data: SendDocumentEmailResult }>(`/documents/${id}/send-email`, payload)
    return res.data.data
  },

  async getAuditLog(id: string): Promise<DocumentAuditLog[]> {
    const res = await apiClient.get<{ data: DocumentAuditLog[] }>(`/documents/${id}/audit-log`)
    return res.data.data
  },

  async checkDocumentNumber(
    documentNumber: string,
    documentType?: string,
    insuranceCompany?: string,
  ): Promise<{ exists: boolean }> {
    const res = await apiClient.get<{ data: { exists: boolean } }>('/documents/check-number', {
      params: { documentNumber, documentType, insuranceCompany },
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

  async downloadAttachment(documentId: string, attachmentId: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/documents/${documentId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
    triggerBlobDownload(res.data, filename)
  },
}

// ── Query keys / query options ───────────────────────────────────────────────────
// `financial`, `balance` e `installments` son categoría C (financiero/sensible):
// staleTime corto + refetchOnWindowFocus true. El resto es categoría B.

type FinancialFilters = { from?: string; to?: string }

export const documentKeys = {
  all: ['documents'] as const,
  types: () => [...documentKeys.all, 'types'] as const,
  detail: (id: string) => [...documentKeys.all, id] as const,
  balance: (id: string) => [...documentKeys.all, id, 'balance'] as const,
  allocations: (id: string) => [...documentKeys.all, id, 'allocations'] as const,
  installments: (id: string) => [...documentKeys.all, id, 'installments'] as const,
  auditLog: (id: string) => [...documentKeys.all, id, 'audit-log'] as const,
  attachments: (id: string) => [...documentKeys.all, id, 'attachments'] as const,
  financial: (filters?: FinancialFilters) =>
    filters ? ([...documentKeys.all, 'financial', filters.from, filters.to] as const) : ([...documentKeys.all, 'financial'] as const),
}

export const documentQueries = {
  list: () =>
    queryOptions({
      queryKey: documentKeys.all,
      queryFn: () => documentsApi.findAll(),
      staleTime: 60 * 1000,
    }),
  types: () =>
    queryOptions({
      queryKey: documentKeys.types(),
      queryFn: () => documentsApi.getTypes(),
      staleTime: 30 * 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: documentKeys.detail(id),
      queryFn: () => documentsApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  balance: (id: string) =>
    queryOptions({
      queryKey: documentKeys.balance(id),
      queryFn: () => documentsApi.getBalance(id),
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
      enabled: !!id,
    }),
  allocations: (id: string) =>
    queryOptions({
      queryKey: documentKeys.allocations(id),
      queryFn: () => documentsApi.findAllocations(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  installments: (id: string) =>
    queryOptions({
      queryKey: documentKeys.installments(id),
      queryFn: () => documentsApi.findInstallments(id),
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
      enabled: !!id,
    }),
  auditLog: (id: string) =>
    queryOptions({
      queryKey: documentKeys.auditLog(id),
      queryFn: () => documentsApi.getAuditLog(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
  attachments: (id: string) =>
    queryOptions({
      queryKey: documentKeys.attachments(id),
      queryFn: () => documentsApi.findAttachments(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  financial: (filters?: FinancialFilters) =>
    queryOptions({
      queryKey: documentKeys.financial(filters),
      queryFn: () => documentsApi.findAllForFinancial(filters),
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
    }),
}
