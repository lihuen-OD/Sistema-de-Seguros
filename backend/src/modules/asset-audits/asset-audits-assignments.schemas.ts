import { z } from 'zod'

// Asignación por activo individual — ver asset-audits-assignments.service.ts.
export const SaveAssignmentSchema = z.object({
  assetIds: z.array(z.string().uuid('ID de activo inválido')).max(500),
})

export type SaveAssignmentDTO = z.infer<typeof SaveAssignmentSchema>
