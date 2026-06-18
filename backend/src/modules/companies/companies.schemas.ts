import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

export const CreateCompanySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  cuit: z
    .string()
    .regex(/^\d{2}-\d{8}-\d$/, 'CUIT inválido. Formato esperado: 30-12345678-9')
    .optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  address: z.string().max(300).optional(),
})

export const UpdateCompanySchema = CreateCompanySchema.partial()

export const ListCompaniesQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
})

export type CreateCompanyDTO = z.infer<typeof CreateCompanySchema>
export type UpdateCompanyDTO = z.infer<typeof UpdateCompanySchema>
export type ListCompaniesQueryDTO = z.infer<typeof ListCompaniesQuerySchema>
