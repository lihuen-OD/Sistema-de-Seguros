import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    fixedAsset: { findMany: jest.fn(), count: jest.fn() },
    asset: { groupBy: jest.fn() },
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const FA1 = '72000000-0000-0000-0000-000000000001'
const FA2 = '72000000-0000-0000-0000-000000000002'

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.fixedAsset.findMany.mockResolvedValue([{ id: FA1, name: 'Rodados' }, { id: FA2, name: 'Inmuebles' }])
  db.fixedAsset.count.mockResolvedValue(2)
  db.asset.groupBy.mockResolvedValue([{ fixedAssetId: FA1, _count: { _all: 340 } }])
})

describe('GET /api/v1/fixed-assets', () => {
  it('keeps the legacy payload and runs no asset count without includeAssetCounts', async () => {
    const res = await request(app).get('/api/v1/fixed-assets').set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).not.toHaveProperty('activeAssetCount')
    expect(db.asset.groupBy).not.toHaveBeenCalled()
  })

  it('counts active assets per fixed asset in one GROUP BY scoped to the page, beyond 200 assets', async () => {
    const res = await request(app)
      .get('/api/v1/fixed-assets?includeAssetCounts=true')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.map((fa: { activeAssetCount: number }) => fa.activeAssetCount)).toEqual([340, 0])
    expect(db.asset.groupBy).toHaveBeenCalledTimes(1)
    expect(db.asset.groupBy.mock.calls[0][0]).toEqual({
      by: ['fixedAssetId'],
      where: { status: 'activo', fixedAssetId: { in: [FA1, FA2] } },
      _count: { _all: true },
    })
  })
})
