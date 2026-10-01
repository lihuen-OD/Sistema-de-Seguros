import { z } from 'zod'

// Ordenamiento server-side de listados paginados (Fase 3A). El orden se aplica
// en la query, antes de skip/take — ordenar en el cliente solo reordenaba la
// página visible y parecía ordenar toda la tabla.
//
// Cada módulo declara la lista cerrada de claves ordenables (en sus schemas,
// para validar con Zod) y un SortMap clave → orderBy de Prisma (en su service).
// Las claves son los ids de columna del frontend, así la tabla manda el id de
// la columna clickeada tal cual. Tipar el SortMap con la misma unión de claves
// hace que TypeScript exija que lista y mapa coincidan exactamente.

export const SortDirSchema = z.enum(['asc', 'desc'])
export type SortDir = z.infer<typeof SortDirSchema>

export type SortMap<K extends string, O> = Record<K, (dir: SortDir) => O>

// Campos sortBy/sortDir para extender el schema de query de un listado.
// Un sortBy fuera de la lista cerrada falla la validación (422).
export function sortQueryFields<const K extends readonly [string, ...string[]]>(keys: K) {
  return {
    sortBy: z.enum(keys).optional(),
    sortDir: SortDirSchema.optional(),
  }
}

// Para columnas opcionales: vacíos siempre al final sin importar la dirección
// (mismo criterio que tenía el orden local del DataTable). Prisma no admite
// `nulls` en campos de relaciones — ahí queda el default de Postgres.
export function nullsLast(dir: SortDir) {
  return { sort: dir, nulls: 'last' as const }
}

// Sin sortBy devuelve el orden por defecto del endpoint (contrato legacy).
// Siempre agrega id como desempate: sin un orden total, filas con el mismo
// valor pueden repetirse o saltearse entre páginas.
export function buildOrderBy<K extends string, O>(
  map: SortMap<K, O>,
  query: { sortBy?: K; sortDir?: SortDir },
  defaultOrder: O[],
): O[] {
  const tiebreak = { id: 'asc' } as O
  if (!query.sortBy) return [...defaultOrder, tiebreak]
  return [map[query.sortBy](query.sortDir ?? 'asc'), tiebreak]
}
