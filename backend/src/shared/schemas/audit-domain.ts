import { z } from 'zod'

// Schemas compartidos por los 3 dominios de auditoría (matafuegos/rodados,
// activos, seguros) — antes duplicados verbatim entre
// fire-extinguisher-audits.schemas.ts, asset-audits-assignments.schemas.ts e
// insurance-audits.schemas.ts.

// Query de GET /coverage y GET /auditor-progress en los 3 dominios.
export const AuditPeriodQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'),
})
export type AuditPeriodQueryDTO = z.infer<typeof AuditPeriodQuerySchema>

// Body de PUT /assignments/:userId — asignación por activo individual, en
// rodados y seguros (matafuegos gestiona su alcance por otro camino, vía
// users.service, no tiene este endpoint).
export const SaveAssignmentSchema = z.object({
  assetIds: z.array(z.string().uuid('ID de activo inválido')).max(500),
})
export type SaveAssignmentDTO = z.infer<typeof SaveAssignmentSchema>

// Body de POST /bulk-approve en los 3 dominios — aprueba en bloque, confiando
// en lo que cargó el auditor (ver el comentario de cada service#bulkApprove
// para la semántica exacta de qué se aprueba en cada dominio).
export const BulkApproveAuditsSchema = z.object({
  ids: z.array(z.string().uuid('ID de auditoría inválido')).min(1, 'Se requiere al menos una auditoría').max(100),
  reviewNotes: z.string().max(1000).optional().nullable(),
})
export type BulkApproveAuditsDTO = z.infer<typeof BulkApproveAuditsSchema>
