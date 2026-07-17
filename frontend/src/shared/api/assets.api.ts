import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import { triggerBlobDownload } from '../utils/downloadFile'
import type { Asset, AssetAttachment, AssetStatus, AssetStatusHistory, Building } from '../types'

interface BackendCompany { id: string; name: string; cuit: string }
interface BackendCostCenter { id: string; name: string; code: string | null }
interface BackendAllocation {
  id: string; assetId?: string
  companyId: string; company?: BackendCompany
  costCenterId: string; costCenter?: BackendCostCenter
  percentage: number
}
interface BackendValueHistory {
  id: string; assetId: string; date: string; value: number; type: string; note: string | null
}
interface BackendFixedAssetRef { id: string; code: string; name: string }
interface BackendAsset {
  id: string; code: string | null; name: string; assetType: string
  status: string | null; fixedAssetId: string | null; fixedAsset: BackendFixedAssetRef | null
  brand: string | null; model: string | null
  year: number | null; serialNumber: string | null
  purchaseDate: string | null; dischargeDate: string | null; saleDate: string | null
  purchaseValue: number | null
  currentValue: number | null; patrimonialValueNew: number | null
  location: string | null; mapsUrl: string | null
  productiveUnit: string | null; area: string | null
  description: string | null; metadata: Record<string, unknown> | null
  isActive: boolean; createdAt: string; updatedAt: string
  allocations: BackendAllocation[]
  valueHistory?: BackendValueHistory[]
  _count?: { attachments: number; fireExtinguishers: number }
}
interface BackendAttachment {
  id: string; assetId: string; name: string; description: string | null; fileType: string
  fileSize: string; fileUrl: string; expirationDate: string | null; uploadedAt: string; uploadedBy: string
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function parseCoordinatesFromMapsUrl(url: string | null | undefined): { lat: number; lng: number } | undefined {
  if (!url) return undefined
  const match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
  if (!match) return undefined
  return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
}

function mapAsset(b: BackendAsset): Asset {
  const primary = b.allocations[0]
  const meta = (b.metadata ?? {}) as Record<string, unknown>
  return {
    id: b.id,
    internalCode: b.code ?? `ACT-${b.id.slice(0, 8).toUpperCase()}`,
    fixedAssetId: b.fixedAssetId,
    fixedAsset: b.fixedAsset,
    name: b.name,
    assetType: b.assetType,
    brand: b.brand ?? '',
    model: b.model ?? '',
    year: b.year ?? (b.purchaseDate ? parseInt(b.purchaseDate.slice(0, 4)) : 0),
    serialNumber: b.serialNumber ?? '',
    chassisNumber: (meta.chassisNumber as string) ?? '',
    engineNumber: (meta.engineNumber as string) || undefined,
    status: (b.status ?? (b.isActive ? 'activo' : 'baja')) as AssetStatus,
    patrimonialValueUsd: b.currentValue ?? b.purchaseValue ?? 0,
    patrimonialValueNew: b.patrimonialValueNew ?? null,
    valuationDate: b.purchaseDate ? b.purchaseDate.slice(0, 10) : '',
    observations: b.description ?? '',
    mapsUrl: b.mapsUrl ?? '',
    coordinates: parseCoordinatesFromMapsUrl(b.mapsUrl),
    companyId: primary?.company?.id ?? primary?.companyId ?? '',
    costCenterId: primary?.costCenterId ?? '',
    allocations: b.allocations.map((a) => ({
      id: a.id,
      companyId: a.companyId,
      costCenterId: a.costCenterId,
      percentage: a.percentage,
    })),
    metadata: meta,
    productiveUnit: b.productiveUnit ?? '',
    area: b.area ?? '',
    photos: [],
    valueHistory: b.valueHistory
      ? b.valueHistory.map((v) => ({ id: v.id, date: v.date.slice(0, 10), valueUsd: v.value, type: (v.type ?? 'real') as 'real' | 'nuevo', notes: v.note ?? undefined }))
      : undefined,
    silos: (() => {
      const metaSilos = meta.silos as Array<{ capacityTons: number; content: string }> | undefined
      if (!metaSilos || metaSilos.length === 0) return undefined
      return metaSilos.map((s, i) => ({ id: `silo-${i}`, capacityTons: s.capacityTons, content: s.content }))
    })(),
    buildings: (() => {
      const metaBuildings = meta.buildings as Array<{ name: string; surfaceM2?: number; purpose?: string; constructionType?: string; constructionYear?: number }> | undefined
      if (!metaBuildings || metaBuildings.length === 0) return undefined
      return metaBuildings.map((b, i): Building => ({ id: `building-${i}`, name: b.name, surfaceM2: b.surfaceM2, purpose: b.purpose, constructionType: b.constructionType, constructionYear: b.constructionYear }))
    })(),
    attachmentsCount: b._count?.attachments ?? 0,
    dischargeDate: b.dischargeDate ? b.dischargeDate.slice(0, 10) : null,
    saleDate: b.saleDate ? b.saleDate.slice(0, 10) : null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

function mapAttachment(a: BackendAttachment): AssetAttachment {
  const fileType = a.fileType as AssetAttachment['fileType']
  return {
    id: a.id, assetId: a.assetId, name: a.name,
    description: a.description ?? '', fileType, fileSize: a.fileSize,
    fileUrl: a.fileUrl,
    expirationDate: a.expirationDate ? a.expirationDate.slice(0, 10) : null,
    uploadedAt: a.uploadedAt, uploadedBy: a.uploadedBy,
  }
}

export interface AddAttachmentInput {
  file: File
  description?: string
  expirationDate?: string
}

export interface AssetCreateInput {
  name: string
  assetType: string
  status?: string
  fixedAssetId?: string | null
  brand?: string
  model?: string
  year?: number
  serialNumber?: string
  purchaseDate?: string
  dischargeDate?: string | null
  saleDate?: string | null
  reactivationDate?: string | null
  currentValue?: number
  patrimonialValueNew?: number
  mapsUrl?: string
  productiveUnit?: string
  area?: string
  description?: string
  metadata?: Record<string, unknown>
  allocations: { companyId: string; costCenterId: string; percentage: number }[]
}

export const assetsApi = {
  async findAll(): Promise<Asset[]> {
    const res = await apiClient.get<Paginated<BackendAsset>>('/assets', { params: { limit: 200 } })
    return res.data.data.map(mapAsset)
  },

  async findById(id: string): Promise<Asset> {
    const res = await apiClient.get<{ data: BackendAsset }>(`/assets/${id}`)
    return mapAsset(res.data.data)
  },

  async create(input: AssetCreateInput): Promise<Asset> {
    const res = await apiClient.post<{ data: BackendAsset }>('/assets', input)
    return mapAsset(res.data.data)
  },

  async update(id: string, input: Partial<Omit<AssetCreateInput, 'allocations'>>): Promise<void> {
    await apiClient.put(`/assets/${id}`, input)
  },

  async replaceAllocations(id: string, allocations: { companyId: string; costCenterId: string; percentage: number }[]): Promise<void> {
    await apiClient.put(`/assets/${id}/allocations`, { allocations })
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/assets/${id}`)
  },

  async findAttachments(assetId: string): Promise<AssetAttachment[]> {
    const res = await apiClient.get<{ data: BackendAttachment[] }>(`/assets/${assetId}/attachments`)
    return res.data.data.map(mapAttachment)
  },

  async addAttachment(assetId: string, input: AddAttachmentInput): Promise<AssetAttachment> {
    const form = new FormData()
    form.append('file', input.file)
    if (input.description) form.append('description', input.description)
    if (input.expirationDate) form.append('expirationDate', input.expirationDate)
    const res = await apiClient.post<{ data: BackendAttachment }>(
      `/assets/${assetId}/attachments`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    )
    return mapAttachment(res.data.data)
  },

  async deleteAttachment(assetId: string, attachmentId: string): Promise<void> {
    await apiClient.delete(`/assets/${assetId}/attachments/${attachmentId}`)
  },

  async downloadAttachment(assetId: string, attachmentId: string, filename: string): Promise<void> {
    const res = await apiClient.get(`/assets/${assetId}/attachments/${attachmentId}/download`, { responseType: 'blob' })
    triggerBlobDownload(res.data, filename)
  },

  async addValueHistory(assetId: string, entry: { value: number; date: string; type: 'real' | 'nuevo'; note?: string }): Promise<void> {
    await apiClient.post(`/assets/${assetId}/value-history`, entry)
  },

  async findStatusHistory(assetId: string): Promise<AssetStatusHistory[]> {
    const res = await apiClient.get<{ data: AssetStatusHistory[] }>(`/assets/${assetId}/status-history`)
    return res.data.data.map((h) => ({ ...h, date: h.date.slice(0, 10) }))
  },
}

// ── Query keys / query options (categoría B — semi-dinámico) ────────────────────
// Las keys reproducen EXACTAMENTE los arrays literales ya usados en toda la app
// (`['assets']`, `['assets', id]`, etc.) para no fragmentar cache mientras se
// migran los call sites — no se inventa un esquema nuevo de sub-namespacing.

export const assetKeys = {
  all: ['assets'] as const,
  detail: (id: string) => [...assetKeys.all, id] as const,
  attachments: (id: string) => [...assetKeys.all, id, 'attachments'] as const,
  statusHistory: (id: string) => ['asset-status-history', id] as const,
}

export const assetQueries = {
  list: () =>
    queryOptions({
      queryKey: assetKeys.all,
      queryFn: () => assetsApi.findAll(),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: assetKeys.detail(id),
      queryFn: () => assetsApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  attachments: (id: string) =>
    queryOptions({
      queryKey: assetKeys.attachments(id),
      queryFn: () => assetsApi.findAttachments(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  statusHistory: (id: string) =>
    queryOptions({
      queryKey: assetKeys.statusHistory(id),
      queryFn: () => assetsApi.findStatusHistory(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
}
