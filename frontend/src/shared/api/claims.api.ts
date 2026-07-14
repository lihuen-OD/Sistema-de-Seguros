import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { triggerBlobDownload } from '../utils/downloadFile'
import type { Claim, ClaimEvent, ClaimEventType, ClaimAttachment, ClaimExpense } from '../types'

interface BackendClaimEvent {
  id: string; claimId: string; type: string; date: string; description: string
  previousStatus: string | null; newStatus: string | null
  amountLabel: string | null; previousAmount: number | null; newAmount: number | null
  createdBy: string | null; createdAt: string
}
interface BackendClaimExpense {
  id: string; claimId: string; date: string; provider: string
  receiptNumber: string | null
  netAmount: number; vatAmount: number; otherTaxesAmount: number
  createdAt: string; createdBy: string | null
}
interface BackendClaim {
  id: string; claimNumber: string; assetId: string | null; policyId: string | null
  claimType: string; occurrenceDate: string; reportDate: string; description: string | null
  insuranceCompany: string | null
  ownershipType: string | null
  responsiblePersonName: string | null
  thirdPartyInsuranceCompany: string | null
  thirdPartyContact: string | null
  thirdPartyInsurerContact: string | null
  status: string; claimedAmountArs: number
  realAmountArs: number | null; settledAmountArs: number | null; deductibleArs: number | null
  currency: string; exchangeRate: number; observations: string | null
  events?: BackendClaimEvent[]; createdAt: string; updatedAt: string
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function mapEvent(e: BackendClaimEvent): ClaimEvent {
  return {
    id: e.id, claimId: e.claimId, date: e.date,
    type: e.type as ClaimEventType, description: e.description,
    previousStatus: e.previousStatus ?? undefined,
    newStatus: e.newStatus ?? undefined,
    amountLabel: e.amountLabel ?? undefined,
    previousAmount: e.previousAmount ?? undefined,
    newAmount: e.newAmount ?? undefined,
    author: e.createdBy ?? undefined,
  }
}

function mapClaim(b: BackendClaim): Claim {
  return {
    id: b.id, claimNumber: b.claimNumber,
    assetId: b.assetId ?? null, policyId: b.policyId ?? null,
    claimType: b.claimType,
    occurrenceDate: b.occurrenceDate?.slice(0, 10) ?? '',
    reportDate: b.reportDate?.slice(0, 10) ?? '',
    description: b.description ?? '',
    insuranceCompany: b.insuranceCompany ?? '',
    ownershipType: (b.ownershipType as Claim['ownershipType']) ?? 'propio',
    responsiblePersonName: b.responsiblePersonName ?? undefined,
    thirdPartyInsuranceCompany: b.thirdPartyInsuranceCompany ?? undefined,
    thirdPartyContact: b.thirdPartyContact ?? undefined,
    thirdPartyInsurerContact: b.thirdPartyInsurerContact ?? undefined,
    status: b.status,
    claimedAmountArs: b.claimedAmountArs,
    realAmountArs: b.realAmountArs ?? null,
    settledAmountArs: b.settledAmountArs ?? null,
    deductibleArs: b.deductibleArs ?? null,
    currency: b.currency as Claim['currency'],
    exchangeRate: b.exchangeRate,
    observations: b.observations ?? null,
    createdAt: b.createdAt, updatedAt: b.updatedAt,
  }
}

function mapExpense(e: BackendClaimExpense): ClaimExpense {
  return {
    id: e.id, claimId: e.claimId,
    date: e.date?.slice(0, 10) ?? '',
    provider: e.provider,
    receiptNumber: e.receiptNumber ?? undefined,
    netAmount: e.netAmount, vatAmount: e.vatAmount, otherTaxesAmount: e.otherTaxesAmount,
    createdAt: e.createdAt, createdBy: e.createdBy ?? undefined,
  }
}

export interface ClaimCreateInput {
  claimNumber: string; claimType: string; occurrenceDate: string; reportDate: string
  description: string; assetId?: string; policyId?: string; insuranceCompany?: string
  status?: string; claimedAmountArs?: number; currency?: string
  realAmountArs?: number; settledAmountArs?: number; deductibleArs?: number
  observations?: string; exchangeRate?: number
  ownershipType?: 'propio' | 'terceros'
  responsiblePersonName?: string
  thirdPartyInsuranceCompany?: string
  thirdPartyContact?: string
  thirdPartyInsurerContact?: string
}

export const claimsApi = {
  async findAll(filters?: { assetId?: string; policyId?: string; status?: string }): Promise<Claim[]> {
    const res = await apiClient.get<Paginated<BackendClaim>>('/claims', { params: { limit: 200, ...filters } })
    return res.data.data.map(mapClaim)
  },

  async findById(id: string): Promise<Claim> {
    const res = await apiClient.get<{ data: BackendClaim }>(`/claims/${id}`)
    return mapClaim(res.data.data)
  },

  async create(input: ClaimCreateInput): Promise<Claim> {
    const res = await apiClient.post<{ data: BackendClaim }>('/claims', input)
    return mapClaim(res.data.data)
  },

  async update(id: string, input: Partial<ClaimCreateInput>): Promise<Claim> {
    const res = await apiClient.put<{ data: BackendClaim }>(`/claims/${id}`, input)
    return mapClaim(res.data.data)
  },

  async findEvents(claimId: string): Promise<ClaimEvent[]> {
    const res = await apiClient.get<{ data: BackendClaimEvent[] }>(`/claims/${claimId}/events`)
    return res.data.data.map(mapEvent)
  },

  async addEvent(claimId: string, input: {
    type: string; description: string; date: string
    previousStatus?: string; newStatus?: string; amountLabel?: string
    previousAmount?: number; newAmount?: number; createdBy?: string
  }): Promise<ClaimEvent> {
    const res = await apiClient.post<{ data: BackendClaimEvent }>(`/claims/${claimId}/events`, input)
    return mapEvent(res.data.data)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/claims/${id}`)
  },

  async findAttachments(claimId: string): Promise<ClaimAttachment[]> {
    const res = await apiClient.get<{ data: ClaimAttachment[] }>(`/claims/${claimId}/attachments`)
    return res.data.data
  },

  async addAttachment(claimId: string, file: File, meta: { description?: string }): Promise<ClaimAttachment> {
    const form = new FormData()
    form.append('file', file)
    if (meta.description) form.append('description', meta.description)
    const res = await apiClient.post<{ data: ClaimAttachment }>(
      `/claims/${claimId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.data
  },

  async deleteAttachment(claimId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/claims/${claimId}/attachments/${attachmentId}`)
  },

  async downloadAttachment(claimId: string, attachmentId: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/claims/${claimId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
    triggerBlobDownload(res.data, filename)
  },

  async findExpenses(claimId: string): Promise<ClaimExpense[]> {
    const res = await apiClient.get<{ data: BackendClaimExpense[] }>(`/claims/${claimId}/expenses`)
    return res.data.data.map(mapExpense)
  },

  async addExpense(claimId: string, input: {
    date: string; provider: string; receiptNumber?: string
    netAmount: number; vatAmount: number; otherTaxesAmount: number
  }): Promise<ClaimExpense> {
    const res = await apiClient.post<{ data: BackendClaimExpense }>(`/claims/${claimId}/expenses`, input)
    return mapExpense(res.data.data)
  },

  async updateExpense(claimId: string, expenseId: string, input: {
    date: string; provider: string; receiptNumber?: string
    netAmount: number; vatAmount: number; otherTaxesAmount: number
  }): Promise<ClaimExpense> {
    const res = await apiClient.put<{ data: BackendClaimExpense }>(`/claims/${claimId}/expenses/${expenseId}`, input)
    return mapExpense(res.data.data)
  },

  async deleteExpense(claimId: string, expenseId: string): Promise<void> {
    await apiClient.delete(`/claims/${claimId}/expenses/${expenseId}`)
  },
}

// ── Query keys / query options (categoría B — semi-dinámico) ────────────────────

type ClaimFilters = { assetId?: string; policyId?: string; status?: string }

export const claimKeys = {
  all: ['claims'] as const,
  list: (filters?: ClaimFilters) => (filters ? ([...claimKeys.all, filters] as const) : claimKeys.all),
  detail: (id: string) => [...claimKeys.all, id] as const,
  events: (id: string) => [...claimKeys.all, id, 'events'] as const,
  attachments: (id: string) => [...claimKeys.all, id, 'attachments'] as const,
  expenses: (id: string) => [...claimKeys.all, id, 'expenses'] as const,
}

export const claimQueries = {
  list: (filters?: ClaimFilters) =>
    queryOptions({
      queryKey: claimKeys.list(filters),
      queryFn: () => claimsApi.findAll(filters),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: claimKeys.detail(id),
      queryFn: () => claimsApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  events: (id: string) =>
    queryOptions({
      queryKey: claimKeys.events(id),
      queryFn: () => claimsApi.findEvents(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
  attachments: (id: string) =>
    queryOptions({
      queryKey: claimKeys.attachments(id),
      queryFn: () => claimsApi.findAttachments(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  expenses: (id: string) =>
    queryOptions({
      queryKey: claimKeys.expenses(id),
      queryFn: () => claimsApi.findExpenses(id),
      staleTime: 60 * 1000,
      enabled: !!id,
    }),
}
