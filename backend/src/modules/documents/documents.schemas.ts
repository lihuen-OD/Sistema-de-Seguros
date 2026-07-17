import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'
import { EmailRecipientsSchema } from '../email/email.schemas'
import { isValidDocumentType } from './document-types'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

const InstallmentInputSchema = z.object({
  installmentNumber: z.number().int().positive(),
  dueDate: ISODate,
  amount: z.number().positive('El monto de la cuota debe ser positivo'),
})

const AllocationInputSchema = z.object({
  policyId: z.string().uuid('ID de póliza inválido'),
  // Puede ser negativo: las Notas de Crédito aplicadas generan asignaciones
  // negativas proporcionales a la distribución de la factura vinculada.
  allocatedAmount: z.number().refine((v) => v !== 0, { message: 'El monto asignado no puede ser cero' }),
  allocationPercentage: z.number().min(0.01).max(100),
})

const DocumentBaseSchema = z.object({
  documentType: z
    .string()
    .min(1, 'El tipo de documento es requerido')
    .max(100)
    .refine(isValidDocumentType, { message: 'Tipo de documento inválido' }),
  documentNumber: z.string().min(1, 'El número de documento es requerido').max(100),
  issueDate: ISODate,
  netAmount: z.number({ required_error: 'El monto neto es requerido' }),
  vatAmount: z.number().default(0),
  otherTaxesAmount: z.number().default(0),
  currency: z.string().min(1).max(10).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  description: z.string().max(1000).optional().nullable(),
  insuranceCompany: z.string().max(300).optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  linkedDocumentId: z.string().uuid('ID de documento vinculado inválido').optional().nullable(),
  // documentStatus NO es un campo que el cliente pueda escribir — el estado
  // inicial siempre es ISSUED (ver create()) y el único camino para cambiarlo
  // es POST /:id/apply o POST /:id/cancel, que validan saldo, tipo de
  // documento y transiciones válidas antes de tocarlo.
  relationType: z.enum(['CREDITS', 'DEBITS', 'REPLACES', 'ADJUSTS', 'ENDORSES']).optional().nullable(),
  adjustmentReason: z.string().max(100).optional().nullable(),
  adjustmentSign: z.enum(['POSITIVE', 'NEGATIVE']).optional().nullable(),
  policyId: z.string().uuid('ID de póliza inválido').optional().nullable(),
  economicImpactType: z
    .enum(['NO_IMPACT', 'INCREASES_COST', 'DECREASES_COST', 'PENDING_DEFINITION'])
    .optional()
    .nullable(),
  endorsementType: z.string().max(100).optional().nullable(),
  endorsementEffectiveDate: ISODate.optional().nullable(),
  installments: z.array(InstallmentInputSchema).default([]),
  allocations: z.array(AllocationInputSchema).default([]),
})

export const CreateDocumentSchema = DocumentBaseSchema

export const UpdateDocumentSchema = DocumentBaseSchema.partial().omit({ documentNumber: true })

export const ListDocumentsQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  paymentStatus: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'NOT_APPLICABLE']).optional(),
  documentType: z.string().max(100).optional(),
  currency: z.string().max(10).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export const UpdateInstallmentSchema = z.object({
  amount: z.number().positive().optional(),
  dueDate: ISODate.optional(),
  paymentStatus: z.enum(['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'NOT_APPLICABLE']).optional(),
  paymentDate: ISODate.optional().nullable(),
  paymentMethod: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
})

export const ReplaceInstallmentsSchema = z.object({
  installments: z.array(InstallmentInputSchema),
})

export const ReplaceAllocationsSchema = z.object({
  allocations: z.array(AllocationInputSchema),
})

export const AddDocumentAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
})

export const CancelDocumentSchema = z.object({
  reason: z.string().max(500).optional(),
})

export const SendDocumentEmailSchema = EmailRecipientsSchema

export const BulkIdsQuerySchema = z.object({
  ids: z
    .string()
    .min(1, 'Se requiere al menos un ID')
    .transform((s) => s.split(',').map((id) => id.trim()).filter(Boolean)),
})

export type CreateDocumentDTO = z.infer<typeof CreateDocumentSchema>
export type UpdateDocumentDTO = z.infer<typeof UpdateDocumentSchema>
export type ListDocumentsQueryDTO = z.infer<typeof ListDocumentsQuerySchema>
export type UpdateInstallmentDTO = z.infer<typeof UpdateInstallmentSchema>
export type ReplaceInstallmentsDTO = z.infer<typeof ReplaceInstallmentsSchema>
export type ReplaceAllocationsDTO = z.infer<typeof ReplaceAllocationsSchema>
export type AddDocumentAttachmentDTO = z.infer<typeof AddDocumentAttachmentSchema>
export type CancelDocumentDTO = z.infer<typeof CancelDocumentSchema>
export type BulkIdsQueryDTO = z.infer<typeof BulkIdsQuerySchema>
export type SendDocumentEmailDTO = z.infer<typeof SendDocumentEmailSchema>
