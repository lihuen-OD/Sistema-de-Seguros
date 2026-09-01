import { z } from 'zod'
import { PaginationSchema, booleanFromString } from '../../shared/schemas/common'
import { AuditPeriodQuerySchema, BulkApproveAuditsSchema, SaveAssignmentSchema } from '../../shared/schemas/audit-domain'
import { AUDITABLE_ASSET_CATEGORIES } from '../../shared/types'
import { INSURANCE_AUDIT_STATUSES } from './insurance-audits.constants'

// Acepta ?campo=valor (string) o ?campo=valor1&campo=valor2 (array) y lo
// normaliza siempre a un array (o undefined si no vino) — factorizado acá
// (local a este archivo, no compartido con fire-extinguisher-audits) porque
// status/auditedBy/category repiten la misma forma. Mismo criterio/mismo
// cast explicado que la versión de fire-extinguisher-audits.schemas.ts — TS
// no puede acotar `Array.isArray` sobre una unión genérica.
function arrayFilter<Schema extends z.ZodTypeAny>(schema: Schema) {
  return z
    .union([schema, z.array(schema)])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined
      return (Array.isArray(v) ? v : [v]) as z.infer<Schema>[]
    })
}

const ChecklistSchema = z.object({
  hasCirculationCard: z.boolean(),
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

// Mismo shape que los otros 2 dominios de auditoría — ver shared/schemas/audit-domain.ts.
export const BulkApproveInsuranceAuditsSchema = BulkApproveAuditsSchema

export const ListInsuranceAuditsQuerySchema = PaginationSchema.extend({
  status: arrayFilter(z.enum(INSURANCE_AUDIT_STATUSES)),
  assetId: z.string().uuid('ID de activo inválido').optional(),
  // ── Filtros avanzados de la tabla (mismo criterio que fire-extinguisher-audits) ──
  auditedBy: arrayFilter(z.string().trim().min(1)),
  hasCirculationCard: booleanFromString.optional(),
  // "Con comentarios" (true) / "Sin comentarios" (false) — comments es
  // String? nullable en InsuranceAudit, se filtra por presencia de valor.
  hasComments: booleanFromString.optional(),
  // Categoría del Asset asegurado (una de AUDITABLE_ASSET_CATEGORIES) — a
  // diferencia de Rodados, acá "moto" SÍ es una categoría válida (una moto
  // no lleva matafuego pero sí tiene tarjeta de circulación, ver
  // classifyAuditableAssetCategory en audit-domain.service.ts).
  category: arrayFilter(z.enum(AUDITABLE_ASSET_CATEGORIES)),
})

// Mismo shape que los otros 2 dominios de auditoría — ver shared/schemas/audit-domain.ts.
export const CoverageQuerySchema = AuditPeriodQuerySchema

export const AuditDashboardQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'),
})

export const AuditorProgressQuerySchema = CoverageQuerySchema

// Asignación por activo individual — ver insurance-audits.service.ts#saveAssignment.
// Mismo shape que rodados — ver shared/schemas/audit-domain.ts.
export { SaveAssignmentSchema }

// Comentario suelto ("Agregar comentario"), sin auditoría de por medio — ver
// insurance-audits.service.ts#addComment. Campo `targetId` (no `assetId`)
// para alinear el contrato con el modelo compartido AuditComment y con los
// otros 2 dominios de auditoría (ver shared/services/audit-comments.service.ts).
export const AddCommentSchema = z.object({
  targetId: z.string().uuid('ID de activo inválido'),
  body: z.string().trim().min(1, 'El comentario no puede estar vacío').max(1000),
})

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
export type SaveAssignmentDTO = z.infer<typeof SaveAssignmentSchema>
export type AddCommentDTO = z.infer<typeof AddCommentSchema>
