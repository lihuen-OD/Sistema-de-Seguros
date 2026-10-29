import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchAllPages,
  FETCH_ALL_MAX_CONCURRENT_REQUESTS,
  FETCH_ALL_MAX_PAGES,
  FETCH_ALL_PAGE_SIZE,
} from '../../src/shared/api/pagination'

// R4-B — los tableros traen el listado completo por páginas en vez de los
// primeros 200/500, sin subir el límite del backend.

function fakeEndpoint(total: number) {
  const calls: number[] = []
  const fetchPage = async ({ page, limit }: { page: number; limit: number }) => {
    calls.push(page)
    assert.equal(limit, FETCH_ALL_PAGE_SIZE)
    const start = (page - 1) * limit
    const data = Array.from({ length: Math.max(0, Math.min(limit, total - start)) }, (_, i) => ({ id: `r${start + i}` }))
    return { data, pagination: { total, totalPages: Math.ceil(total / limit) } }
  }
  return { calls, fetchPage }
}

test('más de 500 registros: trae todas las páginas, sin truncar', async () => {
  const { calls, fetchPage } = fakeEndpoint(1234)
  const result = await fetchAllPages(fetchPage)
  assert.equal(result.rows.length, 1234)
  assert.equal(result.total, 1234)
  assert.equal(result.truncated, false)
  assert.deepEqual([...calls].sort(), [1, 2, 3])
})

test('una sola página: una sola request', async () => {
  const { calls, fetchPage } = fakeEndpoint(37)
  const result = await fetchAllPages(fetchPage)
  assert.equal(result.rows.length, 37)
  assert.deepEqual(calls, [1])
})

test('sobre el tope de páginas: devuelve lo traído y lo marca como truncado (no en silencio)', async () => {
  const { calls, fetchPage } = fakeEndpoint(25_000)
  const result = await fetchAllPages(fetchPage)
  assert.equal(calls.length, FETCH_ALL_MAX_PAGES)
  assert.equal(result.rows.length, FETCH_ALL_MAX_PAGES * FETCH_ALL_PAGE_SIZE)
  assert.equal(result.total, 25_000)
  assert.equal(result.truncated, true)
})

test('filas repetidas entre páginas (alta concurrente) no se duplican', async () => {
  const fetchPage = async ({ page }: { page: number; limit: number }) => ({
    data: page === 1 ? [{ id: 'a' }, { id: 'b' }] : [{ id: 'b' }, { id: 'c' }],
    pagination: { total: 3, totalPages: 2 },
  })
  const result = await fetchAllPages(fetchPage)
  assert.deepEqual(result.rows.map((r) => r.id), ['a', 'b', 'c'])
  assert.equal(result.truncated, false)
})

test('limita la concurrencia de páginas adicionales', async () => {
  let activeRequests = 0
  let maxActiveRequests = 0
  const fetchPage = async ({ page, limit }: { page: number; limit: number }) => {
    activeRequests++
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
    await new Promise((resolve) => setTimeout(resolve, 2))
    activeRequests--
    return {
      data: [{ id: `page-${page}` }],
      pagination: { total: 10, totalPages: 10 },
    }
  }

  await fetchAllPages(fetchPage)
  assert.equal(maxActiveRequests, FETCH_ALL_MAX_CONCURRENT_REQUESTS)
})

test('limita globalmente a tres solicitudes entre tres cargas paginadas simultáneas', async () => {
  let activeRequests = 0
  let maxActiveRequests = 0

  const results = await Promise.all(
    Array.from({ length: 3 }, (_, run) =>
      fetchAllPages(async ({ page }) => {
        activeRequests++
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
        try {
          await new Promise((resolve) => setTimeout(resolve, 3))
          return {
            data: [{ id: `run-${run}-page-${page}` }],
            pagination: { total: 3, totalPages: 3 },
          }
        } finally {
          activeRequests--
        }
      }),
    ),
  )

  assert.equal(maxActiveRequests, 3)
  assert.deepEqual(
    results.map((result) => result.rows.map((row) => row.id)),
    Array.from({ length: 3 }, (_, run) =>
      Array.from({ length: 3 }, (_, page) => `run-${run}-page-${page + 1}`),
    ),
  )
})

test('cancela solicitudes en espera sin ejecutarlas y permite avanzar a la siguiente', async () => {
  let unblock!: () => void
  const requestGate = new Promise<void>((resolve) => { unblock = resolve })
  let started = 0
  let allStarted!: () => void
  const threeRequestsStarted = new Promise<void>((resolve) => { allStarted = resolve })
  const activeLoads = Array.from({ length: 3 }, (_, index) =>
    fetchAllPages(async () => {
      started++
      if (started === 3) allStarted()
      await requestGate
      return { data: [{ id: `active-${index}` }], pagination: { total: 1, totalPages: 1 } }
    }),
  )
  const controller = new AbortController()
  let cancelledRequestStarted = false
  const cancelledLoad = fetchAllPages(async () => {
    cancelledRequestStarted = true
    return { data: [{ id: 'cancelled' }], pagination: { total: 1, totalPages: 1 } }
  }, controller.signal)
  const queuedLoad = fetchAllPages(async () => ({
    data: [{ id: 'queued' }],
    pagination: { total: 1, totalPages: 1 },
  }))

  try {
    await threeRequestsStarted
    controller.abort(new Error('cancelled while queued'))
    await assert.rejects(cancelledLoad, /cancelled while queued/)
  } finally {
    unblock()
  }

  await Promise.all(activeLoads)
  const queuedResult = await queuedLoad
  assert.equal(cancelledRequestStarted, false)
  assert.deepEqual(queuedResult.rows.map((row) => row.id), ['queued'])
})

test('libera el cupo tras un error y no bloquea las cargas posteriores', async () => {
  let unblock!: () => void
  const requestGate = new Promise<void>((resolve) => { unblock = resolve })
  let started = 0
  let twoStarted!: () => void
  const twoRequestsStarted = new Promise<void>((resolve) => { twoStarted = resolve })
  const blockers = Array.from({ length: 2 }, (_, index) =>
    fetchAllPages(async () => {
      started++
      if (started === 2) twoStarted()
      await requestGate
      return { data: [{ id: `blocked-${index}` }], pagination: { total: 1, totalPages: 1 } }
    }),
  )

  try {
    await twoRequestsStarted
    await assert.rejects(
      fetchAllPages(async () => { throw new Error('HTTP 429') }),
      /página 1/,
    )

    let timeout: ReturnType<typeof setTimeout> | undefined
    const replacement = await Promise.race([
      fetchAllPages(async () => ({
        data: [{ id: 'replacement' }],
        pagination: { total: 1, totalPages: 1 },
      })),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('El cupo quedó bloqueado')), 1000)
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout)
    })
    assert.deepEqual(replacement.rows.map((row) => row.id), ['replacement'])
  } finally {
    unblock()
  }

  await Promise.all(blockers)
})

test('un error de página rechaza el listado en vez de devolver filas parciales', async () => {
  const fetchPage = async ({ page }: { page: number; limit: number }) => {
    if (page === 3) throw new Error('HTTP 429')
    return {
      data: [{ id: `page-${page}` }],
      pagination: { total: 6, totalPages: 6 },
    }
  }

  await assert.rejects(fetchAllPages(fetchPage), (error: Error & { page?: number; cause?: unknown }) => {
    assert.match(error.message, /página 3/)
    assert.equal(error.page, 3)
    assert.equal((error.cause as Error).message, 'HTTP 429')
    return true
  })
})

test('propaga AbortSignal y cancela las solicitudes de páginas en curso', async () => {
  const controller = new AbortController()
  let signalledRequests = 0
  const fetchPage = async ({ page, signal }: { page: number; limit: number; signal?: AbortSignal }) => {
    if (page === 1) {
      return { data: [{ id: 'page-1' }], pagination: { total: 5, totalPages: 5 } }
    }
    assert.equal(signal, controller.signal)
    signalledRequests++
    if (page === 2) controller.abort(new Error('cancelled'))
    return new Promise<{ data: { id: string }[]; pagination: { total: number; totalPages: number } }>((_, reject) => {
      if (signal?.aborted) reject(signal.reason)
      else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }

  await assert.rejects(fetchAllPages(fetchPage, controller.signal), /cancelled/)
  assert.ok(signalledRequests > 0)
})
