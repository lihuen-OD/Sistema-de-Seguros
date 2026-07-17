import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { triggerBlobDownload } from '../utils/downloadFile'
import type { Policy, PolicyStatus, PolicyAsset, PolicyAttachment, ProducerTask, TaskPriority } from '../types'

interface BackendInsuranceType { id: string; name: string }
interface BackendCompany { id: string; name: string; cuit: string | null }
interface BackendProducer { id: string; name: string }
interface BackendCoverage { id: string; name: string; description: string | null }
interface BackendPolicyAsset {
  id: string; code: string | null; name: string; assetType: string
  fixedAssetCode: string | null; fixedAssetName: string | null
  costCenterName: string | null; costCenterCode: string | null
}
interface BackendPolicy {
  id: string; policyNumber: string; insuranceTypeId: string; companyId: string
  costCenterId: string | null; producerId: string | null
  insuredName: string; assetIds: string[]; beneficiaryDescription: string | null
  startDate: string; endDate: string
  premium: number; currency: string; exchangeRate: number; description: string | null; coverageIds: string[]
  isActive: boolean; status: string; createdAt: string; updatedAt: string
  insuranceType?: BackendInsuranceType
  company?: BackendCompany
  producer?: BackendProducer
  selectedCoverages?: BackendCoverage[]
  selectedAssets?: BackendPolicyAsset[]
  _count?: { attachments: number; allocations: number }
}
interface BackendTask {
  id: string; producerId: string; title: string; description: string | null
  dueDate: string | null; status: string; createdAt: string; updatedAt: string
  completedAt: string | null; priority: string; assignedTo: string | null
  policyId: string | null; assetId: string | null
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }
interface BackendPolicyAttachment extends Omit<PolicyAttachment, 'expirationDate'> { expirationDate: string | null }

const today = () => new Date().toISOString().slice(0, 10)

function mapTaskStatus(s: string, dueDate?: string | null): ProducerTask['status'] {
  if (s === 'completada' || s === 'cancelada') return 'finalizada'
  if (s === 'en_progreso') return 'en_curso'
  if (s === 'pendiente' && dueDate && dueDate < today()) return 'vencida'
  return 'pendiente'
}

function mapTask(t: BackendTask): ProducerTask {
  return {
    id: t.id, title: t.title, description: t.description ?? '',
    producerId: t.producerId,
    policyId: t.policyId ?? null,
    assetId: t.assetId ?? null,
    assignedTo: t.assignedTo ?? null,
    dueDate: t.dueDate ? t.dueDate.slice(0, 10) : '',
    priority: (t.priority ?? 'media') as TaskPriority,
    status: mapTaskStatus(t.status, t.dueDate),
    createdAt: t.createdAt, completedAt: t.completedAt ?? null,
  }
}

function mapStatus(s: string): PolicyStatus {
  if (s === 'proxima_a_vencer') return 'proximo_vencer'
  if (s === 'vigente' || s === 'vencida') return s as PolicyStatus
  return 'vigente'
}

function mapPolicyAttachment(a: BackendPolicyAttachment): PolicyAttachment {
  return { ...a, expirationDate: a.expirationDate ? a.expirationDate.slice(0, 10) : null }
}

function mapPolicyAsset(a: BackendPolicyAsset): PolicyAsset {
  return {
    id: a.id,
    internalCode: a.code ?? '',
    name: a.name,
    assetType: a.assetType,
    fixedAssetCode: a.fixedAssetCode,
    fixedAssetName: a.fixedAssetName,
    costCenterName: a.costCenterName,
    costCenterCode: a.costCenterCode,
  }
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
    assetIds: b.assetIds ?? [],
    selectedAssets: b.selectedAssets ? b.selectedAssets.map(mapPolicyAsset) : undefined,
    companyId: b.companyId,
    costCenterId: b.costCenterId ?? null,
    currency: (b.currency === 'USD' ? 'USD' : 'ARS') as 'ARS' | 'USD',
    exchangeRate: b.exchangeRate ?? 1,
    insuredAmountArs: b.currency === 'USD' ? 0 : b.premium,
    insuredAmountUsd: b.currency === 'USD' ? b.premium : (b.exchangeRate ?? 1) > 1 ? b.premium / b.exchangeRate : 0,
    description: b.description ?? '',
    status: mapStatus(b.status),
    attachmentsCount: b._count?.attachments ?? 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface PolicyCreateInput {
  policyNumber: string; insuranceTypeId: string; companyId: string; costCenterId?: string | null
  producerId?: string; insuredName: string; startDate: string; endDate: string; premium: number
  currency?: string; exchangeRate?: number; description?: string; coverageIds?: string[]
  assetIds?: string[]; beneficiaryDescription?: string | null
}

export const policiesApi = {
  async findAll(filters?: { assetId?: string; companyId?: string; producerId?: string }): Promise<Policy[]> {
    const res = await apiClient.get<Paginated<BackendPolicy>>('/policies', { params: { limit: 200, ...filters } })
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
    const res = await apiClient.get<{ data: BackendPolicyAttachment[] }>(`/policies/${policyId}/attachments`)
    return res.data.data.map(mapPolicyAttachment)
  },

  async addAttachment(
    policyId: string,
    file: File,
    meta: { description?: string; expirationDate?: string },
  ): Promise<PolicyAttachment> {
    const form = new FormData()
    form.append('file', file)
    if (meta.description) form.append('description', meta.description)
    if (meta.expirationDate) form.append('expirationDate', meta.expirationDate)
    const res = await apiClient.post<{ data: BackendPolicyAttachment }>(
      `/policies/${policyId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return mapPolicyAttachment(res.data.data)
  },

  async deleteAttachment(policyId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/policies/${policyId}/attachments/${attachmentId}`)
  },

  async downloadAttachment(policyId: string, attachmentId: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/policies/${policyId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
    triggerBlobDownload(res.data, filename)
  },

  async findTasks(policyId: string): Promise<ProducerTask[]> {
    const res = await apiClient.get<{ data: BackendTask[] }>(`/policies/${policyId}/tasks`)
    return res.data.data.map(mapTask)
  },
}

// ── Query keys / query options (categoría B — semi-dinámico) ────────────────────
// El detalle usa la key singular `['policy', id]` (no `['policies', id]`) porque
// es la convención que ya domina en el código (PolicyDetailPage/Edit/Ficha) — se
// mantiene así a propósito para no fragmentar cache con lo ya existente.

type PolicyFilters = { assetId?: string; companyId?: string; producerId?: string }

export const policyKeys = {
  all: ['policies'] as const,
  list: (filters?: PolicyFilters) => (filters ? ([...policyKeys.all, filters] as const) : policyKeys.all),
  detail: (id: string) => ['policy', id] as const,
  attachments: (id: string) => [...policyKeys.all, id, 'attachments'] as const,
  tasks: (id: string) => [...policyKeys.all, id, 'tasks'] as const,
}

export const policyQueries = {
  list: (filters?: PolicyFilters) =>
    queryOptions({
      queryKey: policyKeys.list(filters),
      queryFn: () => policiesApi.findAll(filters),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: policyKeys.detail(id),
      queryFn: () => policiesApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  attachments: (id: string) =>
    queryOptions({
      queryKey: policyKeys.attachments(id),
      queryFn: () => policiesApi.findAttachments(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  tasks: (id: string) =>
    queryOptions({
      queryKey: policyKeys.tasks(id),
      queryFn: () => policiesApi.findTasks(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
}
