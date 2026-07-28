import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { CostCenter } from '../types'

interface BackendCostCenter {
  id: string
  name: string
  code: string | null
  description: string | null
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
    description: b.description ?? '',
    status: b.isActive ? 'activo' : 'inactivo',
  }
}

export interface CostCenterInput {
  name: string
  description?: string
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
      description: input.description?.trim() || undefined,
      isActive: input.status === 'activo',
    })
    return mapCostCenter(res.data.data)
  },

  async update(id: string, input: Partial<CostCenterInput>): Promise<CostCenter> {
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) body.name = input.name.trim()
    if (input.description !== undefined) body.description = input.description.trim() || null
    if (input.status !== undefined) body.isActive = input.status === 'activo'
    const res = await apiClient.put<{ data: BackendCostCenter }>(`/cost-centers/${id}`, body)
    return mapCostCenter(res.data.data)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/cost-centers/${id}`)
  },
}

// ── Query keys / query options (categoría A — estático, TTL largo) ──────────────

export const costCenterKeys = {
  all: ['cost-centers'] as const,
}

export const costCenterQueries = {
  list: () =>
    queryOptions({
      queryKey: costCenterKeys.all,
      queryFn: () => costCentersApi.findAll(),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      // Puede editarse en otra pestaña (ej. Configuración → Centros de Costo)
      // mientras un formulario queda abierto con datos a medio cargar acá.
      refetchOnWindowFocus: 'always',
    }),
}
