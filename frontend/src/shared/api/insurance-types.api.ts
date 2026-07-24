import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export interface InsuranceTypeConfig {
  id: string
  label: string
  coverages: string[]
  coverageObjects: { id: string; name: string }[]
}

interface BackendCoverage {
  id: string
  name: string
  description: string | null
  insuranceTypeId: string
}

interface BackendInsuranceType {
  id: string
  name: string
  description: string | null
  isActive: boolean
  coverages: BackendCoverage[]
}

interface PaginatedResponse<T> {
  data: T[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

function mapInsuranceType(b: BackendInsuranceType): InsuranceTypeConfig {
  return {
    id: b.id,
    label: b.name,
    coverages: b.coverages.map((c) => c.name),
    coverageObjects: b.coverages.map((c) => ({ id: c.id, name: c.name })),
  }
}

export const insuranceTypesApi = {
  async findAll(): Promise<InsuranceTypeConfig[]> {
    const res = await apiClient.get<PaginatedResponse<BackendInsuranceType>>('/insurance-types', {
      params: { limit: 200 },
    })
    const mapped = res.data.data.map(mapInsuranceType)
    return mapped
  },

  async create(label: string): Promise<InsuranceTypeConfig> {
    const res = await apiClient.post<{ data: BackendInsuranceType }>('/insurance-types', {
      name: label,
      coverages: [],
    })
    return mapInsuranceType(res.data.data)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/insurance-types/${id}`)
  },

  async addCoverage(typeId: string, coverageName: string): Promise<void> {
    await apiClient.post(`/insurance-types/${typeId}/coverages`, {
      name: coverageName.trim(),
    })
  },

  async removeCoverage(typeId: string, coverageName: string): Promise<void> {
    const res = await apiClient.get<{ data: BackendInsuranceType }>(`/insurance-types/${typeId}`)
    const coverage = res.data.data.coverages.find((c) => c.name === coverageName)
    if (!coverage) throw new Error(`Cobertura "${coverageName}" no encontrada`)
    await apiClient.delete(`/insurance-types/${typeId}/coverages/${coverage.id}`)
  },
}

// ── Query keys / query options (categoría A — estático, TTL largo) ──────────────

export const insuranceTypeKeys = {
  all: ['insurance-types'] as const,
}

export const insuranceTypeQueries = {
  list: () =>
    queryOptions({
      queryKey: insuranceTypeKeys.all,
      queryFn: () => insuranceTypesApi.findAll(),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      // Puede editarse en otra pestaña (ej. Configuración → Tipos de Seguro)
      // mientras un formulario queda abierto con datos a medio cargar acá.
      refetchOnWindowFocus: 'always',
    }),
}
