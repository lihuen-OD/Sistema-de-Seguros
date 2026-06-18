import type { Asset } from '../../shared/types'
import { mockAssets } from '../../data/mock-assets'

let assets: Asset[] = [...mockAssets]

export const assetRepository = {
  findAll(): Asset[] {
    return [...assets]
  },

  findById(id: string): Asset | undefined {
    return assets.find((a) => a.id === id)
  },

  findByCompany(companyId: string): Asset[] {
    return assets.filter((a) => a.companyId === companyId)
  },

  findByCostCenter(costCenterId: string): Asset[] {
    return assets.filter((a) => a.costCenterId === costCenterId)
  },

  findByStatus(status: Asset['status']): Asset[] {
    return assets.filter((a) => a.status === status)
  },

  search(query: string): Asset[] {
    const q = query.toLowerCase()
    return assets.filter(
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
    assets = [...assets, newAsset]
    return newAsset
  },

  update(id: string, changes: Partial<Omit<Asset, 'id' | 'createdAt'>>): Asset | undefined {
    let updated: Asset | undefined
    assets = assets.map((a) => {
      if (a.id !== id) return a
      updated = { ...a, ...changes, updatedAt: new Date().toISOString().slice(0, 10) }
      return updated!
    })
    return updated
  },

  delete(id: string): boolean {
    const exists = assets.some((a) => a.id === id)
    if (!exists) return false
    assets = assets.filter((a) => a.id !== id)
    return true
  },

  getTotalPatrimonialValue(): number {
    return assets
      .filter((a) => a.status === 'activo')
      .reduce((sum, a) => sum + a.patrimonialValueUsd, 0)
  },
}
