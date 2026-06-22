import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

export const CreateCostCenterSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  code: z
    .string()
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, 'El código solo puede contener letras mayúsculas, números, - y _')
    .optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

export const UpdateCostCenterSchema = CreateCostCenterSchema.partial()

export const ListCostCentersQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
})

export type CreateCostCenterDTO = z.infer<typeof CreateCostCenterSchema>
export type UpdateCostCenterDTO = z.infer<typeof UpdateCostCenterSchema>
export type ListCostCentersQueryDTO = z.infer<typeof ListCostCentersQuerySchema>
