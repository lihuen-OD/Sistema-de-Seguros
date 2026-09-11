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

export type ListTasksQueryDTO = z.infer<typeof ListTasksQuerySchema>
