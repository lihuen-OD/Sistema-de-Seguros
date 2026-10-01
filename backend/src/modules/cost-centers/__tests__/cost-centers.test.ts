import request from 'supertest'
import { app } from '../../../app'
import { adminToken, mockDbUser } from '../../../__tests__/helpers/auth'

jest.mock('../../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    costCenter: { findMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
  },
}))

import { prisma } from '../../../config/database'
const db = prisma as any

const CC1 = '71000000-0000-0000-0000-000000000001'
const CC2 = '71000000-0000-0000-0000-000000000002'

beforeEach(() => {
  db.user.findUnique.mockResolvedValue(mockDbUser())
  db.costCenter.findMany.mockResolvedValue([{ id: CC1, name: 'Administración' }, { id: CC2, name: 'Campo' }])
  db.costCenter.count.mockResolvedValue(2)
  db.$queryRaw.mockResolvedValue([
    { companyId: 'c1', costCenterId: CC2, count: BigInt(180) },
    { companyId: 'c2', costCenterId: CC2, count: BigInt(40) },
  ])
})

describe('GET /api/v1/cost-centers', () => {
  it('keeps the legacy payload and runs no asset count without includeAssetCounts', async () => {
    const res = await request(app).get('/api/v1/cost-centers').set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data[0]).not.toHaveProperty('activeAssetCount')
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('returns the real active asset count per cost center (primary allocation), beyond 200 assets', async () => {
    const res = await request(app)
      .get('/api/v1/cost-centers?includeAssetCounts=true')
      .set('Authorization', `Bearer ${adminToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.data.map((cc: { activeAssetCount: number }) => cc.activeAssetCount)).toEqual([0, 220])
  })
})
