import { z } from 'zod'
import { buildOrderBy, nullsLast, sortQueryFields, type SortMap } from '../sorting'

const KEYS = ['name', 'createdAt'] as const
type Key = (typeof KEYS)[number]
type Order = Record<string, unknown>

const MAP: SortMap<Key, Order> = {
  name: (dir) => ({ name: dir }),
  createdAt: (dir) => ({ createdAt: nullsLast(dir) }),
}

// ── sortQueryFields ───────────────────────────────────────────────────────────

describe('sortQueryFields', () => {
  const schema = z.object(sortQueryFields(KEYS))

  it('accepts a whitelisted sortBy with either direction', () => {
    expect(schema.parse({ sortBy: 'name', sortDir: 'desc' })).toEqual({ sortBy: 'name', sortDir: 'desc' })
    expect(schema.parse({ sortBy: 'createdAt', sortDir: 'asc' })).toEqual({ sortBy: 'createdAt', sortDir: 'asc' })
  })

  it('makes both fields optional', () => {
    expect(schema.parse({})).toEqual({})
  })

  it('rejects a sortBy outside the whitelist (no arbitrary column names reach Prisma)', () => {
    expect(schema.safeParse({ sortBy: 'passwordHash' }).success).toBe(false)
  })

  it('rejects an invalid direction', () => {
    expect(schema.safeParse({ sortBy: 'name', sortDir: 'up' }).success).toBe(false)
  })
})

// ── buildOrderBy ──────────────────────────────────────────────────────────────

describe('buildOrderBy', () => {
  const DEFAULT: Order[] = [{ createdAt: 'desc' }]

  it('keeps the endpoint default order when no sortBy is given, plus an id tiebreak', () => {
    expect(buildOrderBy(MAP, {}, DEFAULT)).toEqual([{ createdAt: 'desc' }, { id: 'asc' }])
  })

  it('ignores sortDir alone (no sortBy → default order)', () => {
    expect(buildOrderBy(MAP, { sortDir: 'desc' }, DEFAULT)).toEqual([{ createdAt: 'desc' }, { id: 'asc' }])
  })

  it('uses the mapped orderBy for the requested key, defaulting to asc', () => {
    expect(buildOrderBy(MAP, { sortBy: 'name' }, DEFAULT)).toEqual([{ name: 'asc' }, { id: 'asc' }])
    expect(buildOrderBy(MAP, { sortBy: 'name', sortDir: 'desc' }, DEFAULT)).toEqual([{ name: 'desc' }, { id: 'asc' }])
  })

  it('passes the direction to nullable columns with nulls last', () => {
    expect(buildOrderBy(MAP, { sortBy: 'createdAt', sortDir: 'desc' }, DEFAULT)).toEqual([
      { createdAt: { sort: 'desc', nulls: 'last' } },
      { id: 'asc' },
    ])
  })
})
