import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

export const CreateProducerSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido').max(200),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  matricula: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
})

export const UpdateProducerSchema = CreateProducerSchema.partial()

export const ListProducersQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
})

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'El título es requerido').max(300),
  description: z.string().max(1000).optional(),
  dueDate: ISODate.optional(),
  status: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).default('pendiente'),
  priority: z.string().max(50).default('media'),
  assignedTo: z.string().max(200).optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
})

export const UpdateTaskSchema = CreateTaskSchema.partial()

export type CreateProducerDTO = z.infer<typeof CreateProducerSchema>
export type UpdateProducerDTO = z.infer<typeof UpdateProducerSchema>
export type ListProducersQueryDTO = z.infer<typeof ListProducersQuerySchema>
export type CreateTaskDTO = z.infer<typeof CreateTaskSchema>
export type UpdateTaskDTO = z.infer<typeof UpdateTaskSchema>
