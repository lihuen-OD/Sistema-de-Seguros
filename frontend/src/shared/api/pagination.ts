import type { SortDirection, SortState } from '../types'

export interface PaginatedResult<T> {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

// Orden server-side de un listado paginado (Fase 3A). sortBy es el id de la
// columna de la tabla; el backend lo valida contra su lista cerrada (422 si
// no está), así que solo las columnas `sortable` de una tabla con orden
// controlado deberían poder generarlo.
export interface ListSortParams {
  sortBy?: string
  sortDir?: SortDirection
}

export function toSortParams(sort: SortState | null): ListSortParams {
  return sort ? { sortBy: sort.key, sortDir: sort.direction } : {}
}
