import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

// R4-A — cobertura activa (suma asegurada que aporta HOY) con la regla de
// vigencia efectiva, el día de Argentina, y sin tocar importes históricos ni
// el listado.

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    policy: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), count: jest.fn(), update: jest.fn() },
    policyAssetCoverage: { aggregate: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any
// Se firma después de congelar el reloj (beforeAll): firmado con la hora real
// quedaría vencido contra NOW.
let auth: Record<string, string>


// 30/11/2026 23:30 en Argentina = 01/12/2026 02:30 UTC: el día UTC ya cambió.
const NOW = new Date('2026-12-01T02:30:00.000Z')
const AR_TODAY = new Date('2026-11-30T00:00:00.000Z')

const POLICY_ID = '35000000-0000-0000-0000-000000000001'
const TYPE_ID = '50000000-0000-0000-0000-000000000001'
const ASSET_ID = '40000000-0000-0000-0000-000000000001'
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

function line(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id, assetId: ASSET_ID, insuranceTypeId: TYPE_ID, coverageIds: [], insuredAmount: 10000, currency: 'USD',
    exchangeRate: 1000, insuredAmountArs: 10_000_000, insuredAmountUsd: 10000, companyId: null, costCenterId: null,
    effectiveDate: d('2026-01-01'), bajaDate: null, bajaReason: null, deactivatedAt: null,
    insuranceType: { id: TYPE_ID, name: 'Automotor', coverages: [] }, asset: { id: ASSET_ID, name: 'Camión A', code: 'A' },
    attachments: [], _count: { attachments: 0 },
    ...overrides,
  }
}

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: POLICY_ID, policyNumber: 'P-1', insuredName: 'La Segunda', producerId: null, producer: null,
    startDate: d('2026-01-01'), endDate: d('2026-12-31'), description: null, isActive: true,
    deactivatedAt: null as Date | null, createdAt: d('2026-01-01'), updatedAt: d('2026-01-01'),
    coverages: [line('cov-1')], _count: { coverages: 1 }, renewalLinksAsPrevious: [] as unknown[], renewalLinksAsRenewal: [] as unknown[],
    ...overrides,
  }
}

beforeAll(() => {
  // Solo se congela Date: supertest/express siguen usando timers reales.
  jest.useFakeTimers({
    now: NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'hrtime', 'performance'],
  })
  auth = { Authorization: `Bearer ${adminToken()}` }
})
afterAll(() => jest.useRealTimers())

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.policy.count.mockResolvedValue(0)
  db.policy.findMany.mockResolvedValue([])
  db.policyAssetCoverage.aggregate.mockResolvedValue({ _sum: { insuredAmountArs: 0, insuredAmountUsd: 0 } })
})

describe('summary.insuredActive — vigencia efectiva (R4-A)', () => {
  it('13. uses the Argentine day, not the UTC day, for the policy and the line', async () => {
    await request(app).get('/api/v1/policies?includeSummary=true').set(auth)

    const { where } = db.policyAssetCoverage.aggregate.mock.calls[0][0]
    expect(where.policy.AND[1]).toEqual({ deactivatedAt: null, startDate: { lte: AR_TODAY }, endDate: { gte: AR_TODAY } })
    expect(where.effectiveDate).toEqual({ lte: AR_TODAY })
    expect(where.OR).toEqual([{ bajaDate: null }, { bajaDate: { gte: AR_TODAY } }])
  })

  it('14. a future policy is listed (no startDate in the list query) but the active sum excludes it', async () => {
    db.policy.findMany.mockResolvedValue([policyRow({ startDate: d('2026-12-15'), endDate: d('2027-12-14'), coverages: [line('cov-f', { effectiveDate: d('2026-12-15') })] })])
    db.policy.count.mockResolvedValue(1)

    const res = await request(app).get('/api/v1/policies?includeSummary=true').set(auth)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(JSON.stringify(db.policy.findMany.mock.calls[0][0].where)).not.toContain('startDate')
    expect(db.policyAssetCoverage.aggregate.mock.calls[0][0].where.policy.AND[1].startDate).toEqual({ lte: AR_TODAY })
  })

  it('11. sums every in-force line as-is: no grouping or deduplication by asset', async () => {
    await request(app).get('/api/v1/policies?includeSummary=true').set(auth)

    const args = db.policyAssetCoverage.aggregate.mock.calls[0][0]
    expect(Object.keys(args).sort()).toEqual(['_sum', 'where'])
    expect(args._sum).toEqual({ insuredAmountArs: true, insuredAmountUsd: true })
  })

  it('12. the active-sum query never depends on renewals', async () => {
    await request(app).get('/api/v1/policies?includeSummary=true&effectiveStatus=renovada').set(auth)

    const { where } = db.policyAssetCoverage.aggregate.mock.calls[0][0]
    // El filtro de la tabla (where) puede incluir el estado administrativo;
    // la condición de vigencia que se le suma nunca.
    expect(JSON.stringify(where.policy.AND[1])).not.toMatch(/renewal/i)
    expect(JSON.stringify({ ...where, policy: undefined })).not.toMatch(/renewal/i)
  })
})

describe('current asset line — día de Argentina (R4-A)', () => {
  it('at 23:30 in Argentina still picks the line whose bajaDate is today, not the one starting tomorrow (UTC today)', async () => {
    db.policy.findMany.mockResolvedValue([policyRow({
      coverages: [
        line('cov-old', { bajaDate: AR_TODAY, insuredAmountUsd: 10000 }),
        line('cov-new', { effectiveDate: d('2026-12-01'), insuredAmountUsd: 12000 }),
      ],
    })])

    const res = await request(app).get(`/api/v1/policies?assetId=${ASSET_ID}`).set(auth)

    expect(res.body.data[0].assetCoverage).toMatchObject({ id: 'cov-old', bajaDate: '2026-11-30', insuredAmountUsd: 10000 })
  })
})

describe('15. historical amounts stay intact', () => {
  it('policy totals keep summing every stored line (including de-baja lines and future policies) and nothing is written', async () => {
    const lines = [line('cov-1', { insuredAmountUsd: 10000, insuredAmountArs: 10_000_000 }), line('cov-2', { bajaDate: d('2026-03-01'), insuredAmountUsd: 5000, insuredAmountArs: 5_000_000 })]
    db.policy.findUnique.mockResolvedValue(policyRow({ coverages: lines, startDate: d('2027-01-01'), endDate: d('2027-12-31') }))
    db.policy.findMany.mockResolvedValue([policyRow({ coverages: lines })])

    const detail = (await request(app).get(`/api/v1/policies/${POLICY_ID}`).set(auth)).body.data
    const list = (await request(app).get('/api/v1/policies').set(auth)).body.data[0]

    expect([detail.totalInsuredAmountUsd, detail.totalInsuredAmountArs]).toEqual([15000, 15_000_000])
    expect([list.totalInsuredAmountUsd, list.totalInsuredAmountArs]).toEqual([15000, 15_000_000])
    expect(db.policy.update).not.toHaveBeenCalled()
    expect(db.policyAssetCoverage.update).not.toHaveBeenCalled()
    expect(db.policyAssetCoverage.updateMany).not.toHaveBeenCalled()
  })
})
