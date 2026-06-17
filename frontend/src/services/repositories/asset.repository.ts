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

  create(data: Omit<Asset, 'id' | 'createdAt' | 'updatedAt'>): Asset {
    const now = new Date().toISOString().slice(0, 10)
    const newAsset: Asset = {
      ...data,
      id: `asset-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    }
    mockAssets.push(newAsset)
    return newAsset
  },

  update(id: string, changes: Partial<Omit<Asset, 'id' | 'createdAt'>>): Asset | undefined {
    const idx = mockAssets.findIndex((a) => a.id === id)
    if (idx === -1) return undefined
    Object.assign(mockAssets[idx], changes, { updatedAt: '2026-06-11' })
    return { ...mockAssets[idx] }
  },

  getTotalPatrimonialValue(): number {
    return mockAssets
      .filter((a) => a.status === 'activo')
      .reduce((sum, a) => sum + a.patrimonialValueUsd, 0)
  },
}
