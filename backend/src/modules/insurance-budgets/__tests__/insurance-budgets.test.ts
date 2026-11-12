import fs from 'fs'
import path from 'path'
import request from 'supertest'
import { Prisma } from '@prisma/client'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    company: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    costCenter: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    fixedAsset: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    asset: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), delete: jest.fn() },
    policy: { findMany: jest.fn(), count: jest.fn() },
    accountingDocument: { findMany: jest.fn(), count: jest.fn() },
    producerTask: { updateMany: jest.fn() },
    assetRenewalProjectionOverride: { findMany: jest.fn(), upsert: jest.fn(), findUnique: jest.fn(), deleteMany: jest.fn() },
    insuranceBudget: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    insuranceBudgetMonth: { findMany: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn(), update: jest.fn() },
    insuranceBudgetAuditLog: { createMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
import { assetsService } from '../../assets/assets.service'
const db = prisma as any

const BUDGET_ID = '70000000-0000-0000-0000-000000000001'
const COMPANY_ID = '10000000-0000-0000-0000-000000000001'
const ASSET_ID = '90000000-0000-0000-0000-000000000010'
const EDITOR = ['insurance_budgets', 'insurance_budgets_edit'] as const

const dec = (v: number) => new Prisma.Decimal(v.toFixed(2))

function fakeBudget(overrides: Record<string, unknown> = {}) {
  return {
    id: BUDGET_ID,
    scopeType: 'COMPANY',
    companyId: COMPANY_ID,
    costCenterId: null,
    fixedAssetId: null,
    assetId: null,
    notes: null,
    version: 3,
    createdBy: 'a@test.com',
    updatedBy: 'a@test.com',
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    months: [],
    ...overrides,
  }
}

function asUser(modules: string[]) {
  db.user.findUnique.mockResolvedValueOnce(mockDbUser({ role: 'USER', modules: modules as any }))
  return `Bearer ${userToken()}`
}

const auditRows = () => db.insuranceBudgetAuditLog.createMany.mock.calls.flatMap((c: any[]) => c[0].data)

describe('Insurance Budgets API', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    db.user.findUnique.mockResolvedValue(mockDbUser())
    db.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[]),
    )
  })

  // ── Permisos ────────────────────────────────────────────────────────────────

  describe('permissions', () => {
    it('401 without token', async () => {
      const res = await request(app).get('/api/v1/insurance-budgets?scopeType=COMPANY&from=2026-01&to=2026-12')
      expect(res.status).toBe(401)
    })

    it('403 for a USER without insurance_budgets', async () => {
      const res = await request(app)
        .get('/api/v1/insurance-budgets?scopeType=COMPANY&from=2026-01&to=2026-12')
        .set('Authorization', asUser(['economic_analysis']))
      expect(res.status).toBe(403)
    })

    it('200 reading with only insurance_budgets', async () => {
      db.insuranceBudget.findMany.mockResolvedValue([])
      const res = await request(app)
        .get('/api/v1/insurance-budgets?scopeType=COMPANY&from=2026-01&to=2026-12')
        .set('Authorization', asUser(['insurance_budgets']))
      expect(res.status).toBe(200)
    })

    it('403 creating with only insurance_budgets (edit key missing)', async () => {
      const res = await request(app)
        .post('/api/v1/insurance-budgets')
        .set('Authorization', asUser(['insurance_budgets']))
        .send({ scopeType: 'COMPANY', scopeId: COMPANY_ID })
      expect(res.status).toBe(403)
      expect(db.insuranceBudget.create).not.toHaveBeenCalled()
    })

    it('403 editing with only insurance_budgets_edit (view key missing)', async () => {
      const res = await request(app)
        .put(`/api/v1/insurance-budgets/${BUDGET_ID}`)
        .set('Authorization', asUser(['insurance_budgets_edit']))
        .send({ expectedVersion: 3, months: [{ month: '2026-01', amountUsd: 10 }] })
      expect(res.status).toBe(403)
    })

    it('ADMIN passes both gates', async () => {
      db.company.findUnique.mockResolvedValue({ id: COMPANY_ID, isActive: true })
      db.insuranceBudget.findFirst.mockResolvedValue(null)
      db.insuranceBudget.create.mockResolvedValue(fakeBudget({ version: 1 }))
      db.insuranceBudget.findUniqueOrThrow.mockResolvedValue(fakeBudget({ version: 1 }))
      const res = await request(app)
        .post('/api/v1/insurance-budgets')
        .set('Authorization', `Bearer ${adminToken()}`)
        .send({ scopeType: 'COMPANY', scopeId: COMPANY_ID })
      expect(res.status).toBe(201)
    })

    // (d) La pantalla compone datos de otros módulos: solo sus GET aceptan la
    // clave de lectura; ninguna escritura ajena se habilita.
    it.each([
      ['/api/v1/documents/financial'],
      ['/api/v1/policies'],
      ['/api/v1/assets'],
      ['/api/v1/companies'],
      ['/api/v1/cost-centers'],
      ['/api/v1/fixed-assets'],
      ['/api/v1/renewal-projections/overrides/ECONOMIC'],
    ])('GET %s is not forbidden with only insurance_budgets', async (url) => {
      // Con los mocks vacíos algunos servicios responden 500: acá solo importa
      // que el gate de permisos deje pasar (no 401/403). Se silencia ese log.
      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
      const res = await request(app).get(url).set('Authorization', asUser(['insurance_budgets']))
      spy.mockRestore()
      expect(res.status).not.toBe(403)
      expect(res.status).not.toBe(401)
    })

    it('renewal-projection override writes stay forbidden with only insurance_budgets', async () => {
      const put = await request(app)
        .put(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', asUser(['insurance_budgets']))
        .send({ netOverrideUsd: 1 })
      expect(put.status).toBe(403)
      const del = await request(app)
        .delete(`/api/v1/renewal-projections/overrides/ECONOMIC/${ASSET_ID}`)
        .set('Authorization', asUser(['insurance_budgets']))
      expect(del.status).toBe(403)
    })
  })

  // ── GET / ───────────────────────────────────────────────────────────────────

  describe('GET /api/v1/insurance-budgets', () => {
    it('filters by level and month range and serializes amounts as numbers', async () => {
      db.insuranceBudget.findMany.mockResolvedValue([
        fakeBudget({ months: [{ month: '2026-01', amountUsd: dec(100.5) }, { month: '2026-02', amountUsd: dec(0) }] }),
      ])
      const res = await request(app)
        .get('/api/v1/insurance-budgets?scopeType=COMPANY&from=2026-01&to=2026-12')
        .set('Authorization', `Bearer ${adminToken()}`)
      expect(res.status).toBe(200)
      expect(res.body.data[0]).toMatchObject({
        scopeType: 'COMPANY',
        scopeId: COMPANY_ID,
        version: 3,
        months: [{ month: '2026-01', amountUsd: 100.5 }, { month: '2026-02', amountUsd: 0 }],
      })
      const args = db.insuranceBudget.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ scopeType: 'COMPANY' })
      expect(args.include.months.where).toEqual({ month: { gte: '2026-01', lte: '2026-12' } })
    })

    it.each([
      ['scopeType missing', 'from=2026-01&to=2026-12'],
      ['invalid level', 'scopeType=POLICY&from=2026-01&to=2026-12'],
      ['invalid month', 'scopeType=COMPANY&from=2026-13&to=2026-12'],
      ['to before from', 'scopeType=COMPANY&from=2026-06&to=2026-01'],
      ['more than 60 months', 'scopeType=COMPANY&from=2020-01&to=2025-01'],
    ])('422 when %s', async (_label, qs) => {
      const res = await request(app).get(`/api/v1/insurance-budgets?${qs}`).set('Authorization', `Bearer ${adminToken()}`)
      expect(res.status).toBe(422)
    })

    it('accepts a range crossing years (exactly 60 months)', async () => {
      db.insuranceBudget.findMany.mockResolvedValue([])
      const res = await request(app)
        .get('/api/v1/insurance-budgets?scopeType=ASSET&from=2025-07&to=2030-06')
        .set('Authorization', `Bearer ${adminToken()}`)
      expect(res.status).toBe(200)
    })
  })

  // ── POST / ──────────────────────────────────────────────────────────────────

  describe('POST /api/v1/insurance-budgets', () => {
    const post = (body: object) =>
      request(app).post('/api/v1/insurance-budgets').set('Authorization', `Bearer ${adminToken()}`).send(body)

    it('creates the line with months and audits CREATE + one row per month', async () => {
      db.company.findUnique.mockResolvedValue({ id: COMPANY_ID, isActive: true })
      db.insuranceBudget.findFirst.mockResolvedValue(null)
      db.insuranceBudget.create.mockResolvedValue({ id: BUDGET_ID })
      db.insuranceBudget.findUniqueOrThrow.mockResolvedValue(
        fakeBudget({ version: 1, months: [{ month: '2026-01', amountUsd: dec(100) }, { month: '2026-02', amountUsd: dec(0) }] }),
      )

      const res = await post({
        scopeType: 'COMPANY',
        scopeId: COMPANY_ID,
        months: [{ month: '2026-01', amountUsd: 100 }, { month: '2026-02', amountUsd: 0 }],
      })

      expect(res.status).toBe(201)
      expect(db.insuranceBudget.create.mock.calls[0][0].data).toMatchObject({
        scopeType: 'COMPANY',
        companyId: COMPANY_ID,
        createdBy: 'test@losodwyer.com',
      })
      expect(db.insuranceBudgetMonth.createMany.mock.calls[0][0].data).toHaveLength(2)
      const rows = auditRows()
      expect(rows.map((r: any) => r.action)).toEqual(['CREATE', 'UPDATE_MONTHS', 'UPDATE_MONTHS'])
      expect(rows[2]).toMatchObject({ month: '2026-02', previousAmountUsd: null, versionAfter: 1 })
      expect(Number(rows[2].newAmountUsd)).toBe(0)
    })

    it('404 when the scope does not exist or is inactive', async () => {
      db.asset.findUnique.mockResolvedValueOnce(null)
      expect((await post({ scopeType: 'ASSET', scopeId: ASSET_ID })).status).toBe(404)
      db.asset.findUnique.mockResolvedValueOnce({ id: ASSET_ID, isActive: false })
      expect((await post({ scopeType: 'ASSET', scopeId: ASSET_ID })).status).toBe(404)
      expect(db.insuranceBudget.create).not.toHaveBeenCalled()
    })

    it('409 when the scope already has a budget (no second line)', async () => {
      db.company.findUnique.mockResolvedValue({ id: COMPANY_ID, isActive: true })
      db.insuranceBudget.findFirst.mockResolvedValue({ id: BUDGET_ID })
      const res = await post({ scopeType: 'COMPANY', scopeId: COMPANY_ID })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('BUDGET_ALREADY_EXISTS')
      expect(db.insuranceBudget.create).not.toHaveBeenCalled()
    })

    it('409 when a concurrent create wins the unique index (P2002)', async () => {
      db.company.findUnique.mockResolvedValue({ id: COMPANY_ID, isActive: true })
      db.insuranceBudget.findFirst.mockResolvedValue(null)
      db.insuranceBudget.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      )
      const res = await post({ scopeType: 'COMPANY', scopeId: COMPANY_ID })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('BUDGET_ALREADY_EXISTS')
    })

    it.each([
      ['negative amount', { months: [{ month: '2026-01', amountUsd: -1 }] }],
      ['more than 2 decimals', { months: [{ month: '2026-01', amountUsd: 1.234 }] }],
      ['duplicated month', { months: [{ month: '2026-01', amountUsd: 1 }, { month: '2026-01', amountUsd: 2 }] }],
      ['invalid month', { months: [{ month: '2026-1', amountUsd: 1 }] }],
      ['null amount on create', { months: [{ month: '2026-01', amountUsd: null }] }],
      ['extra field', { amountTotal: 12 }],
      ['unknown level', { scopeType: 'POLICY' }],
      ['more than 60 months', { months: Array.from({ length: 61 }, (_, i) => ({ month: `20${30 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`, amountUsd: 1 })) }],
    ])('422 for %s', async (_label, patch) => {
      const res = await post({ scopeType: 'COMPANY', scopeId: COMPANY_ID, ...patch })
      expect(res.status).toBe(422)
      expect(db.insuranceBudget.create).not.toHaveBeenCalled()
    })
  })

  // ── PUT /:id ────────────────────────────────────────────────────────────────

  describe('PUT /api/v1/insurance-budgets/:id', () => {
    const put = (body: object) =>
      request(app).put(`/api/v1/insurance-budgets/${BUDGET_ID}`).set('Authorization', `Bearer ${adminToken()}`).send(body)

    beforeEach(() => {
      db.insuranceBudget.findUnique.mockImplementation((args: any) =>
        Promise.resolve(args.include ? fakeBudget({ version: 4 }) : { id: BUDGET_ID, version: 3, notes: null }),
      )
      db.insuranceBudget.updateMany.mockResolvedValue({ count: 1 })
    })

    it('creates, updates and clears months with one audit row per changed month', async () => {
      db.insuranceBudgetMonth.findMany.mockResolvedValue([
        { month: '2026-02', amountUsd: dec(100) },
        { month: '2026-03', amountUsd: dec(50) },
        { month: '2026-04', amountUsd: dec(70) },
      ])

      const res = await put({
        expectedVersion: 3,
        reason: 'Ajuste Q1',
        months: [
          { month: '2026-01', amountUsd: 10 }, // alta
          { month: '2026-02', amountUsd: 120 }, // cambio
          { month: '2026-03', amountUsd: null }, // vaciado
          { month: '2026-04', amountUsd: 70 }, // sin cambio
        ],
      })

      expect(res.status).toBe(200)
      expect(res.body.data.changed).toBe(true)
      expect(db.insuranceBudget.updateMany).toHaveBeenCalledWith({
        where: { id: BUDGET_ID, version: 3 },
        data: { version: { increment: 1 }, updatedBy: 'test@losodwyer.com' },
      })
      expect(db.insuranceBudgetMonth.deleteMany).toHaveBeenCalledWith({ where: { budgetId: BUDGET_ID, month: { in: ['2026-03'] } } })
      expect(db.insuranceBudgetMonth.createMany.mock.calls[0][0].data).toEqual([
        expect.objectContaining({ month: '2026-01' }),
      ])
      expect(db.insuranceBudgetMonth.update).toHaveBeenCalledTimes(1)
      expect(db.insuranceBudgetMonth.update.mock.calls[0][0].where).toEqual({ budgetId_month: { budgetId: BUDGET_ID, month: '2026-02' } })

      const rows = auditRows()
      expect(rows).toHaveLength(3)
      expect(rows.map((r: any) => r.month).sort()).toEqual(['2026-01', '2026-02', '2026-03'])
      const cleared = rows.find((r: any) => r.month === '2026-03')
      expect(Number(cleared.previousAmountUsd)).toBe(50)
      expect(cleared.newAmountUsd).toBeNull()
      expect(rows.every((r: any) => r.versionAfter === 4 && r.reason === 'Ajuste Q1' && r.performedBy === 'test@losodwyer.com')).toBe(true)
    })

    it('a month already stored is updated in place, never duplicated', async () => {
      db.insuranceBudgetMonth.findMany.mockResolvedValue([{ month: '2026-05', amountUsd: dec(10) }])
      const res = await put({ expectedVersion: 3, months: [{ month: '2026-05', amountUsd: 11 }] })
      expect(res.status).toBe(200)
      expect(db.insuranceBudgetMonth.createMany).not.toHaveBeenCalled()
      expect(db.insuranceBudgetMonth.update).toHaveBeenCalledTimes(1)
    })

    it('no-op save: no version bump and no audit', async () => {
      db.insuranceBudgetMonth.findMany.mockResolvedValue([{ month: '2026-05', amountUsd: dec(10) }])
      const res = await put({ expectedVersion: 3, months: [{ month: '2026-05', amountUsd: 10 }, { month: '2026-06', amountUsd: null }] })
      expect(res.status).toBe(200)
      expect(res.body.data.changed).toBe(false)
      expect(db.insuranceBudget.updateMany).not.toHaveBeenCalled()
      expect(db.insuranceBudgetAuditLog.createMany).not.toHaveBeenCalled()
    })

    it('409 BUDGET_VERSION_CONFLICT on a stale version and writes nothing', async () => {
      db.insuranceBudgetMonth.findMany.mockResolvedValue([])
      db.insuranceBudget.updateMany.mockResolvedValue({ count: 0 })
      const res = await put({ expectedVersion: 2, months: [{ month: '2026-01', amountUsd: 5 }] })
      expect(res.status).toBe(409)
      expect(res.body.error.code).toBe('BUDGET_VERSION_CONFLICT')
      expect(db.insuranceBudgetMonth.createMany).not.toHaveBeenCalled()
      expect(db.insuranceBudgetAuditLog.createMany).not.toHaveBeenCalled()
    })

    it('audits a notes change with previous/new data', async () => {
      const res = await put({ expectedVersion: 3, notes: 'Incluye flota nueva' })
      expect(res.status).toBe(200)
      expect(db.insuranceBudget.updateMany.mock.calls[0][0].data.notes).toBe('Incluye flota nueva')
      expect(auditRows()).toEqual([
        expect.objectContaining({ action: 'UPDATE_NOTES', previousData: { notes: null }, newData: { notes: 'Incluye flota nueva' } }),
      ])
    })

    it('404 for an unknown budget', async () => {
      db.insuranceBudget.findUnique.mockResolvedValue(null)
      const res = await put({ expectedVersion: 1, months: [{ month: '2026-01', amountUsd: 1 }] })
      expect(res.status).toBe(404)
    })

    it.each([
      ['missing expectedVersion', { months: [{ month: '2026-01', amountUsd: 1 }] }],
      ['nothing to change', { expectedVersion: 3 }],
      ['duplicated months in payload', { expectedVersion: 3, months: [{ month: '2026-01', amountUsd: 1 }, { month: '2026-01', amountUsd: null }] }],
      ['scope change attempt', { expectedVersion: 3, scopeId: COMPANY_ID, months: [{ month: '2026-01', amountUsd: 1 }] }],
    ])('422 for %s', async (_label, body) => {
      const res = await put(body)
      expect(res.status).toBe(422)
    })
  })

  // ── GET /:id/audit-log ──────────────────────────────────────────────────────

  describe('GET /api/v1/insurance-budgets/:id/audit-log', () => {
    it('is paginated, newest first, and filters by month range', async () => {
      db.insuranceBudget.findUnique.mockResolvedValue({ id: BUDGET_ID })
      db.insuranceBudgetAuditLog.findMany.mockResolvedValue([
        { id: 'l1', action: 'UPDATE_MONTHS', month: '2025-08', previousAmountUsd: dec(10), newAmountUsd: null, previousData: null, newData: null, reason: null, performedBy: 'a@test.com', versionAfter: 2, createdAt: new Date() },
      ])
      db.insuranceBudgetAuditLog.count.mockResolvedValue(1)

      const res = await request(app)
        .get(`/api/v1/insurance-budgets/${BUDGET_ID}/audit-log?from=2025-07&to=2026-06&page=1&limit=20`)
        .set('Authorization', asUser(['insurance_budgets']))

      expect(res.status).toBe(200)
      expect(res.body.data[0]).toMatchObject({ month: '2025-08', previousAmountUsd: 10, newAmountUsd: null })
      expect(res.body.pagination).toMatchObject({ total: 1, page: 1, limit: 20 })
      const args = db.insuranceBudgetAuditLog.findMany.mock.calls[0][0]
      expect(args.where).toEqual({ budgetId: BUDGET_ID, month: { gte: '2025-07', lte: '2026-06' } })
      expect(args.orderBy[0]).toEqual({ createdAt: 'desc' })
    })

    it('404 for an unknown budget', async () => {
      db.insuranceBudget.findUnique.mockResolvedValue(null)
      const res = await request(app).get(`/api/v1/insurance-budgets/${BUDGET_ID}/audit-log`).set('Authorization', `Bearer ${adminToken()}`)
      expect(res.status).toBe(404)
    })
  })

  // ── Integridad del historial ────────────────────────────────────────────────

  describe('history integrity', () => {
    it('asset hardDelete is refused (409) when the asset has a budget', async () => {
      db.asset.findUnique.mockResolvedValue({
        id: ASSET_ID,
        _count: { pledges: 0, renewalProjectionOverrides: 0 },
        insuranceBudget: { id: BUDGET_ID },
        attachments: [],
        insuranceAudits: [],
      })
      await expect(assetsService.hardDelete(ASSET_ID)).rejects.toMatchObject({ statusCode: 409, code: 'ASSET_HAS_INSURANCE_BUDGET' })
      expect(db.asset.delete).not.toHaveBeenCalled()
    })

    it('there is no DELETE route for budgets', async () => {
      const res = await request(app).delete(`/api/v1/insurance-budgets/${BUDGET_ID}`).set('Authorization', `Bearer ${adminToken()}`)
      expect(res.status).toBe(404)
    })

    it('the audit log is NOT part of the automatic log-retention cleanup', () => {
      const script = fs.readFileSync(path.resolve(__dirname, '../../../../scripts/cleanup-old-logs.ts'), 'utf8')
      expect(script).not.toMatch(/insuranceBudget/i)
    })
  })

  // ── Migración ───────────────────────────────────────────────────────────────

  describe('migration add_insurance_budgets', () => {
    const migrationsDir = path.resolve(__dirname, '../../../../prisma/migrations')
    const dir = fs.readdirSync(migrationsDir).find((name) => name.endsWith('_add_insurance_budgets'))
    const sql = dir ? fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8') : ''
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    const NEW_TABLES = new Set(['insurance_budgets', 'insurance_budget_months', 'insurance_budget_audit_logs'])

    it('exists', () => {
      expect(dir).toBeDefined()
    })

    it('is purely additive: no data changes, no drops, only touches its own new tables', () => {
      expect(statements).not.toMatch(/^\s*(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/im)
      expect(statements).not.toMatch(/DROP COLUMN|ALTER COLUMN|RENAME|ADD COLUMN/i)
      const altered = [...statements.matchAll(/ALTER TABLE "([^"]+)"/g)].map((m) => m[1])
      expect(altered.every((t) => NEW_TABLES.has(t))).toBe(true)
      const created = [...statements.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1])
      expect(new Set(created)).toEqual(NEW_TABLES)
    })

    it('keeps the CHECK constraints and RESTRICT foreign keys', () => {
      for (const name of [
        'insurance_budgets_scope_consistent',
        'insurance_budget_months_month_format',
        'insurance_budget_months_amount_non_negative',
      ]) {
        expect(statements).toContain(name)
      }
      expect(statements).not.toMatch(/ON DELETE CASCADE/i)
      expect(statements).toContain('"insurance_budget_months_budgetId_month_key"')
    })
  })
})
