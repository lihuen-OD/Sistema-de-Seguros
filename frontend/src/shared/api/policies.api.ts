import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { triggerBlobDownload } from '../utils/downloadFile'
import type { Policy, PolicyStatus, PolicyCoverage, PolicyAsset, PolicyAttachment, ProducerTask, TaskPriority, Currency } from '../types'

interface BackendInsuranceType { id: string; name: string; coverages?: { id: string; name: string; description: string | null }[] }
interface BackendCompany { id: string; name: string }
interface BackendCostCenter { id: string; name: string; code: string | null }
interface BackendProducer { id: string; name: string }
interface BackendCoverage { id: string; name: string; description: string | null }
interface BackendPolicyAsset {
  id: string; code: string | null; name: string; assetType: string
  fixedAssetCode: string | null
  fixedAsset?: { id: string; code: string | null; name: string } | null
  allocations?: { percentage: number; costCenter: { id: string; code: string | null; name: string } | null }[]
}
interface BackendCirculationCard { id: string; fileUrl: string; name: string }
interface BackendPolicyCoverage {
  id: string; policyId: string; assetId: string | null
  insuranceTypeId: string; coverageIds: string[]
  insuredAmount: number; currency: string; exchangeRate: number
  insuredAmountArs: number | null; insuredAmountUsd: number | null
  companyId: string | null; costCenterId: string | null; beneficiaryDescription: string | null
  insuranceType: BackendInsuranceType
  selectedCoverages?: BackendCoverage[]
  company?: BackendCompany | null
  costCenter?: BackendCostCenter | null
  asset?: BackendPolicyAsset | null
  attachments?: BackendCirculationCard[]
  _count?: { attachments: number }
}
interface BackendAssetCoverageSummary {
  id: string; insuranceTypeId: string; insuranceTypeName: string
  insuredAmount: number; currency: string; exchangeRate: number
  insuredAmountArs: number | null; insuredAmountUsd: number | null
  circulationCardAttachment?: BackendCirculationCard | null
}
interface BackendPolicy {
  id: string; policyNumber: string; producerId: string | null
  insuredName: string; startDate: string; endDate: string
  description: string | null
  isActive: boolean; status: string; deactivatedAt: string | null
  createdAt: string; updatedAt: string
  producer?: BackendProducer | null
  coverages?: BackendPolicyCoverage[]
  // Agregados del listado
  coverageCount?: number; assetCount?: number; hasSinActivo?: boolean
  assetNames?: string[]
  insuranceTypeNames?: string[]
  totalInsuredAmountArs?: number; totalInsuredAmountUsd?: number
  circulationCardAttachment?: BackendCirculationCard | null
  assetCoverage?: BackendAssetCoverageSummary | null
  attachmentsCount?: number
}
interface BackendTask {
  id: string; producerId: string; title: string; description: string | null
  dueDate: string | null; status: string; createdAt: string; updatedAt: string
  completedAt: string | null; priority: string; assignedTo: string | null
  policyId: string | null; assetId: string | null
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

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
  if (s === 'vigente' || s === 'vencida' || s === 'de_baja') return s as PolicyStatus
  return 'vigente'
}

function mapPolicyAsset(a: BackendPolicyAsset): PolicyAsset {
  return {
    id: a.id,
    internalCode: a.code ?? '',
    name: a.name,
    assetType: a.assetType,
    fixedAssetCode: a.fixedAssetCode,
    fixedAssetName: a.fixedAsset?.name ?? null,
    costCenters: (a.allocations ?? [])
      .filter((alloc) => !!alloc.costCenter)
      .map((alloc) => ({ name: alloc.costCenter!.name, code: alloc.costCenter!.code, percentage: alloc.percentage })),
  }
}

function mapCoverage(c: BackendPolicyCoverage): PolicyCoverage {
  return {
    id: c.id,
    policyId: c.policyId,
    assetId: c.assetId,
    asset: c.asset ? mapPolicyAsset(c.asset) : c.asset === null ? null : undefined,
    insuranceTypeId: c.insuranceTypeId,
    insuranceType: c.insuranceType?.name ?? '',
    coverageIds: c.coverageIds,
    coverageNames: c.selectedCoverages?.map((cov) => cov.name) ?? [],
    insuredAmount: c.insuredAmount,
    currency: (c.currency === 'USD' ? 'USD' : 'ARS') as Currency,
    exchangeRate: c.exchangeRate,
    insuredAmountArs: c.insuredAmountArs ?? 0,
    insuredAmountUsd: c.insuredAmountUsd ?? 0,
    companyId: c.companyId,
    companyName: c.company?.name ?? null,
    costCenterId: c.costCenterId,
    costCenterName: c.costCenter?.name ?? null,
    costCenterCode: c.costCenter?.code ?? null,
    beneficiaryDescription: c.beneficiaryDescription,
    attachmentsCount: c._count?.attachments ?? 0,
    circulationCardAttachment: c.attachments?.[0] ?? null,
  }
}

function mapPolicy(b: BackendPolicy): Policy {
  return {
    id: b.id,
    policyNumber: b.policyNumber,
    insuranceCompany: b.insuredName,
    producerId: b.producerId ?? '',
    startDate: b.startDate?.slice(0, 10) ?? '',
    endDate: b.endDate?.slice(0, 10) ?? '',
    description: b.description ?? '',
    status: mapStatus(b.status),
    isActive: b.isActive,
    deactivatedAt: b.deactivatedAt,
    coverages: b.coverages ? b.coverages.map(mapCoverage) : undefined,
    coverageCount: b.coverageCount,
    assetCount: b.assetCount,
    hasSinActivo: b.hasSinActivo,
    assetNames: b.assetNames,
    insuranceTypeNames: b.insuranceTypeNames,
    totalInsuredAmountArs: b.totalInsuredAmountArs,
    totalInsuredAmountUsd: b.totalInsuredAmountUsd,
    circulationCardAttachment: b.circulationCardAttachment ?? null,
    assetCoverage: b.assetCoverage
      ? {
          id: b.assetCoverage.id,
          insuranceTypeId: b.assetCoverage.insuranceTypeId,
          insuranceTypeName: b.assetCoverage.insuranceTypeName,
          insuredAmount: b.assetCoverage.insuredAmount,
          currency: (b.assetCoverage.currency === 'USD' ? 'USD' : 'ARS') as Currency,
          exchangeRate: b.assetCoverage.exchangeRate,
          insuredAmountArs: b.assetCoverage.insuredAmountArs,
          insuredAmountUsd: b.assetCoverage.insuredAmountUsd,
          circulationCardAttachment: b.assetCoverage.circulationCardAttachment ?? null,
        }
      : b.assetCoverage === null ? null : undefined,
    attachmentsCount: b.attachmentsCount ?? 0,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface PolicyCoverageInput {
  id?: string
  assetId?: string | null
  insuranceTypeId: string
  coverageIds?: string[]
  insuredAmount?: number
  currency?: Currency
  exchangeRate?: number
  companyId?: string | null
  costCenterId?: string | null
  beneficiaryDescription?: string | null
}

export interface PolicyCreateInput {
  policyNumber: string
  producerId?: string | null
  insuredName: string
  startDate: string
  endDate: string
  description?: string
  coverages: PolicyCoverageInput[]
}

export type PolicyUpdateInput = Partial<Omit<PolicyCreateInput, 'policyNumber' | 'coverages'>>

export const policiesApi = {
  async findAll(filters?: { assetId?: string; companyId?: string; producerId?: string; insuranceTypeId?: string; limit?: number; includeCoverages?: boolean }): Promise<Policy[]> {
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

  async update(id: string, input: PolicyUpdateInput): Promise<Policy> {
    const res = await apiClient.put<{ data: BackendPolicy }>(`/policies/${id}`, input)
    return mapPolicy(res.data.data)
  },

  // Eliminación total y permanente — no es soft-delete. Borra las líneas de
  // cobertura y sus adjuntos, y desvincula (sin borrarlos) los documentos
  // contables, siniestros y tareas que referenciaban esta póliza.
  async hardDelete(id: string): Promise<void> {
    await apiClient.delete(`/policies/${id}`)
  },

  async markAsDeBaja(id: string): Promise<Policy> {
    const res = await apiClient.post<{ data: BackendPolicy }>(`/policies/${id}/de-baja`)
    return mapPolicy(res.data.data)
  },

  async findCoverages(policyId: string): Promise<PolicyCoverage[]> {
    const res = await apiClient.get<{ data: BackendPolicyCoverage[] }>(`/policies/${policyId}/coverages`)
    return res.data.data.map(mapCoverage)
  },

  async replaceCoverages(policyId: string, coverages: PolicyCoverageInput[]): Promise<PolicyCoverage[]> {
    const res = await apiClient.put<{ data: BackendPolicyCoverage[] }>(`/policies/${policyId}/coverages`, { coverages })
    return res.data.data.map(mapCoverage)
  },

  async findAttachments(policyId: string, coverageId: string): Promise<PolicyAttachment[]> {
    const res = await apiClient.get<{ data: PolicyAttachment[] }>(`/policies/${policyId}/coverages/${coverageId}/attachments`)
    return res.data.data
  },

  async addAttachment(
    policyId: string,
    coverageId: string,
    file: File,
    meta: { description?: string; isCirculationCard?: boolean },
  ): Promise<PolicyAttachment> {
    const form = new FormData()
    form.append('file', file)
    if (meta.description) form.append('description', meta.description)
    if (meta.isCirculationCard) form.append('isCirculationCard', 'true')
    const res = await apiClient.post<{ data: PolicyAttachment }>(
      `/policies/${policyId}/coverages/${coverageId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.data
  },

  async deleteAttachment(policyId: string, coverageId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/policies/${policyId}/coverages/${coverageId}/attachments/${attachmentId}`)
  },

  async downloadAttachment(policyId: string, coverageId: string, attachmentId: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/policies/${policyId}/coverages/${coverageId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
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

type PolicyFilters = { assetId?: string; companyId?: string; producerId?: string; insuranceTypeId?: string; limit?: number; includeCoverages?: boolean }

export const policyKeys = {
  all: ['policies'] as const,
  list: (filters?: PolicyFilters) => (filters ? ([...policyKeys.all, filters] as const) : policyKeys.all),
  detail: (id: string) => ['policy', id] as const,
  coverages: (id: string) => [...policyKeys.all, id, 'coverages'] as const,
  attachments: (id: string, coverageId: string) => [...policyKeys.all, id, 'coverages', coverageId, 'attachments'] as const,
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
  coverages: (id: string) =>
    queryOptions({
      queryKey: policyKeys.coverages(id),
      queryFn: () => policiesApi.findCoverages(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  attachments: (id: string, coverageId: string) =>
    queryOptions({
      queryKey: policyKeys.attachments(id, coverageId),
      queryFn: () => policiesApi.findAttachments(id, coverageId),
      staleTime: 2 * 60 * 1000,
      enabled: !!id && !!coverageId,
    }),
  tasks: (id: string) =>
    queryOptions({
      queryKey: policyKeys.tasks(id),
      queryFn: () => policiesApi.findTasks(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
}
