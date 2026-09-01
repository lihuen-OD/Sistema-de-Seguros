import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type {
  FireExtinguisherAuditCreateInput as AssetAuditCreateInput,
  FireExtinguisherAuditUpdateInput as AssetAuditUpdateInput,
  FireExtinguisherAudit as AssetAudit,
  FireExtinguisherAuditAttachment as AssetAuditAttachment,
  FireExtinguisherAuditListItem as AssetAuditListItem,
  FireExtinguisherAuditListChecklist as AssetAuditListChecklist,
  FireExtinguisherAuditListFilters as AssetAuditListFilters,
  FireExtinguisherAuditReviewInput as AssetAuditReviewInput,
  BulkApproveFireExtinguisherAuditsResult as BulkApproveAssetAuditsResult,
  FireExtinguisherCoverageItem as AssetAuditCoverageItem,
  FireExtinguisherAuditCommentItem as AssetAuditCommentItem,
  AuditControlPointLevel,
  AuditFlaggedExtinguisher,
} from './fire-extinguisher-audits.api'
import { fireExtinguisherLabel } from '../utils/format'

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
  AssetAuditListChecklist,
  AssetAuditListFilters,
  AssetAuditReviewInput,
  BulkApproveAssetAuditsResult,
  AssetAuditCoverageItem,
  AssetAuditCommentItem,
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
  assignedAssetIds: string[]
  assigned: number
  completed: number
  pending: number
  completionRate: number | null
}

export interface AssetAuditorProgressReport {
  period: string
  auditors: AssetAuditorProgress[]
}

// Asignación por activo individual — reemplaza la asignación por categoría.
export interface AssetAuditAssignableAsset {
  id: string
  code: string | null
  name: string
  assetType: string
  category: string
  plate: string | null
  chassisNumber: string | null
  engineNumber: string | null
}

export interface AssetAuditAssignmentAuditor {
  userId: string
  name: string
  email: string
  assetIds: string[]
}

export interface AssetAuditAssignments {
  auditors: AssetAuditAssignmentAuditor[]
  assets: AssetAuditAssignableAsset[]
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
    // limit 500 = mismo criterio que fire-extinguisher-audits.api.ts (tope
    // del schema de paginación del backend, sin paginador visual todavía).
    const res = await apiClient.get<{ data: AssetAuditListItem[] }>('/asset-audits', { params: { limit: 500, ...filters } })
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

  async getAssignments(): Promise<AssetAuditAssignments> {
    const res = await apiClient.get<{ data: AssetAuditAssignments }>('/asset-audits/assignments')
    return res.data.data
  },

  async saveAssignment(userId: string, assetIds: string[]): Promise<void> {
    await apiClient.put(`/asset-audits/assignments/${userId}`, { assetIds })
  },

  async getComments(period: string): Promise<AssetAuditCommentItem[]> {
    type RawComment = Omit<AssetAuditCommentItem, 'target'> & {
      target: { id: string; code: string; cylinderNumber: string | null; location: string | null; establishment: string | null; assetName: string | null }
    }
    const res = await apiClient.get<{ data: RawComment[] }>('/asset-audits/comments', { params: { period } })
    return res.data.data.map((c) => ({
      ...c,
      target: {
        id: c.target.id,
        label: fireExtinguisherLabel(c.target.cylinderNumber, c.target.location, c.target.code),
        sublabel: c.target.assetName ?? c.target.establishment ?? null,
      },
    }))
  },

  async addComment(targetId: string, body: string): Promise<void> {
    await apiClient.post('/asset-audits/comments', { targetId, body })
  },

  async markCommentSeen(id: string): Promise<void> {
    await apiClient.post(`/asset-audits/comments/${id}/mark-seen`)
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
  assignments: () =>
    queryOptions({
      queryKey: [...assetAuditKeys.all, 'assignments'] as const,
      queryFn: () => assetAuditsApi.getAssignments(),
      staleTime: 30 * 1000,
    }),
  comments: (period: string) =>
    queryOptions({
      queryKey: [...assetAuditKeys.all, 'comments', period] as const,
      queryFn: () => assetAuditsApi.getComments(period),
      staleTime: 60 * 1000,
    }),
}
