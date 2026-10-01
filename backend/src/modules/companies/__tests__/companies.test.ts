import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    company: { findMany: jest.fn(), count: jest.fn() },
    asset: { count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const C1 = '70000000-0000-0000-0000-000000000001'
const C2 = '70000000-0000-0000-0000-000000000002'

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.company.findMany.mockResolvedValue([{ id: C1, name: 'Agro SA' }, { id: C2, name: 'Campo SRL' }])
  db.company.count.mockResolvedValue(2)
  db.asset.count.mockResolvedValue(260)
  db.$queryRaw.mockResolvedValue([
    { companyId: C1, costCenterId: 'cc1', count: BigInt(250) },
    { companyId: 'other', costCenterId: 'cc2', count: BigInt(3) },
  ])
})

describe('GET /api/v1/companies', () => {
  it('keeps the legacy payload and runs no asset count without includeAssetCounts', async () => {
    const res = await request(app).get('/api/v1/companies').set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(Object.keys(res.body).sort()).toEqual(['data', 'pagination'])
    expect(res.body.data[0]).not.toHaveProperty('activeAssetCount')
    expect(db.$queryRaw).not.toHaveBeenCalled()
    expect(db.asset.count).not.toHaveBeenCalled()
  })

  it('returns the real active asset count per company (primary allocation) and the total, beyond 200 assets', async () => {
    const res = await request(app)
      .get('/api/v1/companies?includeAssetCounts=true')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.map((c: { activeAssetCount: number }) => c.activeAssetCount)).toEqual([250, 0])
    expect(res.body.summary).toEqual({ activeAssets: 260 })
    expect(db.asset.count).toHaveBeenCalledWith({ where: { status: 'activo' } })
  })
})
