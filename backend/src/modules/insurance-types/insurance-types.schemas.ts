import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

const CoverageInputSchema = z.object({
  name: z.string().min(1, 'El nombre de la cobertura es requerido').max(200),
  description: z.string().max(500).optional(),
})

export const CreateInsuranceTypeSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  description: z.string().max(500).optional(),
  coverages: z.array(CoverageInputSchema).default([]),
})

export const UpdateInsuranceTypeSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
})

export const CreateCoverageSchema = CoverageInputSchema

export const ListInsuranceTypesQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
})

export type CreateInsuranceTypeDTO = z.infer<typeof CreateInsuranceTypeSchema>
export type UpdateInsuranceTypeDTO = z.infer<typeof UpdateInsuranceTypeSchema>
export type CreateCoverageDTO = z.infer<typeof CreateCoverageSchema>
export type ListInsuranceTypesQueryDTO = z.infer<typeof ListInsuranceTypesQuerySchema>
