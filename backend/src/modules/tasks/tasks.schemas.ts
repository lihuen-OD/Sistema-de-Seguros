import { z } from 'zod'
import { PaginationSchema, booleanFromString } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

// Listado global paginado de tareas (Fase 2A) — reemplaza, para
// ProducerTasksPage, el fan-out de 1 GET /producers + N GET /producers/:id/tasks.
// Los 4 estados son los reales del backend (ProducerTask.status); "vencida" es
// un estado derivado que solo existe en el frontend (pendiente + dueDate <
// hoy) — para filtrar por eso se usa overdueOnly, no un quinto valor de status.
export const ListTasksQuerySchema = PaginationSchema.extend({
  search: z.string().trim().max(200).optional(),
  status: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).optional(),
  priority: z.enum(['baja', 'media', 'alta']).optional(),
  producerId: z.string().uuid('ID de productor inválido').optional(),
  dueFrom: ISODate.optional(),
  dueTo: ISODate.optional(),
  // Mismo criterio que ya usa producers.service.ts#findOverdueTasksForDashboard
  // para el Dashboard: status pendiente + dueDate anterior a hoy.
  overdueOnly: booleanFromString.optional(),
})

// Escritura global de tareas (Fase 2C). A diferencia del CreateTaskSchema
// legacy (producers.schemas.ts, que toma producerId del path /producers/:id/tasks
// y deja priority como string libre), acá producerId viaja en el body y
// priority sí es un enum cerrado — decisión explícita de esta fase, no una
// reinterpretación silenciosa del comportamiento legacy.
export const CreateGlobalTaskSchema = z.object({
  producerId: z.string().uuid('ID de productor inválido'),
  title: z.string().min(1, 'El título es requerido').max(300),
  description: z.string().max(1000).optional(),
  dueDate: ISODate.optional(),
  status: z.enum(['pendiente', 'en_progreso', 'completada', 'cancelada']).default('pendiente'),
  priority: z.enum(['baja', 'media', 'alta']).default('media'),
  assignedTo: z.string().max(200).optional().nullable(),
  policyId: z.string().uuid().optional().nullable(),
  assetId: z.string().uuid().optional().nullable(),
})

// producerId es el único campo que NO hereda el .optional() del resto vía
// .partial() sin más: si se manda, tiene que ser un UUID válido (nunca vacío
// ni null) — reasignar a "sin productor" no existe, una tarea siempre
// pertenece a alguien. Si no se manda, el service conserva el productor actual.
export const UpdateGlobalTaskSchema = CreateGlobalTaskSchema.partial().extend({
  producerId: z.string().uuid('ID de productor inválido').optional(),
})

export type CreateGlobalTaskDTO = z.infer<typeof CreateGlobalTaskSchema>
export type UpdateGlobalTaskDTO = z.infer<typeof UpdateGlobalTaskSchema>
export type ListTasksQueryDTO = z.infer<typeof ListTasksQuerySchema>
