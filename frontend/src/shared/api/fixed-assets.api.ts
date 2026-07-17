import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { BienDeUso } from '../types'

interface BackendFixedAsset {
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

function mapFixedAsset(b: BackendFixedAsset): BienDeUso {
  return {
    id: b.id,
    code: b.code ?? '',
    name: b.name,
    description: b.description ?? '',
    status: b.isActive ? 'activo' : 'inactivo',
  }
}

export interface FixedAssetInput {
  name: string
  description?: string
  status: 'activo' | 'inactivo'
}

export const fixedAssetsApi = {
  async findAll(): Promise<BienDeUso[]> {
    const res = await apiClient.get<PaginatedResponse<BackendFixedAsset>>('/fixed-assets', {
      params: { limit: 200 },
    })
    return res.data.data.map(mapFixedAsset)
  },

  async create(input: FixedAssetInput): Promise<BienDeUso> {
    const res = await apiClient.post<{ data: BackendFixedAsset }>('/fixed-assets', {
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      isActive: input.status === 'activo',
    })
    return mapFixedAsset(res.data.data)
  },

  async update(id: string, input: Partial<FixedAssetInput>): Promise<BienDeUso> {
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) body.name = input.name.trim()
    if (input.description !== undefined) body.description = input.description.trim() || null
    if (input.status !== undefined) body.isActive = input.status === 'activo'
    const res = await apiClient.put<{ data: BackendFixedAsset }>(`/fixed-assets/${id}`, body)
    return mapFixedAsset(res.data.data)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/fixed-assets/${id}`)
  },
}

// ── Query keys / query options (categoría A — estático, TTL largo) ──────────────

export const fixedAssetKeys = {
  all: ['fixed-assets'] as const,
}

export const fixedAssetQueries = {
  list: () =>
    queryOptions({
      queryKey: fixedAssetKeys.all,
      queryFn: () => fixedAssetsApi.findAll(),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    }),
}
