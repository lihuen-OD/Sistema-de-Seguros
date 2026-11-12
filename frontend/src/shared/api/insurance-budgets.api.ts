import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { BudgetLevel } from '../utils/budgetAttribution'

// Presupuestos de Seguros (Análisis → Presupuestos). Una línea por alcance
// (empresa / centro de costo / bien de uso / activo) con importes USD por mes
// 'YYYY-MM'. Sin mes = sin presupuesto; 0 = presupuesto cero.

export interface InsuranceBudgetMonth {
  month: string
  amountUsd: number
}

export interface InsuranceBudget {
  id: string
  scopeType: BudgetLevel
  scopeId: string
  notes: string | null
  /** Versión para concurrencia optimista: cada PUT manda la que vio el usuario. */
  version: number
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
  /** Solo los meses del rango pedido (GET /) o todos (respuesta de POST/PUT). */
  months: InsuranceBudgetMonth[]
}

export interface CreateInsuranceBudgetInput {
  scopeType: BudgetLevel
  scopeId: string
  notes?: string | null
  months?: InsuranceBudgetMonth[]
  reason?: string
}

export interface UpdateInsuranceBudgetInput {
  expectedVersion: number
  notes?: string | null
  /** amountUsd null = vaciar el mes (vuelve a "sin presupuesto"). */
  months?: { month: string; amountUsd: number | null }[]
  reason?: string
}

export type InsuranceBudgetAuditAction = 'CREATE' | 'UPDATE_MONTHS' | 'UPDATE_NOTES'

export interface InsuranceBudgetAuditEntry {
  id: string
  action: InsuranceBudgetAuditAction
  month: string | null
  previousAmountUsd: number | null
  newAmountUsd: number | null
  previousData: { notes?: string | null } | null
  newData: { notes?: string | null } | null
  reason: string | null
  performedBy: string
  versionAfter: number
  createdAt: string
}

export interface InsuranceBudgetAuditPage {
  data: InsuranceBudgetAuditEntry[]
  pagination: { total: number; page: number; limit: number; totalPages: number }
}

/** Código del 409 de concurrencia (otro usuario guardó antes). */
export const BUDGET_VERSION_CONFLICT = 'BUDGET_VERSION_CONFLICT'

export const insuranceBudgetsApi = {
  async findAll(scopeType: BudgetLevel, from: string, to: string): Promise<InsuranceBudget[]> {
    const res = await apiClient.get<{ data: InsuranceBudget[] }>('/insurance-budgets', { params: { scopeType, from, to } })
    return res.data.data
  },

  async create(data: CreateInsuranceBudgetInput): Promise<InsuranceBudget> {
    const res = await apiClient.post<{ data: InsuranceBudget }>('/insurance-budgets', data)
    return res.data.data
  },

  async update(id: string, data: UpdateInsuranceBudgetInput): Promise<InsuranceBudget & { changed: boolean }> {
    const res = await apiClient.put<{ data: InsuranceBudget & { changed: boolean } }>(`/insurance-budgets/${id}`, data)
    return res.data.data
  },

  async auditLog(id: string, params: { page: number; limit: number; from?: string; to?: string }): Promise<InsuranceBudgetAuditPage> {
    const res = await apiClient.get<InsuranceBudgetAuditPage>(`/insurance-budgets/${id}/audit-log`, { params })
    return res.data
  },
}

export const insuranceBudgetKeys = {
  all: ['insurance-budgets'] as const,
  list: (scopeType: BudgetLevel, from: string, to: string) => ['insurance-budgets', 'list', scopeType, from, to] as const,
  auditLog: (id: string, page: number, from?: string, to?: string) => ['insurance-budgets', 'audit-log', id, page, from ?? '', to ?? ''] as const,
}

export const insuranceBudgetQueries = {
  // Tabla chica (líneas del nivel × meses del rango). staleTime corto: otro
  // usuario puede estar editando — igual el PUT valida la versión.
  list: (scopeType: BudgetLevel, from: string, to: string) =>
    queryOptions({
      queryKey: insuranceBudgetKeys.list(scopeType, from, to),
      queryFn: () => insuranceBudgetsApi.findAll(scopeType, from, to),
      staleTime: 15 * 1000,
      refetchOnWindowFocus: true,
    }),
  auditLog: (id: string, page: number, from?: string, to?: string) =>
    queryOptions({
      queryKey: insuranceBudgetKeys.auditLog(id, page, from, to),
      queryFn: () => insuranceBudgetsApi.auditLog(id, { page, limit: 20, from, to }),
      staleTime: 15 * 1000,
    }),
}
