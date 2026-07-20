import { z } from 'zod'

export const CreateCatalogItemSchema = z.object({
  label: z.string().trim().min(1, 'El campo label es requerido y no puede estar vacío').max(200),
  sortOrder: z.number().int().optional(),
})

export const UpdateCatalogItemSchema = z.object({
  label: z.string().trim().min(1, 'El campo label no puede estar vacío').max(200).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
})

export type CreateCatalogItemDTO = z.infer<typeof CreateCatalogItemSchema>
export type UpdateCatalogItemDTO = z.infer<typeof UpdateCatalogItemSchema>
