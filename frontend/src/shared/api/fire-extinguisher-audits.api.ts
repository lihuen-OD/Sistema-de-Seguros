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
  beaconPlateExists: string
  beaconPlateCondition?: string
  beaconPlateMatchesType?: string
  isObstructed: string
  pressureStatus: string
  sealStatus: string
  ringStatus: string
  safetyPinStatus: string
  hoseNozzleCondition: string
  chargeExpirationDateObserved?: string
  hydraulicTestExpirationDateObserved?: string
  cylinderNumberObserved?: string
  capacityObserved?: string
  extinguishingAgentObserved?: string
  brandObserved?: string
  comments?: string
}

export interface FireExtinguisherAuditCreateInput {
  fireExtinguisherId: string
  locationReview: LocationReview
  masterDataReview: MasterFieldReview[]
  checklist: AuditChecklistInput
  observations?: string
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
  observations: string | null
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
    internalNumber: string | null
    type: string
    establishment: string | null
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
}
