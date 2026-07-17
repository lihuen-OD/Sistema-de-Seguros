import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'
import { MODULE_KEYS } from '../../shared/types'

export const ModuleKeySchema = z.enum(MODULE_KEYS)

export const CreateAccessProfileSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  modules: z.array(ModuleKeySchema).default([]),
  isActive: z.boolean().optional(),
})

export const UpdateAccessProfileSchema = CreateAccessProfileSchema.partial()

export const ListAccessProfilesQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
})

export type CreateAccessProfileDTO = z.infer<typeof CreateAccessProfileSchema>
export type UpdateAccessProfileDTO = z.infer<typeof UpdateAccessProfileSchema>
export type ListAccessProfilesQueryDTO = z.infer<typeof ListAccessProfilesQuerySchema>
