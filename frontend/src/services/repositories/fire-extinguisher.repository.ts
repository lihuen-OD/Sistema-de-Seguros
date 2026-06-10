import type { FireExtinguisher, FireExtinguisherHistory } from '../../shared/types'
import { mockFireExtinguishers, mockFireExtinguisherHistory } from '../../data/mock-fire-extinguishers'

export const fireExtinguisherRepository = {
  findAll(): FireExtinguisher[] {
    return [...mockFireExtinguishers]
  },

  findById(id: string): FireExtinguisher | undefined {
    return mockFireExtinguishers.find((f) => f.id === id)
  },

  findByAsset(assetId: string): FireExtinguisher[] {
    return mockFireExtinguishers.filter((f) => f.associatedAssetId === assetId)
  },

  findByStatus(status: FireExtinguisher['status']): FireExtinguisher[] {
    return mockFireExtinguishers.filter((f) => f.status === status)
  },

  findByLocationType(type: FireExtinguisher['associatedLocationType']): FireExtinguisher[] {
    return mockFireExtinguishers.filter((f) => f.associatedLocationType === type)
  },

  findHistoryByExtinguisher(id: string): FireExtinguisherHistory[] {
    return mockFireExtinguisherHistory.filter((h) => h.fireExtinguisherId === id)
  },

  getCountByStatus() {
    return {
      vigente: mockFireExtinguishers.filter((f) => f.status === 'vigente').length,
      proximo_vencer: mockFireExtinguishers.filter((f) => f.status === 'proximo_vencer').length,
      vencido: mockFireExtinguishers.filter((f) => f.status === 'vencido').length,
    }
  },

  search(query: string): FireExtinguisher[] {
    const q = query.toLowerCase()
    return mockFireExtinguishers.filter(
      (f) =>
        f.code.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q) ||
        f.observations.toLowerCase().includes(q),
    )
  },
}
