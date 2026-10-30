import request from 'supertest'
import { app } from '../../../app'
import { adminToken, userToken, mockDbUser } from '../../../__tests__/helpers/auth'
import type { ModuleKey } from '../../../shared/types'

// ── Prisma mock ───────────────────────────────────────────────────────────────

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    asset: { findMany: jest.fn(), count: jest.fn() },
    policy: { findMany: jest.fn(), count: jest.fn() },
    accountingDocument: { findMany: jest.fn(), count: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.asset.findMany.mockResolvedValue([])
  db.policy.findMany.mockResolvedValue([])
  db.accountingDocument.findMany.mockResolvedValue([])
})

function asUser(modules: ModuleKey[]) {
  db.user.findUnique.mockResolvedValue(mockDbUser({ role: 'USER', modules }))
  return `Bearer ${userToken()}`
}

const asAdmin = () => `Bearer ${adminToken()}`

// ── Fixtures ──────────────────────────────────────────────────────────────────

let seq = 0
const nextId = () => `00000000-0000-0000-0000-${String(++seq).padStart(12, '0')}`

function assetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    code: 'ACT-00001',
    name: 'Toyota Hilux',
    assetType: 'camioneta',
    status: 'activo',
    metadata: { plate: 'AB 123 CD', chassisNumber: 'CH-001', engineNumber: 'MT-001' },
    fixedAssetCode: 'BU-01',
    fixedAsset: { code: 'BU-01', name: 'Rodados' },
    serialNumber: null,
    licensePlateNormalized: 'AB123CD',
    ...overrides,
  }
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    policyNumber: 'POL-1000',
    insuredName: 'La Segunda',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2099-12-31T00:00:00.000Z'),
    deactivatedAt: null,
    producer: { name: 'Productor Demo' },
    coverages: [{ insuranceType: { name: 'Automotor' } }, { insuranceType: { name: 'Automotor' } }],
    renewalLinksAsPrevious: [],
    ...overrides,
  }
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: nextId(),
    documentNumber: 'FAC-2026-001',
    documentType: 'INVOICE',
    issueDate: new Date('2026-01-01T00:00:00.000Z'),
    insuranceCompany: 'MAPFRE',
    currency: 'ARS',
    netAmount: 1000,
    vatAmount: 210,
    otherTaxesAmount: 50,
    paymentStatus: 'PENDING',
    paymentMethod: 'Transferencia bancaria',
    documentStatus: 'ISSUED',
    ...overrides,
  }
}

const findManyCalls = () =>
  db.asset.findMany.mock.calls.length +
  db.policy.findMany.mock.calls.length +
  db.accountingDocument.findMany.mock.calls.length

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /api/v1/search', () => {

  // ── Autenticación y permisos ────────────────────────────────────────────────

  describe('permisos', () => {
    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/search?q=hilux')
      expect(res.status).toBe(401)
      expect(findManyCalls()).toBe(0)
    })

    it('returns 403 for a USER without assets, policies or documents', async () => {
      const res = await request(app).get('/api/v1/search?q=hilux').set('Authorization', asUser(['claims', 'dashboard']))
      expect(res.status).toBe(403)
      expect(findManyCalls()).toBe(0)
    })

    it('returns 403 for renewal_projections alone — it reaches /policies/search but not the policy detail', async () => {
      const res = await request(app).get('/api/v1/search?q=pol').set('Authorization', asUser(['renewal_projections']))
      expect(res.status).toBe(403)
      expect(findManyCalls()).toBe(0)
    })

    it('ADMIN gets the three groups', async () => {
      const res = await request(app).get('/api/v1/search?q=hilux').set('Authorization', asAdmin())

      expect(res.status).toBe(200)
      expect(Object.keys(res.body.data).sort()).toEqual(['assets', 'documents', 'policies'])
      expect(res.body.data.assets).toEqual({ items: [], hasMore: false })
    })

    it('a USER with only assets gets only the assets group and the other tables are not queried', async () => {
      db.asset.findMany.mockResolvedValueOnce([assetRow()])

      const res = await request(app).get('/api/v1/search?q=hilux').set('Authorization', asUser(['assets']))

      expect(res.status).toBe(200)
      expect(Object.keys(res.body.data)).toEqual(['assets'])
      expect(db.policy.findMany).not.toHaveBeenCalled()
      expect(db.accountingDocument.findMany).not.toHaveBeenCalled()
    })

    it('does not return assets to a policies user — /assets/search accepts policies, the asset detail does not', async () => {
      const res = await request(app)
        .get('/api/v1/search?q=hilux')
        .set('Authorization', asUser(['policies', 'documents']))

      expect(res.status).toBe(200)
      expect(Object.keys(res.body.data).sort()).toEqual(['documents', 'policies'])
      expect(db.asset.findMany).not.toHaveBeenCalled()
    })

    it('a USER with only documents gets only the documents group', async () => {
      const res = await request(app).get('/api/v1/search?q=fac').set('Authorization', asUser(['documents']))

      expect(res.status).toBe(200)
      expect(Object.keys(res.body.data)).toEqual(['documents'])
      expect(db.asset.findMany).not.toHaveBeenCalled()
      expect(db.policy.findMany).not.toHaveBeenCalled()
    })
  })

  // ── Validación ──────────────────────────────────────────────────────────────

  describe('validación', () => {
    it.each([
      ['missing q', ''],
      ['q shorter than 2 characters after trim', '?q=%20a%20'],
      ['q longer than 100 characters', `?q=${'a'.repeat(101)}`],
      ['limit above 10', '?q=hilux&limit=11'],
      ['limit below 1', '?q=hilux&limit=0'],
    ])('rejects %s without querying the database', async (_case, qs) => {
      const res = await request(app).get(`/api/v1/search${qs}`).set('Authorization', asAdmin())
      expect(res.status).toBe(422)
      expect(findManyCalls()).toBe(0)
    })
  })

  // ── Resultados ──────────────────────────────────────────────────────────────

  describe('resultados', () => {
    it('returns the same lightweight contract as the form selectors, plus documentStatus', async () => {
      const asset = assetRow({ serialNumber: 'SER-1' })
      const policy = policyRow()
      const doc = documentRow()
      db.asset.findMany.mockResolvedValueOnce([asset])
      db.policy.findMany.mockResolvedValueOnce([policy])
      db.accountingDocument.findMany.mockResolvedValueOnce([doc])

      const res = await request(app).get('/api/v1/search?q=zz').set('Authorization', asAdmin())

      expect(res.status).toBe(200)
      expect(res.body.data.assets.items).toEqual([{
        id: asset.id,
        name: 'Toyota Hilux',
        code: 'ACT-00001',
        status: 'activo',
        assetType: 'camioneta',
        plate: 'AB 123 CD',
        fixedAssetCode: 'BU-01',
        fixedAssetName: 'Rodados',
      }])
      expect(res.body.data.policies.items).toEqual([{
        id: policy.id,
        policyNumber: 'POL-1000',
        insuranceCompany: 'La Segunda',
        status: 'vigente',
        effectiveStatus: 'vigente',
        startDate: '2026-01-01',
        endDate: '2099-12-31',
        producerName: 'Productor Demo',
        insuranceTypeNames: ['Automotor'],
      }])
      expect(res.body.data.documents.items).toEqual([{
        id: doc.id,
        documentNumber: 'FAC-2026-001',
        type: 'INVOICE',
        issueDate: '2026-01-01',
        insuranceCompany: 'MAPFRE',
        currency: 'ARS',
        totalAmount: 1260,
        paymentStatus: 'PENDING',
        paymentMethod: 'Transferencia bancaria',
        documentStatus: 'ISSUED',
      }])
    })

    it('includes assets dados de baja — no associable-status filter, active ones first', async () => {
      db.asset.findMany.mockResolvedValueOnce([assetRow({ status: 'baja' })])

      const res = await request(app).get('/api/v1/search?q=hilux').set('Authorization', asUser(['assets']))

      expect(res.body.data.assets.items[0].status).toBe('baja')
      const call = db.asset.findMany.mock.calls[0][0]
      expect(call.where).not.toHaveProperty('AND')
      expect(call.where).not.toHaveProperty('isActive')
      expect(call.where).not.toHaveProperty('status')
      expect(call.where.OR).toEqual(expect.arrayContaining([
        { name: { contains: 'hilux', mode: 'insensitive' } },
        { code: { contains: 'hilux', mode: 'insensitive' } },
        { metadata: { path: ['plate'], string_contains: 'hilux' } },
      ]))
      expect(call.orderBy[0]).toEqual({ isActive: 'desc' })
    })

    it('includes cancelled documents and exposes their status', async () => {
      db.accountingDocument.findMany.mockResolvedValueOnce([documentRow({ documentStatus: 'CANCELLED' })])

      const res = await request(app).get('/api/v1/search?q=mapfre').set('Authorization', asUser(['documents']))

      expect(res.body.data.documents.items[0].documentStatus).toBe('CANCELLED')
      expect(db.accountingDocument.findMany.mock.calls[0][0].where).toEqual({
        OR: [
          { documentNumber: { contains: 'mapfre', mode: 'insensitive' } },
          { insuranceCompany: { contains: 'mapfre', mode: 'insensitive' } },
          { description: { contains: 'mapfre', mode: 'insensitive' } },
        ],
      })
    })

    it('trims the query before searching', async () => {
      await request(app).get('/api/v1/search?q=%20%20hilux%20%20').set('Authorization', asUser(['assets']))
      expect(db.asset.findMany.mock.calls[0][0].where.OR).toContainEqual({ name: { contains: 'hilux', mode: 'insensitive' } })
    })
  })

  // ── Coincidencias exactas primero ───────────────────────────────────────────

  describe('prioridad de coincidencias exactas', () => {
    it('moves an exact asset code ahead of partial matches without an extra query when there is no overflow', async () => {
      const partial = assetRow({ name: 'ACT-00012 repuesto', code: 'ACT-00099' })
      const exact = assetRow({ name: 'Zanella', code: 'ACT-00012' })
      db.asset.findMany.mockResolvedValueOnce([partial, exact])

      const res = await request(app).get('/api/v1/search?q=act-00012').set('Authorization', asUser(['assets']))

      expect(res.body.data.assets.items.map((a: { id: string }) => a.id)).toEqual([exact.id, partial.id])
      expect(res.body.data.assets.hasMore).toBe(false)
      expect(db.asset.findMany).toHaveBeenCalledTimes(1)
    })

    it('matches plates regardless of spaces, dashes and casing', async () => {
      const partial = assetRow({ name: 'Ab123cd otro', licensePlateNormalized: 'AB123CDX', metadata: { plate: 'AB123CDX' } })
      const exact = assetRow({ name: 'Camión', licensePlateNormalized: 'AB123CD', metadata: { plate: 'AB 123 CD' } })
      db.asset.findMany.mockResolvedValueOnce([partial, exact])

      const res = await request(app).get('/api/v1/search?q=ab-123-cd').set('Authorization', asUser(['assets']))

      expect(res.body.data.assets.items[0].id).toBe(exact.id)
    })

    it('fetches exact policy numbers separately when partial matches overflow the limit', async () => {
      const partials = Array.from({ length: 6 }, (_, i) => policyRow({ policyNumber: `POL-1000-${i}` }))
      const exact = policyRow({ policyNumber: 'POL-1000' })
      db.policy.findMany.mockResolvedValueOnce(partials).mockResolvedValueOnce([exact])

      const res = await request(app).get('/api/v1/search?q=pol-1000').set('Authorization', asUser(['policies']))

      const { items, hasMore } = res.body.data.policies
      expect(items).toHaveLength(5)
      expect(items[0].id).toBe(exact.id)
      expect(items.slice(1).map((p: { id: string }) => p.id)).toEqual(partials.slice(0, 4).map((p) => p.id))
      expect(hasMore).toBe(true)
      expect(db.policy.findMany).toHaveBeenCalledTimes(2)
      expect(db.policy.findMany.mock.calls[0][0].take).toBe(6)
      expect(db.policy.findMany.mock.calls[1][0]).toMatchObject({
        where: { policyNumber: { equals: 'pol-1000', mode: 'insensitive' } },
        take: 5,
      })
    })

    it('does not duplicate an exact match that was already in the partial batch', async () => {
      const exact = documentRow({ documentNumber: 'FAC-1' })
      const partials = [exact, ...Array.from({ length: 5 }, (_, i) => documentRow({ documentNumber: `FAC-1${i}` }))]
      db.accountingDocument.findMany.mockResolvedValueOnce(partials).mockResolvedValueOnce([exact])

      const res = await request(app).get('/api/v1/search?q=fac-1').set('Authorization', asUser(['documents']))

      const ids = res.body.data.documents.items.map((d: { id: string }) => d.id)
      expect(ids).toHaveLength(5)
      expect(new Set(ids).size).toBe(5)
      expect(ids[0]).toBe(exact.id)
    })
  })

  // ── Rendimiento básico ──────────────────────────────────────────────────────

  describe('rendimiento', () => {
    it('defaults to 5 results per group, asking for one extra to detect overflow', async () => {
      const assets = Array.from({ length: 6 }, (_, i) => assetRow({ name: `Hilux ${i}`, code: `ACT-${i}` }))
      db.asset.findMany.mockResolvedValueOnce(assets).mockResolvedValueOnce([])

      const res = await request(app).get('/api/v1/search?q=hilux').set('Authorization', asAdmin())

      expect(res.body.data.assets.items).toHaveLength(5)
      expect(res.body.data.assets.hasMore).toBe(true)
      expect(db.asset.findMany.mock.calls[0][0].take).toBe(6)
      expect(db.policy.findMany.mock.calls[0][0].take).toBe(6)
      expect(db.accountingDocument.findMany.mock.calls[0][0].take).toBe(6)
    })

    it('honours a custom limit', async () => {
      await request(app).get('/api/v1/search?q=hilux&limit=2').set('Authorization', asAdmin())
      expect(db.asset.findMany.mock.calls[0][0].take).toBe(3)
    })

    it('runs one bounded query per group without overflow, and never counts', async () => {
      await request(app).get('/api/v1/search?q=hilux').set('Authorization', asAdmin())

      expect(findManyCalls()).toBe(3)
      expect(db.asset.count).not.toHaveBeenCalled()
      expect(db.policy.count).not.toHaveBeenCalled()
      expect(db.accountingDocument.count).not.toHaveBeenCalled()
    })

    it('never runs more than two queries per group, even when every group overflows', async () => {
      db.asset.findMany.mockResolvedValueOnce(Array.from({ length: 6 }, () => assetRow()))
      db.policy.findMany.mockResolvedValueOnce(Array.from({ length: 6 }, () => policyRow()))
      db.accountingDocument.findMany.mockResolvedValueOnce(Array.from({ length: 6 }, () => documentRow()))

      await request(app).get('/api/v1/search?q=hilux').set('Authorization', asAdmin())

      expect(findManyCalls()).toBe(6)
      for (const model of [db.asset, db.policy, db.accountingDocument]) {
        for (const [args] of model.findMany.mock.calls) expect(args.take).toBeLessThanOrEqual(6)
      }
    })

    it('selects only lightweight fields — no allocations, installments or attachments', async () => {
      await request(app).get('/api/v1/search?q=hilux').set('Authorization', asAdmin())

      const heavy = ['allocations', 'installments', 'attachments', 'valueHistory', 'statusHistory', 'documents', 'endorsements']
      for (const model of [db.asset, db.policy, db.accountingDocument]) {
        const { select, include } = model.findMany.mock.calls[0][0]
        expect(include).toBeUndefined()
        for (const key of heavy) expect(select).not.toHaveProperty(key)
      }
    })
  })
})
