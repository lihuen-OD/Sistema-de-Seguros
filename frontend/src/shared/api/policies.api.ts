import { apiClient } from './client'
import type { Policy, PolicyStatus } from '../types'

interface BackendInsuranceType { id: string; name: string }
interface BackendCompany { id: string; name: string; cuit: string | null }
interface BackendProducer { id: string; name: string }
interface BackendPolicy {
  id: string; policyNumber: string; insuranceTypeId: string; companyId: string
  producerId: string | null; insuredName: string; startDate: string; endDate: string
  premium: number; currency: string; description: string | null; coverageIds: string[]
  isActive: boolean; status: string; createdAt: string; updatedAt: string
  insuranceType?: BackendInsuranceType
  company?: BackendCompany
  producer?: BackendProducer
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
    insuranceCompany: '',
    producerId: b.producerId ?? '',
    insuranceType: b.insuranceType?.name ?? '',
    coverageType: '',
    coverageTypes: [],
    startDate: b.startDate,
    endDate: b.endDate,
    assetId: null,
    companyId: b.companyId,
    costCenterId: null,
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
  policyNumber: string; insuranceTypeId: string; companyId: string; producerId?: string
  insuredName: string; startDate: string; endDate: string; premium: number
  currency?: string; description?: string; coverageIds?: string[]
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
}
