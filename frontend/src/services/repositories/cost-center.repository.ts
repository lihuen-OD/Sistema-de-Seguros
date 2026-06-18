import type { CostCenter } from '../../shared/types'
import { mockCostCenters } from '../../data/mock-cost-centers'

let costCenters: CostCenter[] = [...mockCostCenters]
let idSeq = costCenters.length + 1

export interface CostCenterInput {
  name: string
  companyId: string
  area: string
  status: 'activo' | 'inactivo'
}

export const costCenterRepository = {
  findAll(): CostCenter[] {
    return [...costCenters]
  },

  findById(id: string): CostCenter | undefined {
    return costCenters.find((cc) => cc.id === id)
  },

  findByCompany(companyId: string): CostCenter[] {
    return costCenters.filter((cc) => cc.companyId === companyId)
  },

  create(input: CostCenterInput): CostCenter {
    const seq = String(idSeq).padStart(3, '0')
    const code = `CC-${seq}`
    const cc: CostCenter = {
      id: `cc-${idSeq++}`,
      code,
      name: input.name.trim(),
      companyId: input.companyId,
      area: input.area.trim(),
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
      ...(input.companyId !== undefined && { companyId: input.companyId }),
      ...(input.area !== undefined && { area: input.area.trim() }),
      ...(input.status !== undefined && { status: input.status }),
    }
    costCenters = costCenters.map((cc) => (cc.id === id ? updated : cc))
    const idx = mockCostCenters.findIndex((cc) => cc.id === id)
    if (idx !== -1) mockCostCenters[idx] = updated
    return updated
  },
}
