import type { SortDirection, SortState } from '../types'

export interface PaginatedResult<T, S = never> {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
  // Solo presente si se pidió includeSummary=true (Fase 3B): KPIs calculados
  // en el backend sobre TODO el resultado filtrado, no sobre `data`.
  summary?: S
}

// Opt-in de KPIs server-side. Sin esto el backend responde igual que siempre.
export interface ListSummaryParams {
  includeSummary?: boolean
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
