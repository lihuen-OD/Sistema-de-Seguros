import fs from 'fs'
import path from 'path'
import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    // Sin delete/deleteMany a propósito: ningún flujo de renovación borra
    // filas — si alguno lo intentara, el test fallaría por método inexistente.
    policyRenewal: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    documentPolicyAllocation: { deleteMany: jest.fn() },
    producerTask: { updateMany: jest.fn() },
    producer: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    // Bloqueo de filas (policy-renewals.service.ts#lockPolicies).
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  },
}))

jest.mock('../../../config/cloudinary', () => ({
  isCloudinaryConfigured: jest.fn(() => false),
  uploadToCloudinary: jest.fn(),
  deleteFromCloudinary: jest.fn(),
}))

import { prisma } from '../../../config/database'
import { deleteFromCloudinary } from '../../../config/cloudinary'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

const PREV_ID = '31000000-0000-0000-0000-000000000001'
const NEW_ID = '31000000-0000-0000-0000-000000000002'
const OTHER_ID = '31000000-0000-0000-0000-000000000003'
const MISSING_ID = '31000000-0000-0000-0000-000000000099'
const LINK_ID = '32000000-0000-0000-0000-000000000001'
const TYPE_AUTO = '50000000-0000-0000-0000-000000000001'
const TYPE_AP = '50000000-0000-0000-0000-000000000002'
const COV_RC = '51000000-0000-0000-0000-000000000001'
const COV_TR = '51000000-0000-0000-0000-000000000002'
const USER_EMAIL = 'test@losodwyer.com'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

const truckA = { id: '40000000-0000-0000-0000-00000000000a', name: 'Camión A', code: 'ACT-A' }
const truckB = { id: '40000000-0000-0000-0000-00000000000b', name: 'Camión B', code: 'ACT-B' }
const truckC = { id: '40000000-0000-0000-0000-00000000000c', name: 'Camión C', code: 'ACT-C' }

type LineOptions = {
  asset?: typeof truckA | null
  typeId?: string
  coverageIds?: string[]
  insuredAmount?: number
  currency?: string
}

function line(id: string, { asset = null, typeId = TYPE_AUTO, coverageIds = [COV_RC], insuredAmount = 10000, currency = 'USD' }: LineOptions = {}) {
  return {
    id,
    coverageIds,
    insuredAmount,
    currency,
    asset,
    insuranceType: {
      id: typeId,
      name: typeId === TYPE_AUTO ? 'Automotor' : 'Accidentes Personales',
      coverages: [{ id: COV_RC, name: 'Responsabilidad civil' }, { id: COV_TR, name: 'Todo riesgo' }],
    },
  }
}

// Póliza tal como la devuelven los selects del servicio de renovaciones
// (núcleo + datos de comparación) — los campos de más no molestan a los
// selects más chicos.
function policy(overrides: Record<string, unknown> = {}) {
  return {
    id: PREV_ID,
    policyNumber: '001245',
    insuredName: 'La Segunda',
    producer: null,
    startDate: day('2025-12-01'),
    endDate: day('2026-11-30'),
    deactivatedAt: null as Date | null,
    coverages: [] as ReturnType<typeof line>[],
    ...overrides,
  }
}

const previousPolicy = policy()
const renewalPolicy = policy({
  id: NEW_ID,
  policyNumber: '001892',
  startDate: day('2026-12-01'),
  endDate: day('2027-11-30'),
})

function mockPolicies(...policies: ReturnType<typeof policy>[]) {
  db.policy.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
    Promise.resolve(policies.find((p) => p.id === where.id) ?? null),
  )
}

// Vínculos ACTIVOS existentes, indexados por póliza anterior — es lo único
// que consultan findFirst (renovación activa, recorrido de la cadena, revertir).
function mockActiveLinks(links: { previousPolicyId: string; renewalPolicyId: string; renewalNumber: string }[]) {
  db.policyRenewal.findFirst.mockImplementation(({ where }: { where: { previousPolicyId: string; revokedAt: null } }) => {
    expect(where.revokedAt).toBeNull()
    const link = links.find((l) => l.previousPolicyId === where.previousPolicyId)
    return Promise.resolve(
      link ? { id: LINK_ID, renewalPolicyId: link.renewalPolicyId, renewalPolicy: { policyNumber: link.renewalNumber } } : null,
    )
  })
}

function renewalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    notes: null,
    createdBy: USER_EMAIL,
    createdAt: new Date('2026-10-28T12:00:00.000Z'),
    revokedAt: null,
    revokedBy: null,
    revokeReason: null,
    previousPolicy: { id: PREV_ID, policyNumber: '001245', insuredName: 'La Segunda', startDate: day('2025-12-01'), endDate: day('2026-11-30') },
    renewalPolicy: { id: NEW_ID, policyNumber: '001892', insuredName: 'La Segunda', startDate: day('2026-12-01'), endDate: day('2027-11-30') },
    ...overrides,
  }
}

function prismaError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError('Constraint failed', { code, clientVersion: '5.22.0', meta })
}

// Ids pedidos en el SELECT ... FOR NO KEY UPDATE (llamada N a $queryRaw).
function lockedIds(call = 0): string[] {
  const [strings, joined] = db.$queryRaw.mock.calls[call]
  expect(strings.join('?')).toMatch(/ORDER BY "id"\s+FOR NO KEY UPDATE/)
  return joined.values
}

const callOrder = (fn: jest.Mock, call = 0) => fn.mock.invocationCallOrder[call]

function expectNoPolicyWrites() {
  expect(db.policy.update).not.toHaveBeenCalled()
  expect(db.policy.delete).not.toHaveBeenCalled()
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[]),
  )
  db.policyRenewal.findFirst.mockResolvedValue(null)
  db.policyRenewal.findMany.mockResolvedValue([])
  db.$executeRaw.mockResolvedValue(0)
  // Devuelve como bloqueadas todas las filas pedidas.
  db.$queryRaw.mockImplementation((_strings: TemplateStringsArray, joined: Prisma.Sql) =>
    Promise.resolve(joined.values.map((id) => ({ id }))),
  )
  mockPolicies(previousPolicy, renewalPolicy)
})

describe('Policy renewals API', () => {
  // ── Permisos ──────────────────────────────────────────────────────────────

  describe('permissions', () => {
    beforeEach(() => {
      db.policyRenewal.create.mockResolvedValue(renewalRow())
    })

    it('returns 401 without a token', async () => {
      const res = await request(app).post(`/api/v1/policies/${PREV_ID}/renewal`).send({ renewalPolicyId: NEW_ID })
      expect(res.status).toBe(401)
    })

    it.each([
      ['only policies', ['policies']],
      ['only policy_renewals', ['policy_renewals']],
    ] as const)('returns 403 for a USER with %s', async (_label, modules) => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: [...modules] }))

      const res = await request(app)
        .post(`/api/v1/policies/${PREV_ID}/renewal`)
        .set(auth(userToken()))
        .send({ renewalPolicyId: NEW_ID })

      expect(res.status).toBe(403)
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it('allows a USER with policies + policy_renewals and records who did it', async () => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: ['policies', 'policy_renewals'] }))

      const res = await request(app)
        .post(`/api/v1/policies/${PREV_ID}/renewal`)
        .set(auth(userToken()))
        .send({ renewalPolicyId: NEW_ID })

      expect(res.status).toBe(201)
      expect(db.policyRenewal.create.mock.calls[0][0].data.createdBy).toBe(USER_EMAIL)
    })

    it('allows an ADMIN without any module', async () => {
      const res = await request(app)
        .post(`/api/v1/policies/${PREV_ID}/renewal`)
        .set(auth(adminToken()))
        .send({ renewalPolicyId: NEW_ID })

      expect(res.status).toBe(201)
    })

    it.each([
      ['GET', `/api/v1/policies/${PREV_ID}/renewal-preview?renewalPolicyId=${NEW_ID}`],
      ['POST', `/api/v1/policies/${PREV_ID}/renewal/revoke`],
    ] as const)('%s %s returns 403 for a USER with only policies', async (method, url) => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: ['policies'] }))

      const req = method === 'GET' ? request(app).get(url) : request(app).post(url).send({ reason: 'Error' })
      const res = await req.set(auth(userToken()))

      expect(res.status).toBe(403)
    })

    it('lets a USER with only policies read the renewal history', async () => {
      db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules: ['policies'] }))

      const res = await request(app).get(`/api/v1/policies/${PREV_ID}/renewals`).set(auth(userToken()))

      expect(res.status).toBe(200)
    })
  })

  // ── POST /:id/renewal ─────────────────────────────────────────────────────

  describe('POST /api/v1/policies/:id/renewal', () => {
    const post = (id: string, body: Record<string, unknown>) =>
      request(app).post(`/api/v1/policies/${id}/renewal`).set(auth(adminToken())).send(body)

    beforeEach(() => {
      db.policyRenewal.create.mockResolvedValue(renewalRow())
    })

    it('records the link inside a transaction without touching either policy', async () => {
      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID, notes: '  Renovación anual  ' })

      expect(res.status).toBe(201)
      expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function))
      expect(db.policyRenewal.create.mock.calls[0][0].data).toEqual({
        previousPolicyId: PREV_ID,
        renewalPolicyId: NEW_ID,
        notes: 'Renovación anual',
        createdBy: USER_EMAIL,
      })
      expect(res.body.data).toMatchObject({
        status: 'ACTIVE',
        previousPolicy: { id: PREV_ID, endDate: '2026-11-30' },
        renewalPolicy: { id: NEW_ID, endDate: '2027-11-30' },
      })
      expectNoPolicyWrites()
    })

    it('stores empty notes as null', async () => {
      await post(PREV_ID, { renewalPolicyId: NEW_ID, notes: '   ' })
      expect(db.policyRenewal.create.mock.calls[0][0].data.notes).toBeNull()
    })

    it('returns 422 for an invalid renewalPolicyId', async () => {
      const res = await post(PREV_ID, { renewalPolicyId: 'not-a-uuid' })
      expect(res.status).toBe(422)
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it('returns 400 SELF_RENEWAL without querying the database', async () => {
      const res = await post(PREV_ID, { renewalPolicyId: PREV_ID })

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('SELF_RENEWAL')
      expect(db.policy.findUnique).not.toHaveBeenCalled()
    })

    it.each([
      ['the previous policy', MISSING_ID, NEW_ID],
      ['the renewal policy', PREV_ID, MISSING_ID],
    ])('returns 404 when %s does not exist', async (_label, previousId, renewalId) => {
      const res = await post(previousId, { renewalPolicyId: renewalId })
      expect(res.status).toBe(404)
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it.each([
      ['PREVIOUS_POLICY_DE_BAJA', policy({ deactivatedAt: new Date() }), renewalPolicy],
      ['RENEWAL_POLICY_DE_BAJA', previousPolicy, { ...renewalPolicy, deactivatedAt: new Date() }],
    ])('returns 409 %s when a policy was manually dado de baja', async (code, previous, renewal) => {
      mockPolicies(previous, renewal)

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe(code)
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it('returns 409 ALREADY_RENEWED when the previous policy already has an active renewal', async () => {
      mockActiveLinks([{ previousPolicyId: PREV_ID, renewalPolicyId: OTHER_ID, renewalNumber: '000555' }])

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_RENEWED')
      expect(res.body.error.message).toContain('000555')
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it.each([
      ['ends the same day', day('2026-11-30')],
      ['ends before', day('2026-06-30')],
    ])('returns 409 RENEWAL_MUST_END_LATER when the renewal %s as the previous policy', async (_label, endDate) => {
      mockPolicies(previousPolicy, { ...renewalPolicy, endDate })

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('RENEWAL_MUST_END_LATER')
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it('does NOT block a renewal that starts before the previous one or overlaps it', async () => {
      mockPolicies(previousPolicy, { ...renewalPolicy, startDate: day('2025-06-01') })

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(201)
    })

    it.each([
      ['a direct link back', [{ previousPolicyId: NEW_ID, renewalPolicyId: PREV_ID, renewalNumber: '001245' }]],
      ['a longer chain', [
        { previousPolicyId: NEW_ID, renewalPolicyId: OTHER_ID, renewalNumber: '000777' },
        { previousPolicyId: OTHER_ID, renewalPolicyId: PREV_ID, renewalNumber: '001245' },
      ]],
    ])('returns 409 RENEWAL_CYCLE when inconsistent data would close a cycle (%s)', async (_label, links) => {
      mockActiveLinks(links)

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('RENEWAL_CYCLE')
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it('allows one renewal policy to renew several previous ones (consolidation)', async () => {
      // OTHER → NEW ya existe; PREV → NEW sigue siendo válido.
      mockActiveLinks([{ previousPolicyId: OTHER_ID, renewalPolicyId: NEW_ID, renewalNumber: '001892' }])

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(201)
    })

    it('maps a concurrent duplicate (P2002 on the partial unique index) to 409 ALREADY_RENEWED', async () => {
      db.policyRenewal.create.mockRejectedValue(prismaError('P2002'))

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('ALREADY_RENEWED')
    })

    it('maps a policy deleted mid-request (P2003) to 404', async () => {
      db.policyRenewal.create.mockRejectedValue(prismaError('P2003'))

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(404)
    })

    it('locks both policies (bounded wait) BEFORE reading their dates', async () => {
      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(201)
      expect(db.$executeRaw.mock.calls[0][0].join('')).toContain("SET LOCAL lock_timeout = '3s'")
      expect(lockedIds().sort()).toEqual([PREV_ID, NEW_ID].sort())
      expect(callOrder(db.$queryRaw)).toBeLessThan(callOrder(db.policy.findUnique))
      expect(callOrder(db.policy.findUnique)).toBeLessThan(callOrder(db.policyRenewal.create))
    })

    it('validates against the dates committed while it was waiting for the lock', async () => {
      // Una edición concurrente adelanta el vencimiento de la nueva y confirma
      // justo antes de que este alta obtenga el lock.
      db.$queryRaw.mockImplementationOnce((_strings: TemplateStringsArray, joined: Prisma.Sql) => {
        mockPolicies(previousPolicy, { ...renewalPolicy, endDate: day('2026-06-30') })
        return Promise.resolve(joined.values.map((id) => ({ id })))
      })

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('RENEWAL_MUST_END_LATER')
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    it.each([
      ['lock timeout', prismaError('P2010', { code: '55P03' })],
      ['deadlock', prismaError('P2010', { code: '40P01' })],
      ['write conflict', prismaError('P2034')],
    ])('maps a %s to 409 CONCURRENT_UPDATE without inserting', async (_label, error) => {
      db.$queryRaw.mockRejectedValueOnce(error)

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE')
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
    })

    // Forma real observada contra Postgres 16 + Prisma 5.22 (validación R1):
    // un lock_timeout en una query propia de Prisma (el INSERT esperando el
    // único parcial) no trae código, solo el SQLSTATE dentro del mensaje.
    const unknownPostgresError = (sqlState: string) =>
      new Prisma.PrismaClientUnknownRequestError(
        `ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${sqlState}", message: "canceling statement due to lock timeout", severity: "ERROR" }) })`,
        { clientVersion: '5.22.0' },
      )

    it('maps a lock timeout while the INSERT waits (unknown request error with SQLSTATE 55P03) to 409 CONCURRENT_UPDATE', async () => {
      db.policyRenewal.create.mockRejectedValue(unknownPostgresError('55P03'))

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE')
    })

    it('does not treat other unknown request errors (e.g. a CHECK violation, 23514) as concurrency conflicts', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      db.policyRenewal.create.mockRejectedValue(unknownPostgresError('23514'))

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(500)
      consoleError.mockRestore()
    })

    it('does not swallow unrelated raw query errors as concurrency conflicts', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      db.$queryRaw.mockRejectedValueOnce(prismaError('P2010', { code: '42P01' }))

      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(500)
      consoleError.mockRestore()
    })

    it('only considers non-revoked links, so a policy can be linked again after a revert', async () => {
      const res = await post(PREV_ID, { renewalPolicyId: NEW_ID })

      expect(res.status).toBe(201)
      for (const [args] of db.policyRenewal.findFirst.mock.calls) {
        expect(args.where.revokedAt).toBeNull()
      }
    })
  })

  // ── GET /:id/renewal-preview ──────────────────────────────────────────────

  describe('GET /api/v1/policies/:id/renewal-preview', () => {
    const preview = (id: string, renewalId: string) =>
      request(app).get(`/api/v1/policies/${id}/renewal-preview?renewalPolicyId=${renewalId}`).set(auth(adminToken()))

    const codes = (warnings: { code: string }[]) => warnings.map((w) => w.code)

    it('uses the Argentina calendar day for expiration and start warnings without changing date intervals', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] })
      jest.setSystemTime(new Date('2026-12-01T02:30:00Z'))
      mockPolicies(
        policy({ startDate: day('2026-11-01'), endDate: day('2026-11-30') }),
        { ...renewalPolicy, startDate: day('2026-12-01'), endDate: day('2027-11-30') },
      )

      try {
        const lateNight = await preview(PREV_ID, NEW_ID)
        const lateNightCodes = codes(lateNight.body.data.warnings)
        expect(lateNight.status).toBe(200)
        expect(lateNightCodes).not.toContain('PREVIOUS_POLICY_EXPIRED')
        expect(lateNightCodes).toContain('RENEWAL_NOT_STARTED')
        expect(lateNightCodes).not.toContain('RENEWAL_POLICY_EXPIRED')
        expect(lateNight.body.data.comparison).toMatchObject({ overlapDays: 0, gapDays: 0 })

        mockPolicies(
          policy({ startDate: day('2026-11-01'), endDate: day('2026-11-15') }),
          { ...renewalPolicy, startDate: day('2026-11-16'), endDate: day('2026-11-30') },
        )
        const newPolicyExpiresToday = await preview(PREV_ID, NEW_ID)
        expect(codes(newPolicyExpiresToday.body.data.warnings)).not.toContain('RENEWAL_POLICY_EXPIRED')
        expect(newPolicyExpiresToday.body.data.comparison).toMatchObject({ overlapDays: 0, gapDays: 0 })

        jest.setSystemTime(new Date('2026-12-01T03:00:00Z'))
        mockPolicies(
          policy({ startDate: day('2026-11-01'), endDate: day('2026-11-30') }),
          { ...renewalPolicy, startDate: day('2026-12-01'), endDate: day('2027-11-30') },
        )
        const afterMidnight = await preview(PREV_ID, NEW_ID)
        const afterMidnightCodes = codes(afterMidnight.body.data.warnings)
        expect(afterMidnightCodes).toContain('PREVIOUS_POLICY_EXPIRED')
        expect(afterMidnightCodes).not.toContain('RENEWAL_NOT_STARTED')
        expect(afterMidnightCodes).not.toContain('RENEWAL_POLICY_EXPIRED')
        expect(afterMidnight.body.data.comparison).toMatchObject({ overlapDays: 0, gapDays: 0 })

        mockPolicies(
          policy({ startDate: day('2026-11-01'), endDate: day('2026-11-15') }),
          { ...renewalPolicy, startDate: day('2026-11-16'), endDate: day('2026-11-30') },
        )
        const expiredNewPolicy = await preview(PREV_ID, NEW_ID)
        expect(codes(expiredNewPolicy.body.data.warnings)).toContain('RENEWAL_POLICY_EXPIRED')
        expect(expiredNewPolicy.body.data.comparison).toMatchObject({ overlapDays: 0, gapDays: 0 })
      } finally {
        jest.useRealTimers()
      }
    })

    it('is strictly read-only', async () => {
      const res = await preview(PREV_ID, NEW_ID)

      expect(res.status).toBe(200)
      expect(db.policyRenewal.create).not.toHaveBeenCalled()
      expect(db.policyRenewal.updateMany).not.toHaveBeenCalled()
      expect(db.$transaction).not.toHaveBeenCalled()
      expectNoPolicyWrites()
    })

    it('compares a partial renewal asset by asset and only warns, never blocks', async () => {
      mockPolicies(
        policy({
          coverages: [
            line('l-a', { asset: truckA, coverageIds: [COV_RC], insuredAmount: 10000 }),
            line('l-b', { asset: truckB }),
            line('l-ap', { typeId: TYPE_AP }),
          ],
        }),
        {
          ...renewalPolicy,
          insuredName: 'Sancor Seguros',
          coverages: [
            line('n-a', { asset: truckA, coverageIds: [COV_RC, COV_TR], insuredAmount: 12000 }),
            line('n-c', { asset: truckC }),
          ],
        },
      )

      const res = await preview(PREV_ID, NEW_ID)

      expect(res.status).toBe(200)
      const data = res.body.data
      expect(data.canRenew).toBe(true)
      expect(data.blockers).toEqual([])
      expect(codes(data.warnings)).toEqual(expect.arrayContaining([
        'INSURER_CHANGED', 'ASSETS_NOT_CONTINUING', 'ASSETS_ADDED', 'COVERAGE_CHANGED',
        'INSURED_AMOUNT_CHANGED', 'LINES_WITHOUT_ASSET',
      ]))
      expect(data.comparison.continuingAssets).toHaveLength(1)
      expect(data.comparison.continuingAssets[0]).toMatchObject({
        asset: { id: truckA.id },
        differences: ['coverages', 'insuredAmount'],
        previous: { insuredAmount: 10000, coverages: [{ id: COV_RC }] },
        renewal: { insuredAmount: 12000, coverages: [{ id: COV_RC }, { id: COV_TR }] },
      })
      expect(data.comparison.removedAssets.map((r: { asset: { id: string } }) => r.asset.id)).toEqual([truckB.id])
      expect(data.comparison.addedAssets.map((r: { asset: { id: string } }) => r.asset.id)).toEqual([truckC.id])
      expect(data.comparison.previousLinesWithoutAsset).toHaveLength(1)
    })

    it('warns NO_COMMON_ASSETS when no vehicle continues, but still allows the renewal', async () => {
      mockPolicies(
        policy({ coverages: [line('l-a', { asset: truckA })] }),
        { ...renewalPolicy, coverages: [line('n-c', { asset: truckC })] },
      )

      const res = await preview(PREV_ID, NEW_ID)

      expect(res.body.data.canRenew).toBe(true)
      expect(codes(res.body.data.warnings)).toContain('NO_COMMON_ASSETS')
    })

    it('reports a currency change without comparing amounts, and an insurance type change without comparing coverages', async () => {
      mockPolicies(
        policy({ coverages: [line('l-a', { asset: truckA, currency: 'USD' }), line('l-b', { asset: truckB })] }),
        {
          ...renewalPolicy,
          coverages: [
            line('n-a', { asset: truckA, currency: 'ARS', insuredAmount: 15000000 }),
            line('n-b', { asset: truckB, typeId: TYPE_AP, coverageIds: [] }),
          ],
        },
      )

      const res = await preview(PREV_ID, NEW_ID)

      const [a, b] = res.body.data.comparison.continuingAssets
      expect(a.differences).toEqual(['currency'])
      expect(b.differences).toEqual(['insuranceType'])
      expect(codes(res.body.data.warnings)).toEqual(expect.arrayContaining(['CURRENCY_CHANGED', 'COVERAGE_CHANGED']))
    })

    it.each([
      ['contiguous dates', day('2026-12-01'), 0, 0, []],
      ['an overlap', day('2026-11-15'), 16, 0, ['DATES_OVERLAP']],
      ['a gap', day('2026-12-10'), 0, 9, ['COVERAGE_GAP']],
      ['a start before the previous start', day('2025-06-01'), 365, 0, ['DATES_OVERLAP', 'RENEWAL_STARTS_BEFORE_PREVIOUS']],
    ])('handles %s as information only', async (_label, startDate, overlapDays, gapDays, expected) => {
      mockPolicies(previousPolicy, { ...renewalPolicy, startDate })

      const res = await preview(PREV_ID, NEW_ID)

      expect(res.body.data.canRenew).toBe(true)
      expect(res.body.data.comparison).toMatchObject({ overlapDays, gapDays })
      const dateWarnings = codes(res.body.data.warnings).filter((c) =>
        ['DATES_OVERLAP', 'COVERAGE_GAP', 'RENEWAL_STARTS_BEFORE_PREVIOUS'].includes(c),
      )
      expect(dateWarnings.sort()).toEqual([...expected].sort())
    })

    it('warns when the previous policy is already expired and the renewal has not started yet', async () => {
      mockPolicies(
        policy({ startDate: day('1999-01-01'), endDate: day('2000-01-01') }),
        { ...renewalPolicy, startDate: day('2090-01-01'), endDate: day('2091-01-01') },
      )

      const res = await preview(PREV_ID, NEW_ID)

      expect(res.body.data.canRenew).toBe(true)
      expect(codes(res.body.data.warnings)).toEqual(expect.arrayContaining(['PREVIOUS_POLICY_EXPIRED', 'RENEWAL_NOT_STARTED']))
    })

    it('warns when the renewal policy itself is already expired', async () => {
      mockPolicies(
        policy({ startDate: day('1999-01-01'), endDate: day('2000-01-01') }),
        { ...renewalPolicy, startDate: day('2000-01-02'), endDate: day('2001-01-01') },
      )

      const res = await preview(PREV_ID, NEW_ID)

      expect(codes(res.body.data.warnings)).toContain('RENEWAL_POLICY_EXPIRED')
    })

    it('warns when the renewal policy already renews other policies (consolidation)', async () => {
      db.policyRenewal.findMany.mockResolvedValue([{ previousPolicy: { policyNumber: '000777' } }])

      const res = await preview(PREV_ID, NEW_ID)

      const warning = res.body.data.warnings.find((w: { code: string }) => w.code === 'RENEWAL_ALREADY_LINKED')
      expect(warning.message).toContain('000777')
      expect(db.policyRenewal.findMany.mock.calls[0][0].where).toEqual({ renewalPolicyId: NEW_ID, revokedAt: null })
    })

    it('returns structural blockers with 200 so the UI can show them', async () => {
      mockPolicies(previousPolicy, { ...renewalPolicy, endDate: day('2026-11-30') })
      mockActiveLinks([{ previousPolicyId: PREV_ID, renewalPolicyId: OTHER_ID, renewalNumber: '000555' }])

      const res = await preview(PREV_ID, NEW_ID)

      expect(res.status).toBe(200)
      expect(res.body.data.canRenew).toBe(false)
      expect(codes(res.body.data.blockers)).toEqual(['ALREADY_RENEWED', 'RENEWAL_MUST_END_LATER'])
    })

    it('returns 400 for a self link, 404 for a missing policy and 422 without renewalPolicyId', async () => {
      expect((await preview(PREV_ID, PREV_ID)).status).toBe(400)
      expect((await preview(PREV_ID, MISSING_ID)).status).toBe(404)
      const res = await request(app).get(`/api/v1/policies/${PREV_ID}/renewal-preview`).set(auth(adminToken()))
      expect(res.status).toBe(422)
    })
  })

  // ── POST /:id/renewal/revoke ──────────────────────────────────────────────

  describe('POST /api/v1/policies/:id/renewal/revoke', () => {
    const revoke = (id: string, body: Record<string, unknown>) =>
      request(app).post(`/api/v1/policies/${id}/renewal/revoke`).set(auth(adminToken())).send(body)

    beforeEach(() => {
      mockActiveLinks([{ previousPolicyId: PREV_ID, renewalPolicyId: NEW_ID, renewalNumber: '001892' }])
      db.policyRenewal.updateMany.mockResolvedValue({ count: 1 })
      db.policyRenewal.findUniqueOrThrow.mockResolvedValue(
        renewalRow({ revokedAt: new Date(), revokedBy: USER_EMAIL, revokeReason: 'Vinculada por error' }),
      )
    })

    it('marks the active link as revoked (keeping the row) and records who and why', async () => {
      const res = await revoke(PREV_ID, { reason: '  Vinculada por error ' })

      expect(res.status).toBe(200)
      expect(db.policyRenewal.updateMany).toHaveBeenCalledWith({
        where: { id: LINK_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedBy: USER_EMAIL, revokeReason: 'Vinculada por error' },
      })
      expect(res.body.data).toMatchObject({ status: 'REVOKED', revokedBy: USER_EMAIL, revokeReason: 'Vinculada por error' })
      expectNoPolicyWrites()
    })

    it.each([{}, { reason: '   ' }])('returns 422 without a reason (%j)', async (body) => {
      const res = await revoke(PREV_ID, body)
      expect(res.status).toBe(422)
      expect(db.policyRenewal.updateMany).not.toHaveBeenCalled()
    })

    it('returns 409 NO_ACTIVE_RENEWAL when there is nothing to revert', async () => {
      mockActiveLinks([])

      const res = await revoke(PREV_ID, { reason: 'Error' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('NO_ACTIVE_RENEWAL')
    })

    it('returns 409 without overwriting when another user revoked it first', async () => {
      db.policyRenewal.updateMany.mockResolvedValue({ count: 0 })

      const res = await revoke(PREV_ID, { reason: 'Error' })

      expect(res.status).toBe(409)
      expect(db.policyRenewal.findUniqueOrThrow).not.toHaveBeenCalled()
    })

    it('returns 404 when the policy does not exist', async () => {
      const res = await revoke(MISSING_ID, { reason: 'Error' })
      expect(res.status).toBe(404)
    })
  })

  // ── GET /:id/renewals ─────────────────────────────────────────────────────

  describe('GET /api/v1/policies/:id/renewals', () => {
    it('returns the full history (as previous and as renewal, including revoked links)', async () => {
      db.policyRenewal.findMany.mockResolvedValue([
        renewalRow(),
        renewalRow({ id: 'revoked-link', revokedAt: new Date(), revokedBy: USER_EMAIL, revokeReason: 'Error' }),
      ])

      const res = await request(app).get(`/api/v1/policies/${PREV_ID}/renewals`).set(auth(adminToken()))

      expect(res.status).toBe(200)
      expect(db.policyRenewal.findMany.mock.calls[0][0]).toMatchObject({
        where: { OR: [{ previousPolicyId: PREV_ID }, { renewalPolicyId: PREV_ID }] },
        orderBy: { createdAt: 'desc' },
      })
      expect(res.body.data.map((r: { status: string }) => r.status)).toEqual(['ACTIVE', 'REVOKED'])
      expect(res.body.data[0].previousPolicy.endDate).toBe('2026-11-30')
    })

    it('returns 404 when the policy does not exist', async () => {
      const res = await request(app).get(`/api/v1/policies/${MISSING_ID}/renewals`).set(auth(adminToken()))
      expect(res.status).toBe(404)
    })
  })

  // ── Protección del historial ──────────────────────────────────────────────

  describe('DELETE /api/v1/policies/:id with renewal history', () => {
    const deletablePolicy = (count: { renewalLinksAsPrevious: number; renewalLinksAsRenewal: number }) => ({
      id: PREV_ID,
      coverages: [{ id: 'cov-1', attachments: [{ cloudinaryPublicId: 'file-1' }] }],
      _count: count,
    })

    beforeEach(() => {
      ;(deleteFromCloudinary as jest.Mock).mockResolvedValue(undefined)
    })

    it.each([
      ['as the previous policy', { renewalLinksAsPrevious: 1, renewalLinksAsRenewal: 0 }],
      ['as the renewal policy', { renewalLinksAsPrevious: 0, renewalLinksAsRenewal: 1 }],
    ])('returns 409 and deletes nothing when the policy has history %s (active or revoked)', async (_label, count) => {
      db.policy.findUnique.mockResolvedValue(deletablePolicy(count))

      const res = await request(app).delete(`/api/v1/policies/${PREV_ID}`).set(auth(adminToken()))

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('POLICY_HAS_RENEWAL_HISTORY')
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(db.policy.delete).not.toHaveBeenCalled()
      expect(db.documentPolicyAllocation.deleteMany).not.toHaveBeenCalled()
      expect(deleteFromCloudinary).not.toHaveBeenCalled()
    })

    it('counts renewal links in the same query that loads the policy (no extra round trip)', async () => {
      db.policy.findUnique.mockResolvedValue(deletablePolicy({ renewalLinksAsPrevious: 0, renewalLinksAsRenewal: 0 }))
      db.documentPolicyAllocation.deleteMany.mockResolvedValue({ count: 0 })
      db.producerTask.updateMany.mockResolvedValue({ count: 0 })
      db.policy.delete.mockResolvedValue({ id: PREV_ID })

      const res = await request(app).delete(`/api/v1/policies/${PREV_ID}`).set(auth(adminToken()))

      expect(res.status).toBe(200)
      expect(db.policy.findUnique.mock.calls[0][0].select._count).toEqual({
        select: { renewalLinksAsPrevious: true, renewalLinksAsRenewal: true },
      })
    })

    it('deletes Cloudinary files only AFTER the database committed the delete', async () => {
      db.policy.findUnique.mockResolvedValue(deletablePolicy({ renewalLinksAsPrevious: 0, renewalLinksAsRenewal: 0 }))
      db.documentPolicyAllocation.deleteMany.mockResolvedValue({ count: 0 })
      db.producerTask.updateMany.mockResolvedValue({ count: 0 })
      db.policy.delete.mockResolvedValue({ id: PREV_ID })

      const res = await request(app).delete(`/api/v1/policies/${PREV_ID}`).set(auth(adminToken()))

      expect(res.status).toBe(200)
      expect(deleteFromCloudinary).toHaveBeenCalledWith('file-1')
      expect(callOrder(db.policy.delete)).toBeLessThan(callOrder(deleteFromCloudinary as jest.Mock))
    })

    it('still answers 200 when Cloudinary fails after the commit (best-effort, orphan file only)', async () => {
      db.policy.findUnique.mockResolvedValue(deletablePolicy({ renewalLinksAsPrevious: 0, renewalLinksAsRenewal: 0 }))
      db.documentPolicyAllocation.deleteMany.mockResolvedValue({ count: 0 })
      db.producerTask.updateMany.mockResolvedValue({ count: 0 })
      db.policy.delete.mockResolvedValue({ id: PREV_ID })
      ;(deleteFromCloudinary as jest.Mock).mockRejectedValue(new Error('Cloudinary down'))

      const res = await request(app).delete(`/api/v1/policies/${PREV_ID}`).set(auth(adminToken()))

      expect(res.status).toBe(200)
    })

    it.each([
      ['a FK RESTRICT hit (link created in between) → 409', prismaError('P2003'), 409],
      ['any other database failure → 500', new Error('connection lost'), 500],
    ])('keeps every Cloudinary file when the database rejects the delete: %s', async (_label, error, status) => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
      db.policy.findUnique.mockResolvedValue(deletablePolicy({ renewalLinksAsPrevious: 0, renewalLinksAsRenewal: 0 }))
      db.documentPolicyAllocation.deleteMany.mockResolvedValue({ count: 0 })
      db.producerTask.updateMany.mockResolvedValue({ count: 0 })
      db.policy.delete.mockRejectedValue(error)

      const res = await request(app).delete(`/api/v1/policies/${PREV_ID}`).set(auth(adminToken()))

      expect(res.status).toBe(status)
      expect(deleteFromCloudinary).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })

  describe('PUT /api/v1/policies/:id end date vs. active renewal links', () => {
    const put = (id: string, body: Record<string, unknown>) =>
      request(app).put(`/api/v1/policies/${id}`).set(auth(adminToken())).send(body)

    const updatedPolicy = (id: string, endDate: Date) => ({
      ...policy({ id, endDate }),
      producerId: null,
      description: null,
      isActive: true,
      coverages: [],
    })

    // PREV (vence 2026-11-30) → NEW (vence 2027-11-30), vínculo activo.
    const activeLink = {
      previousPolicyId: PREV_ID,
      renewalPolicyId: NEW_ID,
      previousPolicy: { policyNumber: '001245', endDate: day('2026-11-30') },
      renewalPolicy: { policyNumber: '001892', endDate: day('2027-11-30') },
    }

    it.each([
      ['the previous policy past its renewal', PREV_ID, '2027-11-30'],
      ['the renewal policy before the policy it renews', NEW_ID, '2026-11-30'],
    ])('returns 409 RENEWAL_DATE_CONFLICT when moving the end date of %s', async (_label, id, endDate) => {
      db.policyRenewal.findMany.mockResolvedValue([activeLink])

      const res = await put(id, { endDate })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('RENEWAL_DATE_CONFLICT')
      expect(db.policy.update).not.toHaveBeenCalled()
    })

    it('allows an end date change that keeps the chronological order', async () => {
      db.policyRenewal.findMany.mockResolvedValue([activeLink])
      db.policy.update.mockResolvedValue(updatedPolicy(PREV_ID, day('2026-12-15')))

      const res = await put(PREV_ID, { endDate: '2026-12-15' })

      expect(res.status).toBe(200)
    })

    it('only looks at active (non-revoked) links', async () => {
      db.policy.update.mockResolvedValue(updatedPolicy(PREV_ID, day('2030-01-01')))

      const res = await put(PREV_ID, { endDate: '2030-01-01' })

      expect(res.status).toBe(200)
      expect(db.policyRenewal.findMany.mock.calls[0][0].where).toEqual({
        revokedAt: null,
        OR: [{ previousPolicyId: PREV_ID }, { renewalPolicyId: PREV_ID }],
      })
    })

    it('does not query links, open a transaction or lock anything when the end date is not being changed', async () => {
      db.policy.update.mockResolvedValue(updatedPolicy(PREV_ID, day('2026-11-30')))

      const res = await put(PREV_ID, { description: 'Sin cambio de fechas' })

      expect(res.status).toBe(200)
      expect(db.policyRenewal.findMany).not.toHaveBeenCalled()
      expect(db.$transaction).not.toHaveBeenCalled()
      expect(db.$queryRaw).not.toHaveBeenCalled()
    })

    it('on a policy without links locks only that policy and writes the same data as before', async () => {
      db.policy.update.mockResolvedValue(updatedPolicy(PREV_ID, day('2027-01-31')))

      const res = await put(PREV_ID, { endDate: '2027-01-31', description: 'Prórroga' })

      expect(res.status).toBe(200)
      expect(lockedIds()).toEqual([PREV_ID])
      expect(db.policy.update.mock.calls[0][0]).toMatchObject({
        where: { id: PREV_ID },
        data: { endDate: day('2027-01-31'), description: 'Prórroga' },
      })
    })

    it('locks the policy and its counterparts in one statement, then re-reads the links before validating and writing', async () => {
      db.policyRenewal.findMany.mockResolvedValue([activeLink])
      db.policy.update.mockResolvedValue(updatedPolicy(PREV_ID, day('2026-12-15')))

      await put(PREV_ID, { endDate: '2026-12-15' })

      expect(lockedIds().sort()).toEqual([PREV_ID, NEW_ID].sort())
      expect(db.$queryRaw).toHaveBeenCalledTimes(1)
      expect(callOrder(db.policyRenewal.findMany, 0)).toBeLessThan(callOrder(db.$queryRaw))
      expect(callOrder(db.$queryRaw)).toBeLessThan(callOrder(db.policyRenewal.findMany, 1))
      expect(callOrder(db.policyRenewal.findMany, 1)).toBeLessThan(callOrder(db.policy.update))
    })

    it('aborts with 409 CONCURRENT_UPDATE when a renewal was registered while it waited for the lock', async () => {
      // Antes del lock no había vínculos (solo se bloquea NEW); al releer ya
      // existe PREV → NEW, cuya contraparte PREV no quedó bloqueada.
      db.policyRenewal.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([activeLink])

      const res = await put(NEW_ID, { endDate: '2026-06-30' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE')
      expect(lockedIds()).toEqual([NEW_ID])
      expect(db.policy.update).not.toHaveBeenCalled()
    })

    it.each([
      ['lock timeout', prismaError('P2010', { code: '55P03' })],
      ['deadlock', prismaError('P2034')],
    ])('maps a %s while locking to 409 CONCURRENT_UPDATE without writing', async (_label, error) => {
      db.$queryRaw.mockRejectedValueOnce(error)

      const res = await put(PREV_ID, { endDate: '2027-01-31' })

      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('CONCURRENT_UPDATE')
      expect(db.policy.update).not.toHaveBeenCalled()
    })
  })

  // La migración es la última línea de defensa del historial — si alguien la
  // regenera, estos chequeos fallan antes de llegar a una base real.
  describe('migration add_policy_renewals', () => {
    const migrationsDir = path.resolve(__dirname, '../../../../prisma/migrations')
    const dir = fs.readdirSync(migrationsDir).find((name) => name.endsWith('_add_policy_renewals'))
    const sql = dir ? fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8') : ''
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')

    it('exists', () => {
      expect(dir).toBeDefined()
    })

    it('is purely additive: no UPDATE, DELETE, DROP, TRUNCATE or changes to other tables', () => {
      // Anclado al inicio de la sentencia: "ON UPDATE CASCADE" de las FKs es
      // una regla de la constraint, no una escritura de datos.
      expect(statements).not.toMatch(/^\s*(UPDATE|DELETE|DROP|TRUNCATE)\b/im)
      const alteredTables = [...statements.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1])
      expect(new Set(alteredTables)).toEqual(new Set(['policy_renewals']))
    })

    it('never cascades deletes into the renewal history', () => {
      expect(statements).not.toMatch(/ON DELETE CASCADE/i)
      expect(statements.match(/ON DELETE RESTRICT/g)).toHaveLength(2)
    })

    it('keeps the hand-written partial unique index and CHECK constraints', () => {
      expect(statements).toMatch(/CREATE UNIQUE INDEX "policy_renewals_one_active_per_previous"[\s\S]*WHERE "revokedAt" IS NULL/)
      expect(statements).toContain('"policy_renewals_not_self"')
      expect(statements).toContain('"policy_renewals_revocation_complete"')
    })
  })
})
