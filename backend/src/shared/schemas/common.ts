import { z } from 'zod'

// Coerce string query params a boolean — 'true' → true, 'false' → false
export const booleanFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')

// Base de paginación reutilizable en todos los módulos
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
})

// Filtro de activos reutilizable
export const ActiveFilterSchema = z.object({
  isActive: booleanFromString.optional(),
})
