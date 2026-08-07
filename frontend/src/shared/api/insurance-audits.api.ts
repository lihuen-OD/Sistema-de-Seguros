import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export type InsuranceAuditStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'

export interface InsuranceAuditChecklistInput {
  policyActiveConfirmed: boolean
  insuranceCardPresent: boolean
  dataMatchesInsuredAsset: boolean
  physicalConditionOk: boolean
  odometerOrHoursObserved?: string
  comments?: string
}

export interface InsuranceAuditCreateInput {
  assetId: string
  checklist: InsuranceAuditChecklistInput
}

export interface InsuranceAuditUpdateInput {
  checklist: InsuranceAuditChecklistInput
}

export interface InsuranceAuditAttachment {
  id: string
  auditId: string
  name: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  uploadedAt: string
  uploadedBy: string
}

export interface InsuranceAudit {
  id: string
  assetId: string
  status: InsuranceAuditStatus
  auditDate: string
  auditPeriod: string
  auditedBy: string
  checklist: InsuranceAuditChecklistInput
  attachments: InsuranceAuditAttachment[]
  asset: { id: string; code: string | null; name: string; assetType: string } | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
  updatedAt: string
}

export interface InsuranceAuditListItem {
  id: string
  status: InsuranceAuditStatus
  auditDate: string
  auditPeriod: string
  auditedBy: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  asset: { id: string; code: string | null; name: string; assetType: string } | null
}

export interface InsuranceAuditReviewInput {
  auditDecision: 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'
  reviewNotes?: string
}

export interface BulkApproveInsuranceAuditsResult {
  approved: string[]
  failed: { id: string; code: string | null; message: string }[]
}

export interface InsuranceAuditCoverageItem {
  id: string
  code: string | null
  name: string
  assetType: string
  category: string
  audited: boolean
  auditId: string | null
  auditStatus: InsuranceAuditStatus | null
  auditDate: string | null
}

export interface InsuranceAuditDashboardCategory {
  category: string
  total: number
  audited: number
  pending: number
  percentAudited: number | null
  checklistCompliance: {
    policyActiveConfirmed: number
    insuranceCardPresent: number
    dataMatchesInsuredAsset: number
    physicalConditionOk: number
  }
}

export interface InsuranceAuditDashboard {
  period: string
  totalRegistered: number
  totalAudited: number
  totalPending: number
  percentAudited: number | null
  categories: InsuranceAuditDashboardCategory[]
}

export interface InsuranceAuditorProgress {
  userId: string
  name: string
  email: string
  assignedCategories: string[]
  assigned: number
  completed: number
  pending: number
  completionRate: number | null
}

export interface InsuranceAuditorProgressReport {
  period: string
  auditors: InsuranceAuditorProgress[]
}

export interface InsuranceAuditListFilters {
  assetId?: string
}

export const insuranceAuditKeys = {
  all: ['insurance-audits'] as const,
  list: (filters?: InsuranceAuditListFilters) => (filters ? ([...insuranceAuditKeys.all, filters] as const) : insuranceAuditKeys.all),
  detail: (id: string) => [...insuranceAuditKeys.all, id] as const,
}

export const insuranceAuditsApi = {
  async create(input: InsuranceAuditCreateInput): Promise<InsuranceAudit> {
    const res = await apiClient.post<{ data: InsuranceAudit }>('/insurance-audits', input)
    return res.data.data
  },

  async findById(id: string): Promise<InsuranceAudit> {
    const res = await apiClient.get<{ data: InsuranceAudit }>(`/insurance-audits/${id}`)
    return res.data.data
  },

  async update(id: string, input: InsuranceAuditUpdateInput): Promise<InsuranceAudit> {
    const res = await apiClient.put<{ data: InsuranceAudit }>(`/insurance-audits/${id}`, input)
    return res.data.data
  },

  async addAttachment(auditId: string, file: File): Promise<InsuranceAuditAttachment> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiClient.post<{ data: InsuranceAuditAttachment }>(`/insurance-audits/${auditId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.data
  },

  async deleteAttachment(auditId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/insurance-audits/${auditId}/attachments/${attachmentId}`)
  },

  async findAll(filters?: InsuranceAuditListFilters): Promise<InsuranceAuditListItem[]> {
    const res = await apiClient.get<{ data: InsuranceAuditListItem[] }>('/insurance-audits', { params: { limit: 200, ...filters } })
    return res.data.data
  },

  async review(id: string, input: InsuranceAuditReviewInput): Promise<InsuranceAudit> {
    const res = await apiClient.post<{ data: InsuranceAudit }>(`/insurance-audits/${id}/review`, input)
    return res.data.data
  },

  async bulkApprove(ids: string[], reviewNotes?: string): Promise<BulkApproveInsuranceAuditsResult> {
    const res = await apiClient.post<{ data: BulkApproveInsuranceAuditsResult }>('/insurance-audits/bulk-approve', { ids, reviewNotes })
    return res.data.data
  },

  async getCoverage(period: string): Promise<InsuranceAuditCoverageItem[]> {
    const res = await apiClient.get<{ data: InsuranceAuditCoverageItem[] }>('/insurance-audits/coverage', { params: { period } })
    return res.data.data
  },

  async getAuditDashboard(period: string): Promise<InsuranceAuditDashboard> {
    const res = await apiClient.get<{ data: InsuranceAuditDashboard }>('/insurance-audits/audit-dashboard', { params: { period } })
    return res.data.data
  },

  async getAuditorProgress(period: string): Promise<InsuranceAuditorProgressReport> {
    const res = await apiClient.get<{ data: InsuranceAuditorProgressReport }>('/insurance-audits/auditor-progress', { params: { period } })
    return res.data.data
  },
}

export const insuranceAuditQueries = {
  list: (filters?: InsuranceAuditListFilters) =>
    queryOptions({
      queryKey: insuranceAuditKeys.list(filters),
      queryFn: () => insuranceAuditsApi.findAll(filters),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: insuranceAuditKeys.detail(id),
      queryFn: () => insuranceAuditsApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  coverage: (period: string) =>
    queryOptions({
      queryKey: [...insuranceAuditKeys.all, 'coverage', period] as const,
      queryFn: () => insuranceAuditsApi.getCoverage(period),
      staleTime: 60 * 1000,
    }),
  auditDashboard: (period: string) =>
    queryOptions({
      queryKey: [...insuranceAuditKeys.all, 'audit-dashboard', period] as const,
      queryFn: () => insuranceAuditsApi.getAuditDashboard(period),
      staleTime: 60 * 1000,
    }),
  auditorProgress: (period: string) =>
    queryOptions({
      queryKey: [...insuranceAuditKeys.all, 'auditor-progress', period] as const,
      queryFn: () => insuranceAuditsApi.getAuditorProgress(period),
      staleTime: 60 * 1000,
    }),
}
