import { queryOptions } from '@tanstack/react-query'
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

export interface CompanyAssetCounts {
  byCompanyId: Record<string, number>
  /** Total de activos en estado 'activo' (KPI "Activos Asociados"). */
  activeAssets: number
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

  async findAssetCounts(): Promise<CompanyAssetCounts> {
    const res = await apiClient.get<PaginatedResponse<BackendCompany & { activeAssetCount: number }> & { summary: { activeAssets: number } }>(
      '/companies',
      { params: { limit: 200, includeAssetCounts: true } },
    )
    return {
      byCompanyId: Object.fromEntries(res.data.data.map((c) => [c.id, c.activeAssetCount])),
      activeAssets: res.data.summary.activeAssets,
    }
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

// ── Query keys / query options (categoría A — estático, TTL largo) ──────────────

export const companyKeys = {
  all: ['companies'] as const,
}

export const companyQueries = {
  list: () =>
    queryOptions({
      queryKey: companyKeys.all,
      queryFn: () => companiesApi.findAll(),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      // Puede editarse en otra pestaña (ej. Configuración → Empresas)
      // mientras un formulario queda abierto con datos a medio cargar acá.
      refetchOnWindowFocus: 'always',
    }),
// Conteo real de activos en estado 'activo' por empresa (Fase 3D), calculado
// en el backend (includeAssetCounts) — reemplaza contar en la pantalla sobre
// /assets?limit=200. Por imputación principal (la de mayor %). Clave bajo companyKeys.all: las invalidaciones de alta/
// edición la refrescan; staleTime corto porque cambia con los activos, no con
// el catálogo.
  assetCounts: () =>
    queryOptions({
      queryKey: [...companyKeys.all, 'asset-counts'] as const,
      queryFn: () => companiesApi.findAssetCounts(),
      staleTime: 60 * 1000,
    }),
}
