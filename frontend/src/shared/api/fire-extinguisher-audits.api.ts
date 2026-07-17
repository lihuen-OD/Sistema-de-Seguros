import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

// ── Contrato (ver plan de Fase 3 — reconciliado entre backend y frontend) ──────

export type FireExtAuditMasterField = 'cylinderNumber' | 'expirationDate' | 'capacity' | 'type' | 'brand'

export type MasterFieldReview =
  | { field: FireExtAuditMasterField; action: 'OK' }
  | { field: FireExtAuditMasterField; action: 'MODIFICAR'; newValue: string; reason?: string }

export type LocationReview =
  | { action: 'OK' }
  | { action: 'MODIFICAR'; proposedLocation: string; reason?: string }

export interface AuditChecklistInput {
  cleanliness: string
  chargeFillStatus: string
  beaconPlateCondition: string
  sealStatus: string
  ringStatus: string
  hoseNozzleCondition: string
  chargeExpirationDateObserved: string
  comments?: string
}

export interface FireExtinguisherAuditCreateInput {
  fireExtinguisherId: string
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

// ── Cobertura por establecimiento ───────────────────────────────────────────────

export interface FireExtinguisherCoverageItem {
  id: string
  code: string
  cylinderNumber: string | null
  type: string
  establishment: string | null
  associatedLocationType: string
  location: string | null
  audited: boolean
  auditStatus: FireExtinguisherAuditStatus | null
  auditDate: string | null
}

// ── Informe de auditoría por establecimiento/sector ─────────────────────────────

export interface FireExtinguisherFindingBucket {
  count: number
  items: { id: string; code: string }[]
}

export type FireExtinguisherFindingsField =
  | 'cleanliness'
  | 'chargeFillStatus'
  | 'beaconPlateCondition'
  | 'sealStatus'
  | 'ringStatus'
  | 'hoseNozzleCondition'
  | 'expiration'

export interface FireExtinguisherFindingsSector {
  locationType: string
  total: number
  audited: number
  fields: Record<FireExtinguisherFindingsField, Record<string, FireExtinguisherFindingBucket>>
}

export interface FireExtinguisherFindingsEstablishment {
  establishment: string
  total: number
  audited: number
  sectors: FireExtinguisherFindingsSector[]
}

export interface FireExtinguisherFindingsReport {
  period: string
  establishments: FireExtinguisherFindingsEstablishment[]
}

export const fireExtinguisherAuditKeys = {
  all: ['fire-extinguisher-audits'] as const,
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

  async findAll(): Promise<FireExtinguisherAuditListItem[]> {
    const res = await apiClient.get<{ data: FireExtinguisherAuditListItem[] }>('/fire-extinguisher-audits', {
      params: { limit: 200 },
    })
    return res.data.data
  },

  async review(id: string, input: FireExtinguisherAuditReviewInput): Promise<FireExtinguisherAudit> {
    const res = await apiClient.post<{ data: FireExtinguisherAudit }>(`/fire-extinguisher-audits/${id}/review`, input)
    return res.data.data
  },

  async getCoverage(period: string): Promise<FireExtinguisherCoverageItem[]> {
    const res = await apiClient.get<{ data: FireExtinguisherCoverageItem[] }>('/fire-extinguisher-audits/coverage', {
      params: { period },
    })
    return res.data.data
  },

  async getFindingsReport(period: string): Promise<FireExtinguisherFindingsReport> {
    const res = await apiClient.get<{ data: FireExtinguisherFindingsReport }>(
      '/fire-extinguisher-audits/findings-report',
      { params: { period } },
    )
    return res.data.data
  },
}

// ── Query options (categoría B — semi-dinámico) ──────────────────────────────────

export const fireExtinguisherAuditQueries = {
  list: () =>
    queryOptions({
      queryKey: fireExtinguisherAuditKeys.all,
      queryFn: () => fireExtinguisherAuditsApi.findAll(),
      staleTime: 60 * 1000,
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
  findingsReport: (period: string) =>
    queryOptions({
      queryKey: [...fireExtinguisherAuditKeys.all, 'findings-report', period] as const,
      queryFn: () => fireExtinguisherAuditsApi.getFindingsReport(period),
      staleTime: 60 * 1000,
    }),
}
