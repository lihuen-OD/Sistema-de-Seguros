jest.mock('../../../config/database', () => ({
  prisma: { $queryRaw: jest.fn() },
}))

import { prisma } from '../../../config/database'
import { countActiveAssetsByPrimaryAllocation } from '../asset-allocation-counts'

const db = prisma as any

describe('countActiveAssetsByPrimaryAllocation', () => {
  it('aggregates the per (company, cost center) rows into one map per dimension', async () => {
    db.$queryRaw.mockResolvedValue([
      { companyId: 'c1', costCenterId: 'cc1', count: BigInt(120) },
      { companyId: 'c1', costCenterId: 'cc2', count: BigInt(95) },
      { companyId: 'c2', costCenterId: 'cc1', count: BigInt(4) },
    ])

    const { byCompany, byCostCenter } = await countActiveAssetsByPrimaryAllocation()

    // Más de 200 activos en total: ya no hay tope por traer /assets?limit=200.
    expect(byCompany).toEqual(new Map([['c1', 215], ['c2', 4]]))
    expect(byCostCenter).toEqual(new Map([['cc1', 124], ['cc2', 95]]))
  })

  it('counts only the primary allocation of active assets, with an id tiebreak', async () => {
    db.$queryRaw.mockResolvedValue([])
    await countActiveAssetsByPrimaryAllocation()

    const sql = (db.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join('?')
    expect(sql).toContain('DISTINCT ON (aa."assetId")')
    expect(sql).toContain('ORDER BY aa."assetId", aa.percentage DESC, aa.id ASC')
    expect(sql).toContain("WHERE a.status = 'activo'")
    expect(db.$queryRaw.mock.calls[0]).toHaveLength(1) // sin parámetros interpolados
  })
})
