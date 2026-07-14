import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { FireExtinguisher, FireExtinguisherHistory, FireExtinguisherHistoryChange, AssociatedLocationType, FireExtStatus } from '../types'

interface BackendHistoryChange {
  field: string; label: string
  previousValue: string | number | boolean | null; newValue: string | number | boolean | null
}
interface BackendHistory {
  id: string; fireExtinguisherId: string; eventType: string; eventDate: string
  previousValue: string; newValue: string; observations: string; createdBy: string; createdAt: string
  description?: string | null; changes?: BackendHistoryChange[] | null
}
interface BackendExtinguisher {
  id: string; code: string | null; type: string; capacity: string
  chargeDate: string | null; expirationDate: string; associatedAssetId: string | null
  hydraulicTestExpirationDate: string | null; hydraulicTestStatus?: string | null
  associatedLocationType: string; location: string | null; establishment: string | null
  status: string; chargeStatus: string; manufacturingLifeStatus: string | null
  manufacturingYear: number | null; manufacturingExpirationYear: number | null
  observations: string
  brand: string | null; cylinderNumber?: string | null; serialNumber?: string | null
  isActive: boolean; createdAt: string; updatedAt: string
  history?: BackendHistory[]
}
interface Paginated<T> { data: T[]; pagination: { total: number; page: number; limit: number; totalPages: number } }

export const fireExtinguisherKeys = {
  all: ['fire-extinguishers'] as const,
  list: (filters?: { assetId?: string }) =>
    filters ? ([...fireExtinguisherKeys.all, filters] as const) : fireExtinguisherKeys.all,
  detail: (id: string) => [...fireExtinguisherKeys.all, id] as const,
  history: (id: string) => [...fireExtinguisherKeys.all, id, 'history'] as const,
}

function mapHistory(h: BackendHistory): FireExtinguisherHistory {
  return {
    id: h.id, fireExtinguisherId: h.fireExtinguisherId,
    eventType: h.eventType, eventDate: h.eventDate,
    previousValue: h.previousValue, newValue: h.newValue,
    observations: h.observations, createdBy: h.createdBy,
    description: h.description ?? null,
    changes: (h.changes as FireExtinguisherHistoryChange[] | null | undefined) ?? null,
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
    hydraulicTestExpirationDate: b.hydraulicTestExpirationDate ?? null,
    associatedAssetId: b.associatedAssetId ?? null,
    associatedLocationType: b.associatedLocationType as AssociatedLocationType,
    location: b.location ?? null,
    establishment: b.establishment ?? null,
    brand: b.brand ?? null,
    cylinderNumber: b.cylinderNumber ?? b.serialNumber ?? null,
    manufacturingYear: b.manufacturingYear ?? null,
    status: b.status as FireExtStatus,
    chargeStatus: (b.chargeStatus as FireExtStatus) ?? (b.status as FireExtStatus),
    manufacturingLifeStatus: (b.manufacturingLifeStatus as FireExtStatus) ?? null,
    hydraulicTestStatus: (b.hydraulicTestStatus as FireExtStatus) ?? null,
    manufacturingExpirationYear: b.manufacturingExpirationYear ?? null,
    observations: b.observations,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}

export interface FireExtinguisherCreateInput {
  type: string; capacity: string; expirationDate: string; chargeDate?: string
  hydraulicTestExpirationDate: string
  associatedAssetId?: string; associatedLocationType: string; location?: string
  establishment: string; observations?: string
  brand?: string; cylinderNumber: string; manufacturingYear: number
}

export interface RechargeInput {
  chargeDate: string; expirationDate: string; technician?: string; observations?: string
}

export const fireExtinguishersApi = {
  async findAll(filters?: { assetId?: string; isActive?: boolean; unassigned?: boolean }): Promise<FireExtinguisher[]> {
    const res = await apiClient.get<Paginated<BackendExtinguisher>>('/fire-extinguishers', { params: { limit: 200, ...filters } })
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
    // Un solo endpoint atómico (transacción interactiva en el backend) — si un id
    // no existe, ninguno del lote queda parcialmente recargado. Antes de Fase 6
    // esto era un Promise.all de N POST /:id/recharge independientes, sin rollback
    // conjunto posible.
    await apiClient.post('/fire-extinguishers/bulk-recharge', { ids, ...input })
  },

  async findHistory(id: string): Promise<FireExtinguisherHistory[]> {
    const res = await apiClient.get<{ data: BackendHistory[] }>(`/fire-extinguishers/${id}/history`)
    return res.data.data.map(mapHistory)
  },

  async softDelete(id: string): Promise<void> {
    await apiClient.delete(`/fire-extinguishers/${id}`)
  },

  async getDashboardSummary(): Promise<FireExtinguisherDashboardSummary> {
    const res = await apiClient.get<{ data: FireExtinguisherDashboardSummary }>('/fire-extinguishers/dashboard/summary')
    return res.data.data
  },
}

// ── Query options — categoría B (listado/detalle/historial), categoría D (dashboard) ──

export const fireExtinguisherQueries = {
  list: (filters?: { assetId?: string }) =>
    queryOptions({
      queryKey: fireExtinguisherKeys.list(filters),
      queryFn: () => fireExtinguishersApi.findAll(filters),
      staleTime: 60 * 1000,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: fireExtinguisherKeys.detail(id),
      queryFn: () => fireExtinguishersApi.findById(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  history: (id: string) =>
    queryOptions({
      queryKey: fireExtinguisherKeys.history(id),
      queryFn: () => fireExtinguishersApi.findHistory(id),
      staleTime: 2 * 60 * 1000,
      enabled: !!id,
    }),
  dashboardSummary: () =>
    queryOptions({
      queryKey: [...fireExtinguisherKeys.all, 'dashboard-summary'] as const,
      queryFn: () => fireExtinguishersApi.getDashboardSummary(),
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnMount: 'always' as const,
    }),
}

// ── Dashboard propio del módulo (Fase 5) ────────────────────────────────────────

export interface FireExtinguisherStatusBucket {
  establishment: string
  total: number
  vigente: number
  proximo_vencer: number
  vencido: number
}

export interface FireExtinguisherDashboardSummary {
  totals: { total: number; vigente: number; proximo_vencer: number; vencido: number }
  byEstablishment: FireExtinguisherStatusBucket[]
  byType: { type: string; count: number }[]
  audits: {
    currentPeriod: string
    totalActive: number
    auditedThisPeriod: number
    coveragePercent: number
    pendingReview: number
    needsCorrection: number
  }
  recentAudits: {
    id: string
    extinguisherCode: string
    status: string
    auditPeriod: string
    auditedBy: string
    createdAt: string
  }[]
}
