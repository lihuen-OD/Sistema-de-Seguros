import request from 'supertest'
import type { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

// Intercalaciones concretas entre registrar una renovación y editar la fecha
// de fin de una póliza — las carreras que el bloqueo de filas de
// policy-renewals.service.ts#lockPolicies tiene que cerrar. Corre contra una
// base falsa mínima (ver createFakeDb), nunca contra Postgres.

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findUnique: jest.fn() },
    producer: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const PREV_ID = '33000000-0000-0000-0000-000000000001'
const NEW_ID = '33000000-0000-0000-0000-000000000002'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

type PolicyRow = { id: string; policyNumber: string; startDate: Date; endDate: Date; deactivatedAt: Date | null }
type LinkRow = { id: string; previousPolicyId: string; renewalPolicyId: string; revokedAt: Date | null; notes: string | null; createdBy: string; createdAt: Date }
type Pending = { policyUpdates: Map<string, Partial<PolicyRow>>; newLinks: LinkRow[] }

// Pausas y requests en vuelo del test actual — afterEach abre y espera todo,
// así un test que falla a mitad de una intercalación no deja requests colgados.
const openGates: (() => void)[] = []
const inFlight: Promise<unknown>[] = []

afterEach(async () => {
  openGates.splice(0).forEach((open) => open())
  await Promise.allSettled(inFlight.splice(0))
})

// Una pausa controlada por el test: el código llega, avisa (`reached`) y
// espera hasta que el test la abre.
function gate() {
  let open!: () => void
  const opened = new Promise<void>((resolve) => { open = resolve })
  openGates.push(open)
  const state = { reached: false, open, wait: () => { state.reached = true; return opened } }
  return state
}

async function waitUntil(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timeout esperando la intercalación del test')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

// Base falsa con lo justo para reproducir la carrera con la semántica de
// Postgres que importa acá:
// - READ COMMITTED: cada transacción ve lo confirmado más lo propio; sus
//   escrituras se aplican recién al confirmar.
// - SELECT ... FOR NO KEY UPDATE: espera a que la transacción que tiene la
//   fila la libere (al confirmar o abortar). Las filas se bloquean en orden.
function createFakeDb(policies: PolicyRow[], links: LinkRow[] = []) {
  const committed = new Map(policies.map((p) => [p.id, { ...p }]))
  const committedLinks = [...links]
  const held = new Map<string, Promise<void>>()
  const waiters = new Map<string, number>()
  const hooks: { beforeInsertLink?: () => Promise<void>; beforePolicyUpdate?: (id: string) => Promise<void> | undefined } = {}

  async function acquire(ids: string[], releases: (() => void)[]) {
    for (const id of [...new Set(ids)].sort()) {
      while (held.has(id)) {
        waiters.set(id, (waiters.get(id) ?? 0) + 1)
        await held.get(id)
        waiters.set(id, (waiters.get(id) ?? 1) - 1)
      }
      let release!: () => void
      held.set(id, new Promise<void>((resolve) => { release = () => { held.delete(id); resolve() } }))
      releases.push(release)
    }
  }

  function txClient(pending: Pending, releases: (() => void)[]) {
    const readPolicy = (id: string) => {
      const row = committed.get(id)
      return row ? { ...row, ...pending.policyUpdates.get(id) } : null
    }
    const activeLinks = () => [...committedLinks, ...pending.newLinks].filter((l) => l.revokedAt === null)
    const ref = (id: string) => ({ ...readPolicy(id)!, insuredName: 'La Segunda' })

    return {
      $executeRaw: async () => 0,
      $queryRaw: async (strings: TemplateStringsArray, joined: Prisma.Sql) => {
        if (!/FOR NO KEY UPDATE/.test(strings.join(''))) throw new Error('Se esperaba un SELECT ... FOR NO KEY UPDATE')
        const ids = joined.values as string[]
        await acquire(ids, releases)
        return ids.filter((id) => committed.has(id)).map((id) => ({ id }))
      },
      policy: {
        findUnique: async ({ where }: { where: { id: string } }) => readPolicy(where.id),
        update: async ({ where, data }: { where: { id: string }; data: Partial<PolicyRow> }) => {
          await hooks.beforePolicyUpdate?.(where.id)
          pending.policyUpdates.set(where.id, { ...pending.policyUpdates.get(where.id), ...data })
          return { ...readPolicy(where.id), insuredName: 'La Segunda', producerId: null, producer: null, description: null, isActive: true, coverages: [] }
        },
      },
      policyRenewal: {
        findFirst: async ({ where }: { where: { previousPolicyId: string } }) => {
          const link = activeLinks().find((l) => l.previousPolicyId === where.previousPolicyId)
          return link ? { id: link.id, renewalPolicyId: link.renewalPolicyId, renewalPolicy: { policyNumber: readPolicy(link.renewalPolicyId)!.policyNumber } } : null
        },
        findMany: async ({ where }: { where: { OR: [{ previousPolicyId: string }, { renewalPolicyId: string }] } }) => {
          const policyId = where.OR[0].previousPolicyId
          return activeLinks()
            .filter((l) => l.previousPolicyId === policyId || l.renewalPolicyId === policyId)
            .map((l) => ({
              previousPolicyId: l.previousPolicyId,
              renewalPolicyId: l.renewalPolicyId,
              previousPolicy: readPolicy(l.previousPolicyId),
              renewalPolicy: readPolicy(l.renewalPolicyId),
            }))
        },
        create: async ({ data }: { data: Omit<LinkRow, 'id' | 'revokedAt' | 'createdAt'> }) => {
          await hooks.beforeInsertLink?.()
          const row = { id: `link-${committedLinks.length + pending.newLinks.length + 1}`, revokedAt: null, createdAt: new Date(), ...data }
          pending.newLinks.push(row)
          return { ...row, revokedBy: null, revokeReason: null, previousPolicy: ref(row.previousPolicyId), renewalPolicy: ref(row.renewalPolicyId) }
        },
      },
    }
  }

  return {
    hooks,
    isWaitingFor: (id: string) => (waiters.get(id) ?? 0) > 0,
    committedPolicy: (id: string) => committed.get(id) ?? null,
    activeLinks: () => committedLinks.filter((l) => l.revokedAt === null),
    // Confirma (aplica escrituras) y recién después libera los locks — igual
    // que Postgres al hacer COMMIT. Si la transacción falla, solo libera.
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const pending: Pending = { policyUpdates: new Map(), newLinks: [] }
      const releases: (() => void)[] = []
      try {
        const result = await fn(txClient(pending, releases))
        for (const [id, patch] of pending.policyUpdates) Object.assign(committed.get(id)!, patch)
        committedLinks.push(...pending.newLinks)
        return result
      } finally {
        releases.forEach((release) => release())
      }
    },
  }
}

type FakeDb = ReturnType<typeof createFakeDb>
let fake: FakeDb

// Invariante que la carrera rompería: toda renovación activa vence después
// que la póliza que renueva.
function chronologyHolds(f: FakeDb): boolean {
  return f.activeLinks().every(
    (l) => f.committedPolicy(l.renewalPolicyId)!.endDate.getTime() > f.committedPolicy(l.previousPolicyId)!.endDate.getTime(),
  )
}

function setup(links: LinkRow[] = []) {
  fake = createFakeDb(
    [
      { id: PREV_ID, policyNumber: '001245', startDate: day('2025-12-01'), endDate: day('2026-11-30'), deactivatedAt: null },
      { id: NEW_ID, policyNumber: '001892', startDate: day('2026-12-01'), endDate: day('2027-11-30'), deactivatedAt: null },
    ],
    links,
  )
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.policy.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve(fake.committedPolicy(where.id)))
  db.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fake.transaction(fn))
}

// supertest es perezoso — .then() dispara el request sin esperarlo.
const start = (req: request.Test) => {
  const running = req.then((res) => res)
  inFlight.push(running)
  return running
}
const markRenewed = () =>
  start(request(app).post(`/api/v1/policies/${PREV_ID}/renewal`).set('Authorization', `Bearer ${adminToken()}`).send({ renewalPolicyId: NEW_ID }))
const changeEndDate = (id: string, endDate: string) =>
  start(request(app).put(`/api/v1/policies/${id}`).set('Authorization', `Bearer ${adminToken()}`).send({ endDate }))

describe('Policy renewals — concurrency with end date edits (simulated row locks)', () => {
  it('renewal first: an end date edit that waited for the lock re-reads the new link and aborts', async () => {
    setup()
    const insert = gate()
    fake.hooks.beforeInsertLink = insert.wait

    const renewing = markRenewed() // bloquea PREV y NEW, se frena antes de insertar
    await waitUntil(() => insert.reached)
    const editing = changeEndDate(NEW_ID, '2026-06-30') // todavía no ve el vínculo; espera el lock de NEW
    await waitUntil(() => fake.isWaitingFor(NEW_ID))
    insert.open()

    const [renewal, edit] = await Promise.all([renewing, editing])
    expect(renewal.status).toBe(201)
    expect(edit.status).toBe(409)
    expect(edit.body.error.code).toBe('CONCURRENT_UPDATE')
    expect(fake.committedPolicy(NEW_ID)!.endDate).toEqual(day('2027-11-30'))
    expect(chronologyHolds(fake)).toBe(true)
  })

  it('edit first: a renewal that waited for the lock validates against the new end date and is rejected', async () => {
    setup()
    const write = gate()
    fake.hooks.beforePolicyUpdate = () => write.wait()

    const editing = changeEndDate(NEW_ID, '2026-06-30') // bloquea NEW, valida (sin vínculos), se frena antes de escribir
    await waitUntil(() => write.reached)
    const renewing = markRenewed() // bloquea PREV, espera el lock de NEW
    await waitUntil(() => fake.isWaitingFor(NEW_ID))
    write.open()

    const [edit, renewal] = await Promise.all([editing, renewing])
    expect(edit.status).toBe(200)
    expect(renewal.status).toBe(409)
    expect(renewal.body.error.code).toBe('RENEWAL_MUST_END_LATER')
    expect(fake.activeLinks()).toHaveLength(0)
    expect(chronologyHolds(fake)).toBe(true)
  })

  it('two edits on both ends of an active link cannot each pass against the other\'s old date (write skew)', async () => {
    setup([{
      id: 'link-1', previousPolicyId: PREV_ID, renewalPolicyId: NEW_ID, revokedAt: null,
      notes: null, createdBy: 'test@losodwyer.com', createdAt: new Date(),
    }])
    const write = gate()
    fake.hooks.beforePolicyUpdate = (id) => (id === PREV_ID ? write.wait() : undefined)

    // Cada cambio, por separado, respeta el orden (PREV < NEW); juntos no.
    const editingPrevious = changeEndDate(PREV_ID, '2027-06-30') // bloquea PREV y NEW, se frena antes de escribir
    await waitUntil(() => write.reached)
    const editingRenewal = changeEndDate(NEW_ID, '2027-03-31') // espera el lock (PREV primero, por orden)
    await waitUntil(() => fake.isWaitingFor(PREV_ID))
    write.open()

    const [previous, renewal] = await Promise.all([editingPrevious, editingRenewal])
    expect(previous.status).toBe(200)
    expect(renewal.status).toBe(409)
    expect(renewal.body.error.code).toBe('RENEWAL_DATE_CONFLICT')
    expect(fake.committedPolicy(PREV_ID)!.endDate).toEqual(day('2027-06-30'))
    expect(fake.committedPolicy(NEW_ID)!.endDate).toEqual(day('2027-11-30'))
    expect(chronologyHolds(fake)).toBe(true)
  })
})
