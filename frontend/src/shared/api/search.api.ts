import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { AssetSearchResult } from './assets.api'
import { mapPolicySearchResult, type BackendPolicySearchResult, type PolicySearchResult } from './policies.api'
import type { DocumentSearchResult } from './documents.api'
import type { DocumentStatus } from '../types'

// Buscador global del Topbar (GET /search). Cada grupo trae el mismo
// contrato liviano que el /search de su módulo; un grupo ausente significa
// que el usuario no tiene el módulo que abre ese detalle.
export interface GlobalSearchGroup<T> {
  items: T[]
  hasMore: boolean
}

export type GlobalDocumentSearchResult = DocumentSearchResult & { documentStatus: DocumentStatus }

export interface GlobalSearchResults {
  assets?: GlobalSearchGroup<AssetSearchResult>
  policies?: GlobalSearchGroup<PolicySearchResult>
  documents?: GlobalSearchGroup<GlobalDocumentSearchResult>
}

interface BackendGlobalSearchResults {
  assets?: GlobalSearchGroup<AssetSearchResult>
  policies?: GlobalSearchGroup<BackendPolicySearchResult>
  documents?: GlobalSearchGroup<GlobalDocumentSearchResult>
}

export const searchApi = {
  async global(q: string, signal?: AbortSignal): Promise<GlobalSearchResults> {
    const res = await apiClient.get<{ data: BackendGlobalSearchResults }>('/search', { params: { q }, signal })
    const { policies, ...rest } = res.data.data
    return {
      ...rest,
      ...(policies && { policies: { ...policies, items: policies.items.map(mapPolicySearchResult) } }),
    }
  },
}

export const searchKeys = {
  all: ['global-search'] as const,
  global: (q: string) => [...searchKeys.all, q] as const,
}

export const searchQueries = {
  // `signal` hace que React Query aborte el request de una búsqueda que dejó
  // de mirarse (el usuario siguió tipeando). keepPreviousData deja los
  // resultados anteriores en pantalla mientras llega el nuevo término, en vez
  // de parpadear a vacío. Sin reintento ni refetch al volver a la pestaña:
  // ante un error el panel ofrece "Reintentar", y un resultado de hace
  // segundos no justifica otro request.
  global: (q: string) =>
    queryOptions({
      queryKey: searchKeys.global(q),
      queryFn: ({ signal }) => searchApi.global(q, signal),
      staleTime: 30 * 1000,
      placeholderData: keepPreviousData,
      retry: false,
      refetchOnWindowFocus: false,
    }),
}
