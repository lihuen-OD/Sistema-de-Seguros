import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export interface CatalogItem {
  id: string
  category: string
  label: string
  sortOrder: number
  isActive: boolean
  createdAt: string
}

export const catalogsApi = {
  findByCategory: (category: string) =>
    apiClient.get<{ data: CatalogItem[] }>(`/catalogs/${category}`).then((r) => r.data.data),

  findAllByCategory: (category: string) =>
    apiClient.get<{ data: CatalogItem[] }>(`/catalogs/${category}/all`).then((r) => r.data.data),

  create: (category: string, label: string, sortOrder?: number) =>
    apiClient.post<{ data: CatalogItem }>(`/catalogs/${category}`, { label, sortOrder }).then((r) => r.data.data),

  update: (category: string, id: string, data: { label?: string; sortOrder?: number; isActive?: boolean }) =>
    apiClient.patch<{ data: CatalogItem }>(`/catalogs/${category}/${id}`, data).then((r) => r.data.data),

  delete: (category: string, id: string) =>
    apiClient.delete<{ data: { message: string } }>(`/catalogs/${category}/${id}`).then((r) => r.data.data),
}

// ── Query keys / query options (categoría A — estático, TTL largo) ──────────────

export const catalogKeys = {
  all: ['catalogs'] as const,
  byCategory: (category: string) => [...catalogKeys.all, category] as const,
  allByCategory: (category: string) => [...catalogKeys.all, category, 'all'] as const,
}

export const catalogQueries = {
  byCategory: (category: string) =>
    queryOptions({
      queryKey: catalogKeys.byCategory(category),
      queryFn: () => catalogsApi.findByCategory(category),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      // Se puede estar editando este catálogo en otra pestaña (ej. Config.
      // Módulos) mientras esta queda abierta con un formulario a medio
      // completar — 'always' fuerza el refetch al volver a esta pestaña sin
      // importar el staleTime, para que el desplegable muestre lo nuevo sin
      // perder los datos ya cargados en el resto del formulario.
      refetchOnWindowFocus: 'always',
    }),
  allByCategory: (category: string) =>
    queryOptions({
      queryKey: catalogKeys.allByCategory(category),
      queryFn: () => catalogsApi.findAllByCategory(category),
      staleTime: 30 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      refetchOnWindowFocus: 'always',
    }),
}
