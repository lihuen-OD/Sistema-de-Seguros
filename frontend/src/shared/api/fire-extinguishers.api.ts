import { apiClient } from './client'
import type { FireExtinguisher, FireExtinguisherHistory, AssociatedLocationType, FireExtStatus } from '../types'

interface BackendHistory {
  id: string; fireExtinguisherId: string; eventType: string; eventDate: string
  previousValue: string; newValue: string; observations: string; createdBy: string; createdAt: string
}
interface BackendExtinguisher {
  id: string; code: string | null; type: string; capacity: string
  chargeDate: string | null; expirationDate: string; associatedAssetId: string | null
  associatedLocationType: string; status: string; observations: string
  brand: string | null; serialNumber: string | null
  isActive: boolean; createdAt: string; updatedAt: string
  history?: BackendHistory[]
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

function mapHistory(h: BackendHistory): FireExtinguisherHistory {
  return {
    id: h.id, fireExtinguisherId: h.fireExtinguisherId,
    eventType: h.eventType, eventDate: h.eventDate,
    previousValue: h.previousValue, newValue: h.newValue,
    observations: h.observations, createdBy: h.createdBy,
  }
}

function mapExtinguisher(b: BackendExtinguisher): FireExtinguisher {
  return {
    id: b.id,
    code: b.code ?? b.id.slice(0, 8).toUpperCase(),
    type: b.type,
    capacity: b.capacity,
    chargeDate: b.chargeDate ?? '',
    expirationDate: b.expirationDate,
    associatedAssetId: b.associatedAssetId ?? null,
    associatedLocationType: b.associatedLocationType as AssociatedLocationType,
    status: b.status as FireExtStatus,
    observations: b.observations,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface FireExtinguisherCreateInput {
  type: string; capacity: string; expirationDate: string; chargeDate?: string
  associatedAssetId?: string; associatedLocationType: string; observations?: string
  brand?: string; serialNumber?: string
}

export interface RechargeInput {
  chargeDate: string; expirationDate: string; technician?: string; observations?: string
}

export const fireExtinguishersApi = {
  async findAll(): Promise<FireExtinguisher[]> {
    const res = await apiClient.get<Paginated<BackendExtinguisher>>('/fire-extinguishers', { params: { limit: 200 } })
    return res.data.data.map(mapExtinguisher)
  },

  async findById(id: string): Promise<FireExtinguisher> {
    const res = await apiClient.get<{ data: BackendExtinguisher }>(`/fire-extinguishers/${id}`)
    return mapExtinguisher(res.data.data)
  },

  async create(input: FireExtinguisherCreateInput): Promise<FireExtinguisher> {
    const res = await apiClient.post<{ data: BackendExtinguisher }>('/fire-extinguishers', input)
    return mapExtinguisher(res.data.data)
  },

  async update(id: string, input: Partial<FireExtinguisherCreateInput>): Promise<FireExtinguisher> {
    const res = await apiClient.put<{ data: BackendExtinguisher }>(`/fire-extinguishers/${id}`, input)
    return mapExtinguisher(res.data.data)
  },

  async recharge(id: string, input: RechargeInput): Promise<FireExtinguisher> {
    const res = await apiClient.post<{ data: BackendExtinguisher }>(`/fire-extinguishers/${id}/recharge`, input)
    return mapExtinguisher(res.data.data)
  },

  async bulkRecharge(ids: string[], input: RechargeInput): Promise<void> {
    await Promise.all(ids.map((id) => fireExtinguishersApi.recharge(id, input)))
  },

  async findHistory(id: string): Promise<FireExtinguisherHistory[]> {
    const res = await apiClient.get<{ data: BackendHistory[] }>(`/fire-extinguishers/${id}/history`)
    return res.data.data.map(mapHistory)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/fire-extinguishers/${id}`)
  },
}
