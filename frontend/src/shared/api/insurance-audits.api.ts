import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export type InsuranceAuditStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'

export interface InsuranceAuditChecklistInput {
  hasCirculationCard: boolean
  comments?: string
}

// Patente/chasis/motor viven en Asset.metadata, no son columnas propias —
// mismas claves que arma el backend en insurance-audits.service.ts.
export interface InsuranceAuditVehicleMeta {
  plate: string | null
  chassisNumber: string | null
  engineNumber: string | null
}

export interface CirculationCardReference {
  id: string
  fileUrl: string
  name: string
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
  asset: ({ id: string; code: string | null; name: string; assetType: string } & InsuranceAuditVehicleMeta) | null
  referenceCirculationCard: CirculationCardReference | null
  cardUpdateRequested: boolean
  cardUpdateRequestedAt: string | null
  cardUpdateRequestedBy: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
  updatedAt: string
}

// Mismo shape que InsuranceAuditChecklistInput, pero `comments` siempre
// presente (string | null, tal como llega de la base) en vez de opcional —
// esto es lo que ya devuelve el listado, no lo que se manda a crear/editar.
export interface InsuranceAuditListChecklist {
  hasCirculationCard: boolean
  comments: string | null
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
  cardUpdateRequested: boolean
  checklist: InsuranceAuditListChecklist
  asset: ({ id: string; code: string | null; name: string; assetType: string } & InsuranceAuditVehicleMeta) | null
}

export interface InsuranceAuditReviewInput {
  auditDecision: 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'
  reviewNotes?: string
}

export interface BulkApproveInsuranceAuditsResult {
  approved: string[]
  failed: { id: string; code: string | null; message: string }[]
}

export interface InsuranceAuditCoverageItem extends InsuranceAuditVehicleMeta {
  id: string
  code: string | null
  name: string
  assetType: string
  category: string
  audited: boolean
  auditId: string | null
  auditStatus: InsuranceAuditStatus | null
  auditDate: string | null
  hasCirculationCard: boolean | null
  cardUpdateRequested: boolean
  referenceCirculationCard: CirculationCardReference | null
}

export interface InsuranceAuditDashboardCategory {
  category: string
  total: number
  audited: number
  pending: number
  percentAudited: number | null
  withCirculationCard: number
  withoutCirculationCard: number
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
  assignedAssetIds: string[]
  assigned: number
  completed: number
  pending: number
  completionRate: number | null
}

export interface InsuranceAuditorProgressReport {
  period: string
  auditors: InsuranceAuditorProgress[]
}

// Filtros avanzados de la tabla — se mandan como query params reales (ver
// ListInsuranceAuditsQuerySchema en el backend, mismos nombres de campo).
// `status`, la búsqueda de texto y el rango de período siguen filtrándose
// en el cliente, sin cambios — mismo criterio que fire-extinguisher-audits.
export interface InsuranceAuditListFilters {
  assetId?: string
  auditedBy?: string[]
  hasCirculationCard?: boolean
  hasComments?: boolean
  // Categoría del Asset asegurado (una de AUDITABLE_ASSET_CATEGORIES) —
  // a diferencia de Rodados, acá "moto" es una opción válida.
  category?: string[]
}

// Feed de comentarios compartido — ver AuditCommentsPanel.tsx. `target` es el
// activo al que pertenece el comentario, con el mismo shape que espera el
// panel genérico (label/sublabel ya armados por este archivo, no por el
// backend).
export type InsuranceAuditCommentSource = 'AUDITOR_NOTE' | 'REVIEW_DECISION' | 'MANUAL'

export interface InsuranceAuditCommentItem {
  id: string
  source: InsuranceAuditCommentSource
  auditStatus: InsuranceAuditStatus | null
  body: string
  authorEmail: string
  createdAt: string
  seenAt: string | null
  seenByEmail: string | null
  target: { id: string; label: string; sublabel: string | null }
}

// Asignación por activo individual — reemplaza la asignación por categoría.
export interface InsuranceAuditAssignableAsset extends InsuranceAuditVehicleMeta {
  id: string
  code: string | null
  name: string
  assetType: string
  category: string
}

export interface InsuranceAuditAssignmentAuditor {
  userId: string
  name: string
  email: string
  assetIds: string[]
}

export interface InsuranceAuditAssignments {
  auditors: InsuranceAuditAssignmentAuditor[]
  assets: InsuranceAuditAssignableAsset[]
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
    // limit 500 = mismo criterio que los otros 2 dominios de auditoría (tope
    // del schema de paginación del backend, sin paginador visual todavía).
    const res = await apiClient.get<{ data: InsuranceAuditListItem[] }>('/insurance-audits', { params: { limit: 500, ...filters } })
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

  async requestCardUpdate(id: string): Promise<InsuranceAudit> {
    const res = await apiClient.post<{ data: InsuranceAudit }>(`/insurance-audits/${id}/request-card-update`)
    return res.data.data
  },

  async confirmCardPlaced(id: string): Promise<InsuranceAudit> {
    const res = await apiClient.post<{ data: InsuranceAudit }>(`/insurance-audits/${id}/confirm-card-placed`)
    return res.data.data
  },

  async getComments(period: string): Promise<InsuranceAuditCommentItem[]> {
    type RawComment = Omit<InsuranceAuditCommentItem, 'target'> & {
      target: { id: string; code: string | null; name: string; assetType: string } & InsuranceAuditVehicleMeta
    }
    const res = await apiClient.get<{ data: RawComment[] }>('/insurance-audits/comments', { params: { period } })
    return res.data.data.map((c) => ({
      ...c,
      target: { id: c.target.id, label: c.target.name, sublabel: c.target.code ?? c.target.plate ?? null },
    }))
  },

  async addComment(targetId: string, body: string): Promise<void> {
    await apiClient.post('/insurance-audits/comments', { targetId, body })
  },

  async markCommentSeen(id: string): Promise<void> {
    await apiClient.post(`/insurance-audits/${id}/mark-comment-seen`)
  },

  async getAssignments(): Promise<InsuranceAuditAssignments> {
    const res = await apiClient.get<{ data: InsuranceAuditAssignments }>('/insurance-audits/assignments')
    return res.data.data
  },

  async saveAssignment(userId: string, assetIds: string[]): Promise<void> {
    await apiClient.put(`/insurance-audits/assignments/${userId}`, { assetIds })
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
  comments: (period: string) =>
    queryOptions({
      queryKey: [...insuranceAuditKeys.all, 'comments', period] as const,
      queryFn: () => insuranceAuditsApi.getComments(period),
      staleTime: 60 * 1000,
    }),
  assignments: () =>
    queryOptions({
      queryKey: [...insuranceAuditKeys.all, 'assignments'] as const,
      queryFn: () => insuranceAuditsApi.getAssignments(),
      staleTime: 30 * 1000,
    }),
}
