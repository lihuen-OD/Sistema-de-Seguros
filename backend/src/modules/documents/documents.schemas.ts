import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'

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
  allocatedAmount: z.number().positive('El monto asignado debe ser positivo'),
  allocationPercentage: z.number().min(0.01).max(100),
})

const DocumentBaseSchema = z.object({
  documentType: z.enum(['factura', 'endoso', 'nota_credito', 'nota_debito', 'refacturacion']),
  documentNumber: z.string().min(1, 'El número de documento es requerido').max(100),
  issueDate: ISODate,
  netAmount: z.number({ required_error: 'El monto neto es requerido' }),
  vatAmount: z.number().default(0),
  otherTaxesAmount: z.number().default(0),
  currency: z.enum(['ARS', 'USD', 'EUR']).default('ARS'),
  exchangeRate: z.number().positive().default(1),
  description: z.string().max(1000).optional().nullable(),
  insuranceCompany: z.string().max(300).optional().nullable(),
  paymentMethod: z
    .enum(['echeq', 'transferencia', 'efectivo', 'debito_automatico', 'otros'])
    .optional()
    .nullable(),
  linkedDocumentId: z.string().uuid('ID de documento vinculado inválido').optional().nullable(),
  installments: z.array(InstallmentInputSchema).default([]),
  allocations: z.array(AllocationInputSchema).default([]),
})

export const CreateDocumentSchema = DocumentBaseSchema

export const UpdateDocumentSchema = DocumentBaseSchema.partial().omit({ documentNumber: true })

export const ListDocumentsQuerySchema = PaginationSchema.extend({
  search: z.string().optional(),
  paymentStatus: z.enum(['pendiente', 'parcial', 'pagado']).optional(),
  documentType: z.enum(['factura', 'endoso', 'nota_credito', 'nota_debito', 'refacturacion']).optional(),
  currency: z.enum(['ARS', 'USD', 'EUR']).optional(),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export const UpdateInstallmentSchema = z.object({
  amount: z.number().positive().optional(),
  dueDate: ISODate.optional(),
  paymentStatus: z.enum(['pendiente', 'pagado']).optional(),
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

export type CreateDocumentDTO = z.infer<typeof CreateDocumentSchema>
export type UpdateDocumentDTO = z.infer<typeof UpdateDocumentSchema>
export type ListDocumentsQueryDTO = z.infer<typeof ListDocumentsQuerySchema>
export type UpdateInstallmentDTO = z.infer<typeof UpdateInstallmentSchema>
export type ReplaceInstallmentsDTO = z.infer<typeof ReplaceInstallmentsSchema>
export type ReplaceAllocationsDTO = z.infer<typeof ReplaceAllocationsSchema>
export type AddDocumentAttachmentDTO = z.infer<typeof AddDocumentAttachmentSchema>
