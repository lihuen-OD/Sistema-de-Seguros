import { apiClient } from './client'
import type { Asset, AssetAttachment, AssetStatus } from '../types'

interface BackendCompany { id: string; name: string; cuit: string }
interface BackendCostCenter { id: string; name: string; code: string | null }
interface BackendAllocation {
  id: string; assetId: string
  companyId: string; company: BackendCompany
  costCenterId: string; costCenter: BackendCostCenter
  percentage: number
}
interface BackendValueHistory {
  id: string; assetId: string; date: string; valueUsd: number; notes: string | null
}
interface BackendAsset {
  id: string; code: string | null; name: string; assetType: string
  status: string | null; fixedAssetCode: string | null
  brand: string | null; model: string | null
  year: number | null; serialNumber: string | null
  purchaseDate: string | null; purchaseValue: number | null
  currentValue: number | null; location: string | null; mapsUrl: string | null
  productiveUnit: string | null; area: string | null
  description: string | null; metadata: Record<string, unknown> | null
  isActive: boolean; createdAt: string; updatedAt: string
  allocations: BackendAllocation[]
  valueHistory?: BackendValueHistory[]
  _count?: { attachments: number; fireExtinguishers: number }
}
interface BackendAttachment {
  id: string; assetId: string; name: string; description: string | null; fileType: string
  fileSize: string; fileUrl: string; expirationDate: string | null; notifyEmail: string | null; uploadedAt: string; uploadedBy: string
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function mapAsset(b: BackendAsset): Asset {
  const primary = b.allocations[0]
  const meta = (b.metadata ?? {}) as Record<string, unknown>
  return {
    id: b.id,
    internalCode: b.code ?? `ACT-${b.id.slice(0, 8).toUpperCase()}`,
    fixedAssetCode: b.fixedAssetCode ?? '',
    name: b.name,
    assetType: b.assetType,
    brand: b.brand ?? '',
    model: b.model ?? '',
    year: b.year ?? (b.purchaseDate ? parseInt(b.purchaseDate.slice(0, 4)) : 0),
    serialNumber: b.serialNumber ?? '',
    chassisNumber: (meta.chassisNumber as string) ?? '',
    status: (b.status ?? (b.isActive ? 'activo' : 'baja')) as AssetStatus,
    patrimonialValueUsd: b.currentValue ?? b.purchaseValue ?? 0,
    valuationDate: b.purchaseDate ? b.purchaseDate.slice(0, 10) : '',
    observations: b.description ?? '',
    mapsUrl: b.mapsUrl ?? '',
    companyId: primary?.company?.id ?? '',
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
      ? b.valueHistory.map((v) => ({ id: v.id, date: v.date, valueUsd: v.valueUsd, notes: v.notes ?? undefined }))
      : undefined,
    silos: (() => {
      const metaSilos = meta.silos as Array<{ capacityTons: number; content: string }> | undefined
      if (!metaSilos || metaSilos.length === 0) return undefined
      return metaSilos.map((s, i) => ({ id: `silo-${i}`, capacityTons: s.capacityTons, content: s.content }))
    })(),
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
    expirationDate: a.expirationDate ?? null,
    notifyEmail: a.notifyEmail ?? undefined,
    uploadedAt: a.uploadedAt, uploadedBy: a.uploadedBy,
  }
}

export interface AddAttachmentInput {
  file: File
  description?: string
  expirationDate?: string
  notifyEmail?: string
}

export interface AssetCreateInput {
  name: string
  assetType: string
  status?: string
  fixedAssetCode?: string
  brand?: string
  model?: string
  year?: number
  serialNumber?: string
  purchaseDate?: string
  currentValue?: number
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

  async update(id: string, input: Partial<Omit<AssetCreateInput, 'allocations'>>): Promise<Asset> {
    const res = await apiClient.put<{ data: BackendAsset }>(`/assets/${id}`, input)
    return mapAsset(res.data.data)
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
    if (input.notifyEmail) form.append('notifyEmail', input.notifyEmail)
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
}
