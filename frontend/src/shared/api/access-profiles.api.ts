import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { ModuleKey } from '../types'

export interface AccessProfile {
  id: string
  name: string
  modules: ModuleKey[]
  isActive: boolean
}

interface BackendAccessProfile {
  id: string
  name: string
  modules: string[]
  isActive: boolean
  createdAt: string
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

function mapAccessProfile(b: BackendAccessProfile): AccessProfile {
  return {
    id: b.id,
    name: b.name,
    modules: b.modules as ModuleKey[],
    isActive: b.isActive,
  }
}

export interface AccessProfileInput {
  name: string
  modules: ModuleKey[]
  isActive?: boolean
}

export const accessProfilesApi = {
  async findAll(): Promise<AccessProfile[]> {
    const res = await apiClient.get<PaginatedResponse<BackendAccessProfile>>('/access-profiles', {
      params: { limit: 200 },
    })
    return res.data.data.map(mapAccessProfile)
  },

  async create(input: AccessProfileInput): Promise<AccessProfile> {
    const res = await apiClient.post<{ data: BackendAccessProfile }>('/access-profiles', input)
    return mapAccessProfile(res.data.data)
  },

  async update(id: string, input: Partial<AccessProfileInput>): Promise<AccessProfile> {
    const res = await apiClient.put<{ data: BackendAccessProfile }>(`/access-profiles/${id}`, input)
    return mapAccessProfile(res.data.data)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/access-profiles/${id}`)
  },
}

// ── Query keys / query options (categoría A — estático, TTL largo) ──────────────

export const accessProfileKeys = {
  all: ['access-profiles'] as const,
}

export const accessProfileQueries = {
  list: () =>
    queryOptions({
      queryKey: accessProfileKeys.all,
      queryFn: () => accessProfilesApi.findAll(),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
    }),
}
