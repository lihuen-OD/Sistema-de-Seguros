import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { fireExtinguisherLabel } from '../utils/format'

// ── Contrato (ver plan de Fase 3 — reconciliado entre backend y frontend) ──────

export type FireExtAuditMasterField = 'cylinderNumber' | 'expirationDate' | 'capacity' | 'type' | 'brand' | 'iramCertificateNumber'

export type MasterFieldReview =
  | { field: FireExtAuditMasterField; action: 'OK' }
  | { field: FireExtAuditMasterField; action: 'MODIFICAR'; newValue: string; reason?: string }

export type LocationReview =
  | { action: 'OK' }
  | { action: 'MODIFICAR'; proposedLocation: string; reason?: string }

export interface AuditChecklistInput {
  cleanliness: string
  chargeFillStatus: string
  mountingCondition: string
  sealStatus: string
  ringStatus: string
  hoseNozzleCondition: string
  chargeExpirationDateObserved?: string | null
  comments?: string
}

export interface FireExtinguisherAuditCreateInput {
  fireExtinguisherId: string
  locationReview: LocationReview
  masterDataReview: MasterFieldReview[]
  checklist: AuditChecklistInput
}

export interface FireExtinguisherAuditUpdateInput {
  locationReview: LocationReview
  masterDataReview: MasterFieldReview[]
  checklist: AuditChecklistInput
}

export interface FireExtinguisherAuditProposedChange {
  id: string
  fieldName: string
  currentValue: string
  proposedValue: string
  reason: string | null
  status: string
}

export interface FireExtinguisherAuditAttachment {
  id: string
  fireExtinguisherId: string
  auditId: string | null
  name: string
  fileType: 'pdf' | 'image' | 'excel' | 'other'
  fileSize: string
  fileUrl?: string
  uploadedAt: string
  uploadedBy: string
}

export interface FireExtinguisherAudit {
  id: string
  fireExtinguisherId: string
  status: string
  auditDate: string
  auditPeriod: string
  auditedBy: string
  locationConfirmed: boolean
  locationChangeRequested: boolean
  proposedLocation: string | null
  locationChangeReason: string | null
  checklist: AuditChecklistInput
  proposedChanges: FireExtinguisherAuditProposedChange[]
  attachments: FireExtinguisherAuditAttachment[]
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
  updatedAt: string
}

// ── Revisión/aprobación (Fase 4) ────────────────────────────────────────────────

export type FireExtinguisherAuditStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'

export interface FireExtinguisherAuditListItem {
  id: string
  status: FireExtinguisherAuditStatus
  auditDate: string
  auditPeriod: string
  auditedBy: string
  reviewedBy: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  proposedChangesCount: number
  extinguisher: {
    id: string
    code: string
    cylinderNumber: string | null
    type: string
    establishment: string | null
    associatedLocationType: string
    location: string | null
    asset: { id: string; code: string | null; name: string; assetType: string } | null
  } | null
}

export interface ProposedChangeDecisionInput {
  proposedChangeId: string
  decision: 'APPROVED' | 'REJECTED'
}

export interface FireExtinguisherAuditReviewInput {
  decisions: ProposedChangeDecisionInput[]
  auditDecision: 'APPROVED' | 'REJECTED' | 'NEEDS_CORRECTION'
  reviewNotes?: string
}

export interface BulkApproveFireExtinguisherAuditsResult {
  approved: string[]
  failed: { id: string; code: string | null; message: string }[]
}

// ── Cobertura por establecimiento ───────────────────────────────────────────────

export interface FireExtinguisherCoverageItem {
  id: string
  code: string
  cylinderNumber: string | null
  type: string
  establishment: string | null
  associatedLocationType: string
  location: string | null
  // Poblados solo del lado Activos (matafuego vinculado a un vehículo/
  // maquinaria) — null del lado Matafuegos (edificio). Ver
  // fire-extinguisher-audits.population.ts en el backend.
  asset: { id: string; code: string | null; name: string; assetType: string } | null
  category: string | null
  audited: boolean
  auditId: string | null
  auditStatus: FireExtinguisherAuditStatus | null
  auditDate: string | null
}

// ── Informe de auditoría por establecimiento/sector ─────────────────────────────

// ── Dashboard de nivel % (auditoría mensual) ────────────────────────────────────

export type AuditControlPointKey =
  | 'cleanliness'
  | 'chargeFillStatus'
  | 'mountingCondition'
  | 'sealStatus'
  | 'ringStatus'
  | 'hoseNozzleCondition'
  | 'expiration'

export interface AuditControlPointLevel {
  key: AuditControlPointKey
  label: string
  level: number | null
  levelLabel: string | null
}

export interface AuditFlaggedExtinguisher {
  cylinderNumber: string
  location: string | null
  // Solo viene poblado en needsCleaningExtinguishers — nivel de suciedad de
  // la última auditoría, usado para separar "requieren limpieza" de "sugiere
  // limpieza" en el PDF del informe.
  cleanliness?: string
}

export interface AuditDashboardSector {
  establishment: string
  locationType: string
  total: number
  audited: number
  level: number | null
  levelLabel: string | null
  controlPoints: AuditControlPointLevel[]
  expiredExtinguishers: AuditFlaggedExtinguisher[]
  needsCleaningExtinguishers: AuditFlaggedExtinguisher[]
}

export interface AuditDashboard {
  period: string
  establishment: string | null
  establishments: string[] | null
  totalRegistered: number
  totalAudited: number
  overallLevel: number | null
  overallLevelLabel: string | null
  controlPoints: AuditControlPointLevel[]
  sectors: AuditDashboardSector[]
}

// ── Historial de limpieza multi-período (heatmap sector × mes) ─────────────────

export interface AvailableAuditPeriod {
  period: string
  auditCount: number
}

export interface CleanlinessHistoryCell {
  period: string
  audited: number
  level: number | null
  levelLabel: string | null
}

// Celda de un matafuego individual (no un promedio) — `cleanliness` es el
// valor crudo del checklist (ver checklistConfig.ts), necesario porque MUY_SUCIO
// y SUCIEDAD_ACUMULADA comparten el mismo puntaje/color y solo el texto exacto
// los distingue (se muestra en el tooltip de la celda).
export interface CleanlinessHistoryExtinguisherCell {
  period: string
  cleanliness: string | null
  level: number | null
  levelLabel: string | null
}

export interface CleanlinessHistoryExtinguisher {
  cylinderNumber: string
  location: string | null
  cells: CleanlinessHistoryExtinguisherCell[]
}

export interface CleanlinessHistorySector {
  establishment: string
  locationType: string
  total: number
  cells: CleanlinessHistoryCell[]
  extinguishers: CleanlinessHistoryExtinguisher[]
}

export interface CleanlinessHistoryReport {
  periods: string[]
  sectors: CleanlinessHistorySector[]
}

// ── Progreso por auditor ─────────────────────────────────────────────────────────

export interface AuditorProgress {
  userId: string
  name: string
  email: string
  assignedEstablishments: string[]
  assigned: number
  completed: number
  pending: number
  completionRate: number | null
}

export interface AuditorProgressReport {
  period: string
  auditors: AuditorProgress[]
}

export interface FireExtinguisherAuditListFilters {
  fireExtinguisherId?: string
}

// ── Comentarios de Cobertura (feed compartido — ver AuditCommentsPanel.tsx) ────

export type FireExtinguisherAuditCommentSource = 'AUDITOR_NOTE' | 'REVIEW_DECISION' | 'MANUAL'

export interface FireExtinguisherAuditCommentItem {
  id: string
  source: FireExtinguisherAuditCommentSource
  auditStatus: FireExtinguisherAuditStatus | null
  body: string
  authorEmail: string
  createdAt: string
  seenAt: string | null
  seenByEmail: string | null
  target: { id: string; label: string; sublabel: string | null }
}

export const fireExtinguisherAuditKeys = {
  all: ['fire-extinguisher-audits'] as const,
  list: (filters?: FireExtinguisherAuditListFilters) =>
    filters ? ([...fireExtinguisherAuditKeys.all, filters] as const) : fireExtinguisherAuditKeys.all,
  detail: (id: string) => [...fireExtinguisherAuditKeys.all, id] as const,
}

export const fireExtinguisherAuditsApi = {
  async create(input: FireExtinguisherAuditCreateInput): Promise<FireExtinguisherAudit> {
    const res = await apiClient.post<{ data: FireExtinguisherAudit }>('/fire-extinguisher-audits', input)
    return res.data.data
  },

  async findById(id: string): Promise<FireExtinguisherAudit> {
    const res = await apiClient.get<{ data: FireExtinguisherAudit }>(`/fire-extinguisher-audits/${id}`)
    return res.data.data
  },

  async update(id: string, input: FireExtinguisherAuditUpdateInput): Promise<FireExtinguisherAudit> {
    const res = await apiClient.put<{ data: FireExtinguisherAudit }>(`/fire-extinguisher-audits/${id}`, input)
    return res.data.data
  },

  async addAttachment(auditId: string, file: File): Promise<FireExtinguisherAuditAttachment> {
    const form = new FormData()
    form.append('file', file)
    const res = await apiClient.post<{ data: FireExtinguisherAuditAttachment }>(
      `/fire-extinguisher-audits/${auditId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return res.data.data
  },

  async deleteAttachment(auditId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/fire-extinguisher-audits/${auditId}/attachments/${attachmentId}`)
  },

  async findAll(filters?: FireExtinguisherAuditListFilters): Promise<FireExtinguisherAuditListItem[]> {
    const res = await apiClient.get<{ data: FireExtinguisherAuditListItem[] }>('/fire-extinguisher-audits', {
      params: { limit: 200, ...filters },
    })
    return res.data.data
  },

  async review(id: string, input: FireExtinguisherAuditReviewInput): Promise<FireExtinguisherAudit> {
    const res = await apiClient.post<{ data: FireExtinguisherAudit }>(`/fire-extinguisher-audits/${id}/review`, input)
    return res.data.data
  },

  async bulkApprove(ids: string[], reviewNotes?: string): Promise<BulkApproveFireExtinguisherAuditsResult> {
    const res = await apiClient.post<{ data: BulkApproveFireExtinguisherAuditsResult }>(
      '/fire-extinguisher-audits/bulk-approve',
      { ids, reviewNotes },
    )
    return res.data.data
  },

  async getCoverage(period: string): Promise<FireExtinguisherCoverageItem[]> {
    const res = await apiClient.get<{ data: FireExtinguisherCoverageItem[] }>('/fire-extinguisher-audits/coverage', {
      params: { period },
    })
    return res.data.data
  },

  async getAuditDashboard(period: string, establishment?: string): Promise<AuditDashboard> {
    const res = await apiClient.get<{ data: AuditDashboard }>('/fire-extinguisher-audits/audit-dashboard', {
      params: { period, establishment },
    })
    return res.data.data
  },

  async getAuditorProgress(period: string): Promise<AuditorProgressReport> {
    const res = await apiClient.get<{ data: AuditorProgressReport }>('/fire-extinguisher-audits/auditor-progress', {
      params: { period },
    })
    return res.data.data
  },

  async getAvailablePeriods(): Promise<AvailableAuditPeriod[]> {
    const res = await apiClient.get<{ data: AvailableAuditPeriod[] }>('/fire-extinguisher-audits/available-periods')
    return res.data.data
  },

  async getCleanlinessHistory(periods: string[]): Promise<CleanlinessHistoryReport> {
    const res = await apiClient.get<{ data: CleanlinessHistoryReport }>('/fire-extinguisher-audits/cleanliness-history', {
      params: { periods: periods.join(',') },
    })
    return res.data.data
  },

  async getComments(period: string): Promise<FireExtinguisherAuditCommentItem[]> {
    type RawComment = Omit<FireExtinguisherAuditCommentItem, 'target'> & {
      target: { id: string; code: string; cylinderNumber: string | null; location: string | null; establishment: string | null; assetName: string | null }
    }
    const res = await apiClient.get<{ data: RawComment[] }>('/fire-extinguisher-audits/comments', { params: { period } })
    return res.data.data.map((c) => ({
      ...c,
      target: {
        id: c.target.id,
        label: fireExtinguisherLabel(c.target.cylinderNumber, c.target.location, c.target.code),
        sublabel: c.target.establishment ?? c.target.assetName ?? null,
      },
    }))
  },

  async addComment(targetId: string, body: string): Promise<void> {
    await apiClient.post('/fire-extinguisher-audits/comments', { targetId, body })
  },

  async markCommentSeen(id: string): Promise<void> {
    await apiClient.post(`/fire-extinguisher-audits/comments/${id}/mark-seen`)
  },
}

// ── Query options (categoría B — semi-dinámico) ──────────────────────────────────

export const fireExtinguisherAuditQueries = {
  list: (filters?: FireExtinguisherAuditListFilters) =>
    queryOptions({
      queryKey: fireExtinguisherAuditKeys.list(filters),
      queryFn: () => fireExtinguisherAuditsApi.findAll(filters),
      staleTime: 60 * 1000,
      enabled: filters?.fireExtinguisherId === undefined || !!filters.fireExtinguisherId,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: fireExtinguisherAuditKeys.detail(id),
      queryFn: () => fireExtinguisherAuditsApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  coverage: (period: string) =>
    queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'coverage', period] as const,
      queryFn: () => fireExtinguisherAuditsApi.getCoverage(period),
      staleTime: 60 * 1000,
    }),
  auditDashboard: (period: string, establishment?: string) =>
    queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'audit-dashboard', period, establishment ?? null] as const,
      queryFn: () => fireExtinguisherAuditsApi.getAuditDashboard(period, establishment),
      staleTime: 60 * 1000,
    }),
  auditorProgress: (period: string) =>
    queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'auditor-progress', period] as const,
      queryFn: () => fireExtinguisherAuditsApi.getAuditorProgress(period),
      staleTime: 60 * 1000,
    }),
  comments: (period: string) =>
    queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'comments', period] as const,
      queryFn: () => fireExtinguisherAuditsApi.getComments(period),
      staleTime: 60 * 1000,
    }),
  // Cambia poco — un mes nuevo con auditorías aparece a lo sumo una vez al mes.
  availablePeriods: () =>
    queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'available-periods'] as const,
      queryFn: () => fireExtinguisherAuditsApi.getAvailablePeriods(),
      staleTime: 10 * 60 * 1000,
    }),
  // queryKey ordena `periods` para no invalidar caché por el orden en que se
  // tildaron los meses en el picker.
  cleanlinessHistory: (periods: string[]) => {
    const sortedPeriods = [...periods].sort()
    return queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'cleanliness-history', sortedPeriods] as const,
      queryFn: () => fireExtinguisherAuditsApi.getCleanlinessHistory(sortedPeriods),
      staleTime: 60 * 1000,
      enabled: sortedPeriods.length > 0,
    })
  },
}
