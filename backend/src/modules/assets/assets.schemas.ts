import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')

const AllocationInputSchema = z.object({
  costCenterId: z.string().uuid('ID de centro de costo inválido'),
  percentage: z.number().min(0.01).max(100),
})

const allocationsRefinement = (allocs: Array<{ percentage: number }>) =>
  Math.abs(allocs.reduce((sum, a) => sum + a.percentage, 0) - 100) < 0.01

export const CreateAssetSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(300),
  assetType: z.string().min(1, 'El tipo de activo es requerido').max(100),
  brand: z.string().max(100).optional(),
  model: z.string().max(100).optional(),
  serialNumber: z.string().max(100).optional(),
  purchaseDate: ISODate.optional(),
  purchaseValue: z.number().positive().optional(),
  currentValue: z.number().positive().optional(),
  location: z.string().max(300).optional(),
  description: z.string().max(1000).optional(),
  allocations: z
    .array(AllocationInputSchema)
    .min(1, 'Se requiere al menos un centro de costo')
    .refine(allocationsRefinement, { message: 'Las asignaciones deben sumar exactamente 100%' }),
})

export const UpdateAssetSchema = CreateAssetSchema.omit({ allocations: true }).partial()

export const ReplaceAllocationsSchema = z.object({
  allocations: z
    .array(AllocationInputSchema)
    .min(1, 'Se requiere al menos un centro de costo')
    .refine(allocationsRefinement, { message: 'Las asignaciones deben sumar exactamente 100%' }),
})

export const AddValueHistorySchema = z.object({
  value: z.number().positive('El valor debe ser positivo'),
  date: ISODate,
  note: z.string().max(500).optional(),
})

export const AddAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
  expirationDate: ISODate.optional().nullable(),
  notifyEmail: z.string().email('Email inválido').optional().or(z.literal('')),
})

export const ListAssetsQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
  assetType: z.string().optional(),
})

export type CreateAssetDTO = z.infer<typeof CreateAssetSchema>
export type UpdateAssetDTO = z.infer<typeof UpdateAssetSchema>
export type ReplaceAllocationsDTO = z.infer<typeof ReplaceAllocationsSchema>
export type AddValueHistoryDTO = z.infer<typeof AddValueHistorySchema>
export type AddAttachmentDTO = z.infer<typeof AddAttachmentSchema>
export type ListAssetsQueryDTO = z.infer<typeof ListAssetsQuerySchema>
