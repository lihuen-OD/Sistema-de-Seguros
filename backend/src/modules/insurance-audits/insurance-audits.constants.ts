export const INSURANCE_AUDIT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION'] as const

export type InsuranceAuditStatus = (typeof INSURANCE_AUDIT_STATUSES)[number]
