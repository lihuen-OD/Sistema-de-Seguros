import { getPaginationParams, buildPaginatedResponse } from '../pagination'

// ── getPaginationParams ───────────────────────────────────────────────────────

describe('getPaginationParams', () => {
  it('returns defaults when no query params provided', () => {
    const result = getPaginationParams({})
    expect(result).toEqual({ page: 1, limit: 20, skip: 0 })
  })

  it('parses numeric page and limit', () => {
    const result = getPaginationParams({ page: 2, limit: 10 })
    expect(result).toEqual({ page: 2, limit: 10, skip: 10 })
  })

  it('parses string page and limit (from query string)', () => {
    const result = getPaginationParams({ page: '3', limit: '5' })
    expect(result).toEqual({ page: 3, limit: 5, skip: 10 })
  })

  it('enforces minimum page of 1', () => {
    expect(getPaginationParams({ page: 0 }).page).toBe(1)
    expect(getPaginationParams({ page: -10 }).page).toBe(1)
  })

  it('uses default limit when limit is 0 (falsy → falls back to default 20)', () => {
    expect(getPaginationParams({ limit: 0 }).limit).toBe(20)
  })

  it('enforces minimum limit of 1 for negative values', () => {
    expect(getPaginationParams({ limit: -5 }).limit).toBe(1)
    expect(getPaginationParams({ limit: -100 }).limit).toBe(1)
  })

  it('enforces maximum limit of 100', () => {
    expect(getPaginationParams({ limit: 200 }).limit).toBe(100)
    expect(getPaginationParams({ limit: 101 }).limit).toBe(100)
    expect(getPaginationParams({ limit: 100 }).limit).toBe(100)
  })

  it('calculates skip correctly', () => {
    expect(getPaginationParams({ page: 1, limit: 20 }).skip).toBe(0)
    expect(getPaginationParams({ page: 2, limit: 20 }).skip).toBe(20)
    expect(getPaginationParams({ page: 5, limit: 10 }).skip).toBe(40)
  })

  it('handles invalid string values gracefully', () => {
    const result = getPaginationParams({ page: 'abc', limit: 'xyz' })
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
  })
})

// ── buildPaginatedResponse ────────────────────────────────────────────────────

describe('buildPaginatedResponse', () => {
  it('builds correct pagination metadata', () => {
    const result = buildPaginatedResponse([1, 2, 3], 30, { page: 1, limit: 10 })
    expect(result.data).toEqual([1, 2, 3])
    expect(result.pagination).toEqual({
      total: 30,
      page: 1,
      limit: 10,
      totalPages: 3,
    })
  })

  it('calculates totalPages correctly with remainder', () => {
    const result = buildPaginatedResponse([], 25, { page: 3, limit: 10 })
    expect(result.pagination.totalPages).toBe(3)
  })

  it('calculates totalPages correctly for exact multiple', () => {
    const result = buildPaginatedResponse([], 20, { page: 1, limit: 10 })
    expect(result.pagination.totalPages).toBe(2)
  })

  it('returns totalPages 0 when total is 0', () => {
    const result = buildPaginatedResponse([], 0, { page: 1, limit: 20 })
    expect(result.pagination.totalPages).toBe(0)
    expect(result.data).toEqual([])
  })

  it('preserves data array type', () => {
    const items = [{ id: '1', name: 'test' }]
    const result = buildPaginatedResponse(items, 1, { page: 1, limit: 20 })
    expect(result.data[0]).toEqual({ id: '1', name: 'test' })
  })

  it('returns single page for small datasets', () => {
    const result = buildPaginatedResponse(['a', 'b'], 2, { page: 1, limit: 20 })
    expect(result.pagination.totalPages).toBe(1)
  })
})
