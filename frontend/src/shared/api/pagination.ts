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

// ── Listado completo para tableros (R4-B) ────────────────────────────────────
// Los tableros que agregan en memoria (Dashboard de Seguros, Dashboard
// general) no pueden quedarse con la primera página: sus totales se anuncian
// como globales. Se recorren las páginas del MISMO endpoint con el máximo que
// acepta el backend (PaginationSchema: 500) — no se sube ningún límite. El
// tope de páginas evita una avalancha de requests en un caso extremo; si se
// alcanza, `truncated` lo hace visible en vez de recortar en silencio.
export const FETCH_ALL_PAGE_SIZE = 500
export const FETCH_ALL_MAX_PAGES = 20
export const FETCH_ALL_MAX_CONCURRENT_REQUESTS = 3

interface RequestSlotWaiter {
  signal?: AbortSignal
  resolve: (release: () => void) => void
  reject: (error: unknown) => void
  onAbort?: () => void
  settled: boolean
}

let activePagedRequests = 0
const pagedRequestQueue: RequestSlotWaiter[] = []

function createRequestSlotRelease(): () => void {
  let released = false
  return () => {
    if (released) return
    released = true

    while (pagedRequestQueue.length > 0) {
      const waiter = pagedRequestQueue.shift()!
      if (waiter.settled) continue
      if (waiter.onAbort) waiter.signal?.removeEventListener('abort', waiter.onAbort)
      if (waiter.signal?.aborted) {
        waiter.settled = true
        waiter.reject(waiter.signal.reason ?? new Error('La solicitud fue cancelada'))
        continue
      }

      waiter.settled = true
      waiter.resolve(createRequestSlotRelease())
      return
    }

    activePagedRequests--
  }
}

function acquirePagedRequestSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) {
    return Promise.reject(signal.reason ?? new Error('La solicitud fue cancelada'))
  }
  if (activePagedRequests < FETCH_ALL_MAX_CONCURRENT_REQUESTS) {
    activePagedRequests++
    return Promise.resolve(createRequestSlotRelease())
  }

  return new Promise((resolve, reject) => {
    const waiter: RequestSlotWaiter = { signal, resolve, reject, settled: false }
    waiter.onAbort = () => {
      if (waiter.settled) return
      waiter.settled = true
      const index = pagedRequestQueue.indexOf(waiter)
      if (index >= 0) pagedRequestQueue.splice(index, 1)
      reject(signal?.reason ?? new Error('La solicitud fue cancelada'))
    }
    pagedRequestQueue.push(waiter)
    signal?.addEventListener('abort', waiter.onAbort, { once: true })
    if (signal?.aborted) waiter.onAbort()
  })
}

export class FetchAllPagesError extends Error {
  constructor(
    readonly page: number,
    readonly cause: unknown,
  ) {
    super(`No se pudo cargar la página ${page} del listado`)
    this.name = 'FetchAllPagesError'
  }
}

export interface CompleteList<T> {
  rows: T[]
  /** Total que informa el backend para el filtro pedido. */
  total: number
  /** true si no se trajeron todas las filas (se alcanzó FETCH_ALL_MAX_PAGES). */
  truncated: boolean
}

export async function fetchAllPages<T extends { id: string }>(
  fetchPage: (params: { page: number; limit: number; signal?: AbortSignal }) => Promise<{ data: T[]; pagination: { total: number; totalPages: number } }>,
  signal?: AbortSignal,
): Promise<CompleteList<T>> {
  const requestPage = async (page: number) => {
    let releaseSlot: (() => void) | undefined
    try {
      releaseSlot = await acquirePagedRequestSlot(signal)
      if (signal?.aborted) throw signal.reason ?? new Error('La solicitud fue cancelada')
      const result = await fetchPage({ page, limit: FETCH_ALL_PAGE_SIZE, ...(signal && { signal }) })
      if (signal?.aborted) throw signal.reason ?? new Error('La solicitud fue cancelada')
      return result
    } catch (error) {
      if (signal?.aborted) throw error
      throw new FetchAllPagesError(page, error)
    } finally {
      releaseSlot?.()
    }
  }

  const first = await requestPage(1)
  const pages = Math.min(first.pagination.totalPages, FETCH_ALL_MAX_PAGES)
  const rest: Awaited<ReturnType<typeof requestPage>>[] = new Array(Math.max(0, pages - 1))
  let nextPage = 2
  let requestError: unknown
  let hasRequestError = false

  const fetchWorker = async () => {
    while (!hasRequestError && nextPage <= pages) {
      const page = nextPage++
      try {
        rest[page - 2] = await requestPage(page)
      } catch (error) {
        if (!hasRequestError) {
          hasRequestError = true
          requestError = error
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(FETCH_ALL_MAX_CONCURRENT_REQUESTS, Math.max(0, pages - 1)) },
      () => fetchWorker(),
    ),
  )
  if (signal?.aborted) throw signal.reason ?? new Error('La solicitud fue cancelada')
  if (hasRequestError) throw requestError

  // Por id: si alguien da de alta un registro mientras se recorren las
  // páginas, el corrimiento no duplica filas.
  const byId = new Map<string, T>()
  for (const row of [first, ...rest].flatMap((result) => result.data)) byId.set(row.id, row)
  const rows = [...byId.values()]
  return { rows, total: first.pagination.total, truncated: rows.length < first.pagination.total }
}

export function toSortParams(sort: SortState | null): ListSortParams {
  return sort ? { sortBy: sort.key, sortDir: sort.direction } : {}
}
