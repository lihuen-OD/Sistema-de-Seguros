import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

export const CLAIM_EVENT_TYPES = [
  'siniestro_creado', 'estado_cambiado', 'monto_actualizado',
  'liquidacion_registrada', 'franquicia_aplicada', 'nota_agregada',
  'documento_adjunto', 'siniestro_editado', 'gasto_agregado', 'gasto_editado', 'gasto_eliminado',
] as const

// Subset que se puede cargar a mano vía POST /claims/:id/events. El resto
// (siniestro_creado, estado_cambiado, monto_actualizado, documento_adjunto,
// gasto_*) sólo los genera el propio servicio (create/update/addAttachment/
// addExpense/...) — permitirlos acá dejaría fabricar un historial falso.
export const MANUAL_CLAIM_EVENT_TYPES = [
  'liquidacion_registrada', 'franquicia_aplicada', 'nota_agregada', 'siniestro_editado',
] as const

export const OWNERSHIP_TYPES = ['propio', 'terceros'] as const

const ClaimBaseSchema = z.object({
  claimNumber: z.string().min(1).max(100).optional(),
  assetId: z.string().uuid('ID de activo inválido').optional().nullable(),
  policyId: z.string().uuid('ID de póliza inválido').optional().nullable(),
  claimType: z.string().min(1, 'El tipo de siniestro es requerido').max(100),
  occurrenceDate: ISODate,
  reportDate: ISODate,
  description: z.string().min(1, 'La descripción es requerida').max(2000),
  insuranceCompany: z.string().max(300).optional().nullable(),
  ownershipType: z.enum(OWNERSHIP_TYPES).default('propio'),
  responsiblePersonName: z.string().max(300).optional().nullable(),
  thirdPartyInsuranceCompany: z.string().max(300).optional().nullable(),
  thirdPartyContact: z.string().max(500).optional().nullable(),
  thirdPartyInsurerContact: z.string().max(500).optional().nullable(),
  status: z.string().min(1).max(100).default('Denunciado'),
  claimedAmountArs: z.number().min(0).default(0),
  realAmountArs: z.number().min(0).optional().nullable(),
  settledAmountArs: z.number().min(0).optional().nullable(),
  deductibleArs: z.number().min(0).optional().nullable(),
  currency: z.string().min(1).max(10).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  observations: z.string().max(2000).optional().nullable(),
})

function withOwnershipRefinement<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((data: any, ctx: z.RefinementCtx) => {
    if (data.ownershipType === 'terceros') {
      const required: Array<[string, string]> = [
        ['thirdPartyInsuranceCompany', 'La compañía de seguros del tercero es requerida'],
        ['thirdPartyContact', 'El contacto del tercero es requerido'],
        ['thirdPartyInsurerContact', 'El contacto de la aseguradora del tercero es requerido'],
      ]
      for (const [field, message] of required) {
        const value = data[field]
        if (value === undefined || value === null || String(value).trim() === '') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message, path: [field] })
        }
      }
    }
  })
}

export const CreateClaimSchema = withOwnershipRefinement(ClaimBaseSchema)

export const UpdateClaimSchema = withOwnershipRefinement(ClaimBaseSchema.partial())

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
  type: z.enum(MANUAL_CLAIM_EVENT_TYPES),
  description: z.string().min(1).max(1000),
  date: ISODate,
  previousStatus: z.string().max(100).optional().nullable(),
  newStatus: z.string().max(100).optional().nullable(),
  amountLabel: z.string().max(100).optional().nullable(),
  previousAmount: z.number().optional().nullable(),
  newAmount: z.number().optional().nullable(),
  // createdBy NO es un campo que el cliente pueda escribir — siempre se toma
  // de req.user.email en el controller, nunca del body (ver claims.controller.ts).
})

export const AddClaimAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
})

export const CreateExpenseSchema = z.object({
  date: ISODate,
  provider: z.string().min(1, 'El proveedor es requerido').max(300),
  receiptNumber: z.string().max(100).optional().nullable(),
  netAmount: z.number().min(0, 'El monto neto no puede ser negativo'),
  vatAmount: z.number().min(0).default(0),
  otherTaxesAmount: z.number().min(0).default(0),
})

export const UpdateExpenseSchema = CreateExpenseSchema.partial()

export type CreateClaimDTO = z.infer<typeof CreateClaimSchema>
export type UpdateClaimDTO = z.infer<typeof UpdateClaimSchema>
export type ListClaimsQueryDTO = z.infer<typeof ListClaimsQuerySchema>
export type AddEventDTO = z.infer<typeof AddEventSchema>
export type AddClaimAttachmentDTO = z.infer<typeof AddClaimAttachmentSchema>
export type CreateExpenseDTO = z.infer<typeof CreateExpenseSchema>
export type UpdateExpenseDTO = z.infer<typeof UpdateExpenseSchema>
export type OwnershipType = (typeof OWNERSHIP_TYPES)[number]
