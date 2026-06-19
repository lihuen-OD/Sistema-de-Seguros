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
    apiClient.get<CatalogItem[]>(`/catalogs/${category}`).then((r) => r.data),

  findAllByCategory: (category: string) =>
    apiClient.get<CatalogItem[]>(`/catalogs/${category}/all`).then((r) => r.data),

  create: (category: string, label: string, sortOrder?: number) =>
    apiClient.post<CatalogItem>(`/catalogs/${category}`, { label, sortOrder }).then((r) => r.data),

  update: (category: string, id: string, data: { label?: string; sortOrder?: number; isActive?: boolean }) =>
    apiClient.patch<CatalogItem>(`/catalogs/${category}/${id}`, data).then((r) => r.data),

  delete: (category: string, id: string) =>
    apiClient.delete(`/catalogs/${category}/${id}`).then((r) => r.data),
}
