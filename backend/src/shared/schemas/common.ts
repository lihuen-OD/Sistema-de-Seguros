import { z } from 'zod'

// Coerce string query params a boolean — 'true' → true, 'false' → false
export const booleanFromString = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')

// Base de paginación reutilizable en todos los módulos
export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(500).default(20),
})

// Opt-in de KPIs server-side en listados paginados (Fase 3B): con
// includeSummary=true la respuesta agrega `summary`, calculado sobre TODO el
// resultado filtrado (no la página). Sin el parámetro la respuesta y el costo
// son los de siempre — los consumidores legacy no pagan las queries extra.
export const IncludeSummarySchema = z.object({
  includeSummary: booleanFromString.optional(),
})

// Filtro de activos reutilizable
export const ActiveFilterSchema = z.object({
  isActive: booleanFromString.optional(),
})
