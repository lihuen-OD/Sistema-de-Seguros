import { apiClient } from './client'
import type { Policy, PolicyStatus, PolicyAttachment } from '../types'

interface BackendInsuranceType { id: string; name: string }
interface BackendCompany { id: string; name: string; cuit: string | null }
interface BackendProducer { id: string; name: string }
interface BackendCoverage { id: string; name: string; description: string | null }
interface BackendPolicy {
  id: string; policyNumber: string; insuranceTypeId: string; companyId: string
  costCenterId: string | null; producerId: string | null
  insuredName: string; assetId: string | null; beneficiaryDescription: string | null
  startDate: string; endDate: string
  premium: number; currency: string; description: string | null; coverageIds: string[]
  isActive: boolean; status: string; createdAt: string; updatedAt: string
  insuranceType?: BackendInsuranceType
  company?: BackendCompany
  producer?: BackendProducer
  selectedCoverages?: BackendCoverage[]
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function mapStatus(s: string): PolicyStatus {
  if (s === 'proxima_a_vencer') return 'proximo_vencer'
  if (s === 'vigente' || s === 'vencida') return s as PolicyStatus
  return 'vigente'
}

function mapPolicy(b: BackendPolicy): Policy {
  return {
    id: b.id,
    policyNumber: b.policyNumber,
    insuranceCompany: b.insuredName,
    producerId: b.producerId ?? '',
    insuranceType: b.insuranceType?.name ?? '',
    coverageType: b.selectedCoverages?.[0]?.name ?? b.coverageIds[0] ?? '',
    coverageTypes: b.coverageIds,
    coverageNames: b.selectedCoverages?.map((c) => c.name) ?? [],
    beneficiaryDescription: b.beneficiaryDescription ?? '',
    startDate: b.startDate?.slice(0, 10) ?? '',
    endDate: b.endDate?.slice(0, 10) ?? '',
    assetId: b.assetId ?? null,
    companyId: b.companyId,
    costCenterId: b.costCenterId ?? null,
    insuredAmountArs: b.premium,
    exchangeRate: 1,
    insuredAmountUsd: b.currency === 'USD' ? b.premium : 0,
    description: b.description ?? '',
    status: mapStatus(b.status),
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface PolicyCreateInput {
  policyNumber: string; insuranceTypeId: string; companyId: string; costCenterId?: string | null
  producerId?: string; insuredName: string; startDate: string; endDate: string; premium: number
  currency?: string; description?: string; coverageIds?: string[]
  assetId?: string | null; beneficiaryDescription?: string | null
}

export const policiesApi = {
  async findAll(): Promise<Policy[]> {
    const res = await apiClient.get<Paginated<BackendPolicy>>('/policies', { params: { limit: 200 } })
    return res.data.data.map(mapPolicy)
  },

  async findById(id: string): Promise<Policy> {
    const res = await apiClient.get<{ data: BackendPolicy }>(`/policies/${id}`)
    return mapPolicy(res.data.data)
  },

  async create(input: PolicyCreateInput): Promise<Policy> {
    const res = await apiClient.post<{ data: BackendPolicy }>('/policies', input)
    return mapPolicy(res.data.data)
  },

  async update(id: string, input: Partial<Omit<PolicyCreateInput, 'policyNumber'>>): Promise<Policy> {
    const res = await apiClient.put<{ data: BackendPolicy }>(`/policies/${id}`, input)
    return mapPolicy(res.data.data)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/policies/${id}`)
  },

  async findAttachments(policyId: string): Promise<PolicyAttachment[]> {
    const res = await apiClient.get<{ data: PolicyAttachment[] }>(`/policies/${policyId}/attachments`)
    return res.data.data
  },

  async addAttachment(
    policyId: string,
    file: File,
    meta: { description?: string; expirationDate?: string; notifyEmail?: string },
  ): Promise<PolicyAttachment> {
    const form = new FormData()
    form.append('file', file)
    if (meta.description) form.append('description', meta.description)
    if (meta.expirationDate) form.append('expirationDate', meta.expirationDate)
    if (meta.notifyEmail) form.append('notifyEmail', meta.notifyEmail)
    const res = await apiClient.post<{ data: PolicyAttachment }>(
      `/policies/${policyId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.data
  },

  async deleteAttachment(policyId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/policies/${policyId}/attachments/${attachmentId}`)
  },
}
