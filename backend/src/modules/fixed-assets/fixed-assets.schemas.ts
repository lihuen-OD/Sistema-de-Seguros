import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

export const CreateFixedAssetSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  code: z
    .string()
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, 'El código solo puede contener letras mayúsculas, números, - y _')
    .optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

export const UpdateFixedAssetSchema = CreateFixedAssetSchema.partial()

export const ListFixedAssetsQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
})

export type CreateFixedAssetDTO = z.infer<typeof CreateFixedAssetSchema>
export type UpdateFixedAssetDTO = z.infer<typeof UpdateFixedAssetSchema>
export type ListFixedAssetsQueryDTO = z.infer<typeof ListFixedAssetsQuerySchema>
