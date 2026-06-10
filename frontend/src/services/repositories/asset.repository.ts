import type { Asset } from '../../shared/types'
import { mockAssets } from '../../data/mock-assets'

export const assetRepository = {
  findAll(): Asset[] {
    return [...mockAssets]
  },

  findById(id: string): Asset | undefined {
    return mockAssets.find((a) => a.id === id)
  },

  findByCompany(companyId: string): Asset[] {
    return mockAssets.filter((a) => a.companyId === companyId)
  },

  findByCostCenter(costCenterId: string): Asset[] {
    return mockAssets.filter((a) => a.costCenterId === costCenterId)
  },

  findByStatus(status: Asset['status']): Asset[] {
    return mockAssets.filter((a) => a.status === status)
  },

  search(query: string): Asset[] {
    const q = query.toLowerCase()
    return mockAssets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.internalCode.toLowerCase().includes(q) ||
        a.assetType.toLowerCase().includes(q) ||
        a.brand.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q),
    )
  },

  getTotalPatrimonialValue(): number {
    return mockAssets
      .filter((a) => a.status !== 'vendido' && a.status !== 'dado_de_baja')
      .reduce((sum, a) => sum + a.patrimonialValueUsd, 0)
  },
}
