import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { LegacyAmountField } from '../utils/renewalProjectionCalc'

export type RenewalProjectionMode = 'FINANCIAL' | 'ECONOMIC'

export interface RenewalProjectionOverride {
  assetId: string
  mode: RenewalProjectionMode
  /** HISTÓRICO (solo lectura): Neto/IVA/Otros editados antes de la base USD, en ARS. Nunca se aplican a la proyección USD. */
  netOverride: number | null
  vatOverride: number | null
  otherOverride: number | null
  /** HISTÓRICO (solo lectura): % pensado para crecimiento en pesos. Nunca se aplica a la proyección USD. */
  growthPercentOverride: number | null
  /** Base USD vigente — null = valor automático (cierre USD histórico de la última factura). */
  netOverrideUsd: number | null
  vatOverrideUsd: number | null
  otherOverrideUsd: number | null
  /** % por ciclo sobre la base USD — null = 0 %. */
  growthPercentUsdOverride: number | null
  cycleLengthMonthsOverride: number | null
  installmentsCountOverride: number | null
  startMonthOverride: string | null
  /** Trazabilidad de la conversión confirmada ARS → USD de los importes históricos. */
  legacyConvertedRate: number | null
  legacyConvertedAt: string | null
  legacyConvertedBy: string | null
  updatedAt: string
}

/** Solo los campos vigentes — el backend rechaza (422) los históricos y la trazabilidad. */
export type RenewalProjectionOverrideInput = Partial<
  Pick<
    RenewalProjectionOverride,
    | 'netOverrideUsd'
    | 'vatOverrideUsd'
    | 'otherOverrideUsd'
    | 'growthPercentUsdOverride'
    | 'cycleLengthMonthsOverride'
    | 'installmentsCountOverride'
    | 'startMonthOverride'
  >
>

export interface ConvertLegacyOverridesInput {
  /** TC actual que el usuario vio en la vista previa — el backend rechaza si cambió. */
  expectedRate: number
  /** Campos exactos de la vista previa — el backend rechaza si ya no coinciden. */
  fields: LegacyAmountField[]
}

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

  async convertLegacy(assetId: string, mode: RenewalProjectionMode, data: ConvertLegacyOverridesInput): Promise<RenewalProjectionOverride> {
    const res = await apiClient.post<{ data: RenewalProjectionOverride }>(`/renewal-projections/overrides/${mode}/${assetId}/convert-legacy`, data)
    return res.data.data
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
