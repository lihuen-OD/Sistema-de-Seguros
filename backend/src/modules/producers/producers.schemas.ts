import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema, booleanFromString } from '../../shared/schemas/common'

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

export const SearchProducersQuerySchema = z.object({
  q: z.string().trim().max(100).optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  selectedId: z.string().uuid('ID de productor inválido').optional(),
  activeOnly: booleanFromString.optional(),
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

// GET /producers/tasks/overdue — usado por el Dashboard para el KPI y la
// tarjeta de alertas de "Tareas Vencidas" en una sola request, en vez de un
// GET /producers/:id/tasks por cada productor. `limit` es opcional a
// propósito: el Dashboard lo llama sin límite (necesita el total real para
// poder aplicar su propio filtro de alcance por empresa/centro de costo del
// lado del cliente sin perder precisión), pero queda disponible para un
// futuro consumidor que solo necesite una muestra acotada.
export const ListOverdueTasksQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
})

export type CreateProducerDTO = z.infer<typeof CreateProducerSchema>
export type UpdateProducerDTO = z.infer<typeof UpdateProducerSchema>
export type ListProducersQueryDTO = z.infer<typeof ListProducersQuerySchema>
export type SearchProducersQueryDTO = z.infer<typeof SearchProducersQuerySchema>
export type CreateTaskDTO = z.infer<typeof CreateTaskSchema>
export type UpdateTaskDTO = z.infer<typeof UpdateTaskSchema>
export type ListOverdueTasksQueryDTO = z.infer<typeof ListOverdueTasksQuerySchema>
