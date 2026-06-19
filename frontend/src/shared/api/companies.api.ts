import { apiClient } from './client'
import type { Company } from '../types'

interface BackendCompany {
  id: string
  name: string
  cuit: string | null
  email: string | null
  phone: string | null
  address: string | null
  isActive: boolean
  createdAt: string
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

function mapCompany(b: BackendCompany): Company {
  return {
    id: b.id,
    name: b.name,
    taxId: b.cuit ?? '',
    status: b.isActive ? 'activo' : 'inactivo',
    createdAt: b.createdAt,
  }
}

export interface CompanyInput {
  name: string
  taxId: string
  status: 'activo' | 'inactivo'
}

export const companiesApi = {
  async findAll(): Promise<Company[]> {
    const res = await apiClient.get<PaginatedResponse<BackendCompany>>('/companies', {
      params: { limit: 200 },
    })
    return res.data.data.map(mapCompany)
  },

  async findActive(): Promise<Company[]> {
    const res = await apiClient.get<PaginatedResponse<BackendCompany>>('/companies', {
      params: { limit: 200, isActive: true },
    })
    return res.data.data.map(mapCompany)
  },

  async create(input: CompanyInput): Promise<Company> {
    const res = await apiClient.post<{ data: BackendCompany }>('/companies', {
      name: input.name.trim(),
      cuit: input.taxId.trim() || undefined,
      ...(input.status === 'inactivo' && { isActive: false }),
    })
    return mapCompany(res.data.data)
  },

  async update(id: string, input: Partial<CompanyInput>): Promise<Company> {
    const body: Record<string, unknown> = {}
    if (input.name !== undefined) body.name = input.name.trim()
    if (input.taxId !== undefined) body.cuit = input.taxId.trim() || undefined
    if (input.status !== undefined) body.isActive = input.status === 'activo'
    const res = await apiClient.put<{ data: BackendCompany }>(`/companies/${id}`, body)
    return mapCompany(res.data.data)
  },
}
