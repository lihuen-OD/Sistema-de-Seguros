import { z } from 'zod'

// Buscador global del Topbar. El mínimo de 2 caracteres evita búsquedas que
// matchean casi toda la tabla; `limit` es por grupo (Activos/Pólizas/
// Documentos), no total — el panel muestra pocos resultados por categoría.
export const GlobalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Ingresá al menos 2 caracteres').max(100),
  limit: z.coerce.number().int().min(1).max(10).optional().default(5),
})

export type GlobalSearchQueryDTO = z.infer<typeof GlobalSearchQuerySchema>
