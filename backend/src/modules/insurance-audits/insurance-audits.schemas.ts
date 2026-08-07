import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'
import { INSURANCE_AUDIT_STATUSES } from './insurance-audits.constants'

const ChecklistSchema = z.object({
  policyActiveConfirmed: z.boolean(),
  insuranceCardPresent: z.boolean(),
  dataMatchesInsuredAsset: z.boolean(),
  physicalConditionOk: z.boolean(),
  odometerOrHoursObserved: z.string().max(50).optional().nullable(),
  comments: z.string().max(1000).optional().nullable(),
})

export const CreateInsuranceAuditSchema = z.object({
  assetId: z.string().uuid('ID de activo inválido'),
  checklist: ChecklistSchema,
})

// Edición de una auditoría propia SUBMITTED — mismo cuerpo que el alta, sin
// assetId (el service solo permite editar mientras status === 'SUBMITTED' y
// el activo auditado no cambia).
export const UpdateInsuranceAuditSchema = z.object({
  checklist: ChecklistSchema,
})

export const AddInsuranceAuditAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
})

export const ReviewInsuranceAuditSchema = z.object({
  auditDecision: z.enum(['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'], {
    errorMap: () => ({ message: 'auditDecision debe ser APPROVED, REJECTED o NEEDS_CORRECTION' }),
  }),
  reviewNotes: z.string().max(1000).optional().nullable(),
})

export const BulkApproveInsuranceAuditsSchema = z.object({
  ids: z.array(z.string().uuid('ID de auditoría inválido')).min(1, 'Se requiere al menos una auditoría').max(100),
  reviewNotes: z.string().max(1000).optional().nullable(),
})

export const ListInsuranceAuditsQuerySchema = PaginationSchema.extend({
  status: z
    .union([z.enum(INSURANCE_AUDIT_STATUSES), z.array(z.enum(INSURANCE_AUDIT_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  assetId: z.string().uuid('ID de activo inválido').optional(),
})

export const CoverageQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'),
})

export const AuditDashboardQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'),
})

export const AuditorProgressQuerySchema = CoverageQuerySchema

export type ChecklistDTO = z.infer<typeof ChecklistSchema>
export type CreateInsuranceAuditDTO = z.infer<typeof CreateInsuranceAuditSchema>
export type UpdateInsuranceAuditDTO = z.infer<typeof UpdateInsuranceAuditSchema>
export type AddInsuranceAuditAttachmentDTO = z.infer<typeof AddInsuranceAuditAttachmentSchema>
export type ReviewInsuranceAuditDTO = z.infer<typeof ReviewInsuranceAuditSchema>
export type BulkApproveInsuranceAuditsDTO = z.infer<typeof BulkApproveInsuranceAuditsSchema>
export type ListInsuranceAuditsQueryDTO = z.infer<typeof ListInsuranceAuditsQuerySchema>
export type CoverageQueryDTO = z.infer<typeof CoverageQuerySchema>
export type AuditDashboardQueryDTO = z.infer<typeof AuditDashboardQuerySchema>
export type AuditorProgressQueryDTO = z.infer<typeof AuditorProgressQuerySchema>
