import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

const currentYear = new Date().getFullYear()

const FireExtBaseSchema = z.object({
  type: z.string().min(1, 'El tipo es requerido').max(100),
  capacity: z.string().min(1, 'La capacidad es requerida').max(50),
  expirationDate: ISODate.optional().nullable(),
  chargeDate: ISODate.optional().nullable(),
  hydraulicTestExpirationDate: ISODate.optional().nullable(),
  associatedAssetId: z.string().uuid('ID de activo inválido').optional().nullable(),
  associatedLocationType: z.string().min(1, 'El tipo de ubicación es requerido').max(100),
  location: z.string().max(200).optional().nullable(),
  establishment: z.string().min(1, 'El establecimiento es requerido').max(100),
  brand: z.string().max(100).optional().nullable(),
  cylinderNumber: z.string().trim().min(1, 'El número de cilindro es requerido').max(100),
  manufacturingYear: z.coerce
    .number()
    .int('El año de fabricación debe ser un número entero')
    .min(1950, 'Año de fabricación inválido')
    .max(currentYear, 'El año de fabricación no puede ser futuro'),
  observations: z.string().max(1000).optional().nullable(),
})

export const CreateFireExtinguisherSchema = FireExtBaseSchema

export const UpdateFireExtinguisherSchema = FireExtBaseSchema.partial()

export const ListFireExtinguishersQuerySchema = PaginationSchema.extend({
  status: z.enum(['vigente', 'proximo_vencer', 'vencido', 'sin_fecha']).optional(),
  locationType: z.string().optional(),
  establishment: z.string().optional(),
  assetId: z.string().uuid().optional(),
  unassigned: z
    .enum(['true'])
    .transform(() => true)
    .optional(),
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
})

export const RechargeSchema = z.object({
  chargeDate: ISODate,
  expirationDate: ISODate,
  technician: z.string().max(200).optional().nullable(),
  observations: z.string().max(1000).optional().nullable(),
})

export const AddHistorySchema = z.object({
  action: z.string().min(1, 'La acción es requerida').max(100),
  date: ISODate,
  performedBy: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  nextDueDate: ISODate.optional().nullable(),
})

export const BulkRechargeSchema = RechargeSchema.extend({
  ids: z.array(z.string().uuid('ID de matafuego inválido')).min(1, 'Se requiere al menos un matafuego').max(200),
})

export type CreateFireExtinguisherDTO = z.infer<typeof CreateFireExtinguisherSchema>
export type UpdateFireExtinguisherDTO = z.infer<typeof UpdateFireExtinguisherSchema>
export type ListFireExtinguishersQueryDTO = z.infer<typeof ListFireExtinguishersQuerySchema>
export type RechargeDTO = z.infer<typeof RechargeSchema>
export type AddHistoryDTO = z.infer<typeof AddHistorySchema>
export type BulkRechargeDTO = z.infer<typeof BulkRechargeSchema>
