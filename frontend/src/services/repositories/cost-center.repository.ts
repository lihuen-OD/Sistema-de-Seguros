import type { CostCenter } from '../../shared/types'
import { mockCostCenters } from '../../data/mock-cost-centers'

let costCenters: CostCenter[] = [...mockCostCenters]
let idSeq = costCenters.length + 1

export interface CostCenterInput {
  name: string
  description?: string
  status: 'activo' | 'inactivo'
}

export const costCenterRepository = {
  findAll(): CostCenter[] {
    return [...costCenters]
  },

  findById(id: string): CostCenter | undefined {
    return costCenters.find((cc) => cc.id === id)
  },

  create(input: CostCenterInput): CostCenter {
    const seq = String(idSeq).padStart(3, '0')
    const code = `CC-${seq}`
    const cc: CostCenter = {
      id: `cc-${idSeq++}`,
      code,
      name: input.name.trim(),
      description: input.description?.trim() ?? '',
      status: input.status,
    }
    costCenters = [...costCenters, cc]
    mockCostCenters.push(cc)
    return cc
  },

  update(id: string, input: Partial<CostCenterInput>): CostCenter | null {
    const existing = costCenters.find((cc) => cc.id === id)
    if (!existing) return null
    const updated: CostCenter = {
      ...existing,
      ...(input.name !== undefined && { name: input.name.trim() }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.status !== undefined && { status: input.status }),
    }
    costCenters = costCenters.map((cc) => (cc.id === id ? updated : cc))
    const idx = mockCostCenters.findIndex((cc) => cc.id === id)
    if (idx !== -1) mockCostCenters[idx] = updated
    return updated
  },

  delete(id: string): boolean {
    const exists = costCenters.some((cc) => cc.id === id)
    if (!exists) return false
    costCenters = costCenters.filter((cc) => cc.id !== id)
    const idx = mockCostCenters.findIndex((cc) => cc.id === id)
    if (idx !== -1) mockCostCenters.splice(idx, 1)
    return true
  },
}
