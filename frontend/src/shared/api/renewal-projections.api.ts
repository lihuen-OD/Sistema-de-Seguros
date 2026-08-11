import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export type RenewalProjectionMode = 'FINANCIAL' | 'ECONOMIC'

export interface RenewalProjectionOverride {
  assetId: string
  mode: RenewalProjectionMode
  netOverride: number | null
  vatOverride: number | null
  otherOverride: number | null
  growthPercentOverride: number | null
  cycleLengthMonthsOverride: number | null
  installmentsCountOverride: number | null
  startMonthOverride: string | null
}

export type RenewalProjectionOverrideInput = Partial<Omit<RenewalProjectionOverride, 'assetId' | 'mode'>>

export const renewalProjectionsApi = {
  async findAll(mode: RenewalProjectionMode): Promise<RenewalProjectionOverride[]> {
    const res = await apiClient.get<{ data: RenewalProjectionOverride[] }>(`/renewal-projections/overrides/${mode}`)
    return res.data.data
  },

  async upsert(assetId: string, mode: RenewalProjectionMode, data: RenewalProjectionOverrideInput): Promise<RenewalProjectionOverride> {
    const res = await apiClient.put<{ data: RenewalProjectionOverride }>(`/renewal-projections/overrides/${mode}/${assetId}`, data)
    return res.data.data
  },

  async reset(assetId: string, mode: RenewalProjectionMode): Promise<void> {
    await apiClient.delete(`/renewal-projections/overrides/${mode}/${assetId}`)
  },
}

// Tabla chica (una fila por activo+modo con algún override activo) — sin
// paginar, se indexa por assetId en memoria del lado del cliente. Financiero
// y Económico cachean por separado (mismo assetId, dos modos, dos números).
export const renewalProjectionKeys = {
  all: (mode: RenewalProjectionMode) => ['renewal-projections', mode] as const,
}

export const renewalProjectionQueries = {
  overrides: (mode: RenewalProjectionMode) =>
    queryOptions({
      queryKey: renewalProjectionKeys.all(mode),
      queryFn: () => renewalProjectionsApi.findAll(mode),
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
    }),
}
