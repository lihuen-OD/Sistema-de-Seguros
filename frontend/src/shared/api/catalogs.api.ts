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
