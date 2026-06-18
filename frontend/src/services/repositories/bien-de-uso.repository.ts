import type { BienDeUso } from '../../shared/types'
import { mockBienesDeUso } from '../../data/mock-bienes-de-uso'

export const bienDeUsoRepository = {
  findAll(): BienDeUso[] {
    return [...mockBienesDeUso]
  },

  findById(id: string): BienDeUso | undefined {
    return mockBienesDeUso.find((b) => b.id === id)
  },

  findByCategory(category: string): BienDeUso[] {
    return mockBienesDeUso.filter((b) => b.category === category)
  },

  findByCategories(categories: string[]): BienDeUso[] {
    if (!categories.length) return [...mockBienesDeUso]
    return mockBienesDeUso.filter((b) => categories.includes(b.category))
  },
}
