import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

const PolicyBaseSchema = z.object({
  policyNumber: z.string().min(1, 'El número de póliza es requerido').max(100),
  insuranceTypeId: z.string().uuid('ID de tipo de seguro inválido'),
  companyId: z.string().uuid('ID de empresa inválido'),
  costCenterId: z.string().uuid('ID de centro de costo inválido').optional().nullable(),
  producerId: z.string().uuid('ID de productor inválido').optional().nullable(),
  insuredName: z.string().min(1, 'El nombre del asegurado es requerido').max(300),
  assetId: z.string().uuid('ID de activo inválido').optional().nullable(),
  beneficiaryDescription: z.string().max(2000).optional().nullable(),
  startDate: ISODate,
  endDate: ISODate,
  premium: z.number().positive('La prima debe ser un valor positivo'),
  currency: z.string().min(1).max(10).default('ARS'),
  exchangeRate: z.number().positive('El tipo de cambio debe ser positivo').default(1),
  description: z.string().max(1000).optional(),
  coverageIds: z.array(z.string()).default([]),
})

export const CreatePolicySchema = PolicyBaseSchema.refine(
  (data) => data.endDate.getTime() >= data.startDate.getTime(),
  { message: 'La fecha de fin debe ser posterior a la fecha de inicio', path: ['endDate'] },
)

// UpdatePolicySchema usa la base sin el refine (fechas no requeridas en partial)
export const UpdatePolicySchema = PolicyBaseSchema.partial().omit({ policyNumber: true })

export const ListPoliciesQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
  status: z.enum(['vigente', 'proxima_a_vencer', 'vencida']).optional(),
  insuranceTypeId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  producerId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
})

export const AddPolicyAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
  expirationDate: ISODate.optional().nullable(),
  notifyEmail: z.string().email('Email inválido').optional().or(z.literal('')),
})

export type CreatePolicyDTO = z.infer<typeof CreatePolicySchema>
export type UpdatePolicyDTO = z.infer<typeof UpdatePolicySchema>
export type ListPoliciesQueryDTO = z.infer<typeof ListPoliciesQuerySchema>
export type AddPolicyAttachmentDTO = z.infer<typeof AddPolicyAttachmentSchema>
