import { apiClient } from './client'
import type { CostCenter } from '../types'

interface BackendCostCenter {
  id: string
  name: string
  code: string | null
  companyId: string | null
  area: string | null
  isActive: boolean
  createdAt: string
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

function mapCostCenter(b: BackendCostCenter): CostCenter {
  return {
    id: b.id,
    code: b.code ?? '',
    name: b.name,
    companyId: b.companyId ?? '',
    area: b.area ?? '',
    status: b.isActive ? 'activo' : 'inactivo',
  }
}

export interface CostCenterInput {
  name: string
  companyId: string
  area: string
  status: 'activo' | 'inactivo'
}

export const costCentersApi = {
  async findAll(): Promise<CostCenter[]> {
    const res = await apiClient.get<PaginatedResponse<BackendCostCenter>>('/cost-centers', {
      params: { limit: 200 },
    })
    return res.data.data.map(mapCostCenter)
  },

  async create(input: CostCenterInput): Promise<CostCenter> {
    const res = await apiClient.post<{ data: BackendCostCenter }>('/cost-centers', {
      name: input.name.trim(),
      companyId: input.companyId || undefined,
      area: input.area.trim() || undefined,
      ...(input.status === 'inactivo' && { isActive: false }),
    })
    return mapCostCenter(res.data.data)
  },

  async update(id: string, input: Partial<CostCenterInput>): Promise<CostCenter> {
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) body.name = input.name.trim()
    if (input.companyId !== undefined) body.companyId = input.companyId || null
    if (input.area !== undefined) body.area = input.area.trim() || null
    if (input.status !== undefined) body.isActive = input.status === 'activo'
    const res = await apiClient.put<{ data: BackendCostCenter }>(`/cost-centers/${id}`, body)
    return mapCostCenter(res.data.data)
  },
}
