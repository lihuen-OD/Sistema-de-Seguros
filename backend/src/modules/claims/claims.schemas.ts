import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

export const CLAIM_EVENT_TYPES = [
  'siniestro_creado', 'estado_cambiado', 'monto_actualizado',
  'liquidacion_registrada', 'franquicia_aplicada', 'nota_agregada',
  'documento_adjunto', 'siniestro_editado',
] as const

const ClaimBaseSchema = z.object({
  claimNumber: z.string().min(1).max(100).optional(),
  assetId: z.string().uuid('ID de activo inválido').optional().nullable(),
  policyId: z.string().uuid('ID de póliza inválido').optional().nullable(),
  claimType: z.string().min(1, 'El tipo de siniestro es requerido').max(100),
  occurrenceDate: ISODate,
  reportDate: ISODate,
  description: z.string().min(1, 'La descripción es requerida').max(2000),
  insuranceCompany: z.string().max(300).optional().nullable(),
  status: z.string().min(1).max(100).default('Denunciado'),
  claimedAmountArs: z.number().min(0).default(0),
  realAmountArs: z.number().min(0).optional().nullable(),
  settledAmountArs: z.number().min(0).optional().nullable(),
  deductibleArs: z.number().min(0).optional().nullable(),
  currency: z.string().min(1).max(10).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  observations: z.string().max(2000).optional().nullable(),
})

export const CreateClaimSchema = ClaimBaseSchema

export const UpdateClaimSchema = ClaimBaseSchema.partial()

export const ListClaimsQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  status: z.string().max(100).optional(),
  claimType: z.string().max(100).optional(),
  policyId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export const AddEventSchema = z.object({
  type: z.enum(CLAIM_EVENT_TYPES),
  description: z.string().min(1).max(1000),
  date: ISODate,
  previousStatus: z.string().max(100).optional().nullable(),
  newStatus: z.string().max(100).optional().nullable(),
  amountLabel: z.string().max(100).optional().nullable(),
  previousAmount: z.number().optional().nullable(),
  newAmount: z.number().optional().nullable(),
  createdBy: z.string().max(200).optional().nullable(),
})

export const AddClaimAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
})

export type CreateClaimDTO = z.infer<typeof CreateClaimSchema>
export type UpdateClaimDTO = z.infer<typeof UpdateClaimSchema>
export type ListClaimsQueryDTO = z.infer<typeof ListClaimsQuerySchema>
export type AddEventDTO = z.infer<typeof AddEventSchema>
export type AddClaimAttachmentDTO = z.infer<typeof AddClaimAttachmentSchema>
