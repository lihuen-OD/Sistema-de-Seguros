import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type {
  FireExtinguisherAuditCreateInput as AssetAuditCreateInput,
  FireExtinguisherAuditUpdateInput as AssetAuditUpdateInput,
  FireExtinguisherAudit as AssetAudit,
  FireExtinguisherAuditAttachment as AssetAuditAttachment,
  FireExtinguisherAuditListItem as AssetAuditListItem,
  FireExtinguisherAuditReviewInput as AssetAuditReviewInput,
  BulkApproveFireExtinguisherAuditsResult as BulkApproveAssetAuditsResult,
  FireExtinguisherCoverageItem as AssetAuditCoverageItem,
  AuditControlPointLevel,
  AuditFlaggedExtinguisher,
} from './fire-extinguisher-audits.api'

// "Auditoría de Activos" reutiliza el motor de FireExtinguisherAudit
// (auditar los matafuegos montados en vehículos/maquinaria, no el vehículo
// en sí — ver fire-extinguisher-audits.population.ts en el backend). Mismos
// contratos de request/response que Matafuegos, solo cambia la base de ruta
// (/asset-audits) y el agrupamiento del dashboard (por categoría, no por
// establecimiento) — por eso este archivo reexporta los tipos compartidos en
// vez de duplicarlos.
export type {
  AssetAuditCreateInput,
  AssetAuditUpdateInput,
  AssetAudit,
  AssetAuditAttachment,
  AssetAuditListItem,
  AssetAuditReviewInput,
  BulkApproveAssetAuditsResult,
  AssetAuditCoverageItem,
}

export type AssetAuditStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'

// ── Dashboard de nivel % agrupado por categoría de activo ──────────────────────

export interface AssetAuditDashboardGroup {
  category: string
  total: number
  audited: number
  level: number | null
  levelLabel: string | null
  controlPoints: AuditControlPointLevel[]
  expiredExtinguishers: AuditFlaggedExtinguisher[]
  needsCleaningExtinguishers: AuditFlaggedExtinguisher[]
}

export interface AssetAuditDashboard {
  period: string
  category: string | null
  categories: string[] | null
  totalRegistered: number
  totalAudited: number
  overallLevel: number | null
  overallLevelLabel: string | null
  controlPoints: AuditControlPointLevel[]
  groups: AssetAuditDashboardGroup[]
}

export interface AssetAuditorProgress {
  userId: string
  name: string
  email: string
  assignedCategories: string[]
  assigned: number
  completed: number
  pending: number
  completionRate: number | null
}

export interface AssetAuditorProgressReport {
  period: string
  auditors: AssetAuditorProgress[]
}

export interface AssetAuditListFilters {
  fireExtinguisherId?: string
}

export const assetAuditKeys = {
  all: ['asset-audits'] as const,
  list: (filters?: AssetAuditListFilters) => (filters ? ([...assetAuditKeys.all, filters] as const) : assetAuditKeys.all),
  detail: (id: string) => [...assetAuditKeys.all, id] as const,
}

export const assetAuditsApi = {
  async create(input: AssetAuditCreateInput): Promise<AssetAudit> {
    const res = await apiClient.post<{ data: AssetAudit }>('/asset-audits', input)
    return res.data.data
  },

  async findById(id: string): Promise<AssetAudit> {
    const res = await apiClient.get<{ data: AssetAudit }>(`/asset-audits/${id}`)
    return res.data.data
  },

  async update(id: string, input: AssetAuditUpdateInput): Promise<AssetAudit> {
    const res = await apiClient.put<{ data: AssetAudit }>(`/asset-audits/${id}`, input)
    return res.data.data
  },

  async addAttachment(auditId: string, file: File): Promise<AssetAuditAttachment> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiClient.post<{ data: AssetAuditAttachment }>(`/asset-audits/${auditId}/attachments`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return res.data.data
  },

  async deleteAttachment(auditId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/asset-audits/${auditId}/attachments/${attachmentId}`)
  },

  async findAll(filters?: AssetAuditListFilters): Promise<AssetAuditListItem[]> {
    const res = await apiClient.get<{ data: AssetAuditListItem[] }>('/asset-audits', { params: { limit: 200, ...filters } })
    return res.data.data
  },

  async review(id: string, input: AssetAuditReviewInput): Promise<AssetAudit> {
    const res = await apiClient.post<{ data: AssetAudit }>(`/asset-audits/${id}/review`, input)
    return res.data.data
  },

  async bulkApprove(ids: string[], reviewNotes?: string): Promise<BulkApproveAssetAuditsResult> {
    const res = await apiClient.post<{ data: BulkApproveAssetAuditsResult }>('/asset-audits/bulk-approve', { ids, reviewNotes })
    return res.data.data
  },

  async getCoverage(period: string): Promise<AssetAuditCoverageItem[]> {
    const res = await apiClient.get<{ data: AssetAuditCoverageItem[] }>('/asset-audits/coverage', { params: { period } })
    return res.data.data
  },

  async getAuditDashboard(period: string, category?: string): Promise<AssetAuditDashboard> {
    const res = await apiClient.get<{ data: AssetAuditDashboard }>('/asset-audits/audit-dashboard', { params: { period, category } })
    return res.data.data
  },

  async getAuditorProgress(period: string): Promise<AssetAuditorProgressReport> {
    const res = await apiClient.get<{ data: AssetAuditorProgressReport }>('/asset-audits/auditor-progress', { params: { period } })
    return res.data.data
  },
}

export const assetAuditQueries = {
  list: (filters?: AssetAuditListFilters) =>
    queryOptions({
      queryKey: assetAuditKeys.list(filters),
      queryFn: () => assetAuditsApi.findAll(filters),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: assetAuditKeys.detail(id),
      queryFn: () => assetAuditsApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  coverage: (period: string) =>
    queryOptions({
      queryKey: [...assetAuditKeys.all, 'coverage', period] as const,
      queryFn: () => assetAuditsApi.getCoverage(period),
      staleTime: 60 * 1000,
    }),
  auditDashboard: (period: string, category?: string) =>
    queryOptions({
      queryKey: [...assetAuditKeys.all, 'audit-dashboard', period, category ?? null] as const,
      queryFn: () => assetAuditsApi.getAuditDashboard(period, category),
      staleTime: 60 * 1000,
    }),
  auditorProgress: (period: string) =>
    queryOptions({
      queryKey: [...assetAuditKeys.all, 'auditor-progress', period] as const,
      queryFn: () => assetAuditsApi.getAuditorProgress(period),
      staleTime: 60 * 1000,
    }),
}
