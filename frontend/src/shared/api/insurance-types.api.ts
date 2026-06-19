import { apiClient } from './client'
import type { InsuranceTypeConfig } from '../../data/mock-insurance-settings'
import { insuranceTypeRepository } from '../../services/repositories/insurance-type.repository'

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
  }
}

export const insuranceTypesApi = {
  async findAll(): Promise<InsuranceTypeConfig[]> {
    const res = await apiClient.get<PaginatedResponse<BackendInsuranceType>>('/insurance-types', {
      params: { limit: 200 },
    })
    const mapped = res.data.data.map(mapInsuranceType)
    // Keep mock repository in sync for modules not yet integrated (e.g. policy forms)
    insuranceTypeRepository.replaceAll(mapped)
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
