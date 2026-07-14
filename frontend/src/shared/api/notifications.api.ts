import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export interface NotificationsPreview {
  expiringPolicies: number
  expiringExtinguishers: number
  overdueInstallments: number
  nearInstallments: number
  expiringAttachments: number
  hasAlerts: boolean
}

export type NotificationSeverity = 'vencido' | 'proximo_vencer'

export type NotificationCategory =
  | 'policy'
  | 'fire_extinguisher'
  | 'installment_overdue'
  | 'installment_near'
  | 'asset_attachment'
  | 'policy_attachment'

export interface NotificationItem {
  id: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  subtitle: string | null
  dueDate: string
  entityType: 'Policy' | 'FireExtinguisher' | 'AccountingDocument' | 'Asset'
  entityId: string
}

export const notificationsApi = {
  async getPreview(): Promise<NotificationsPreview> {
    const res = await apiClient.get<NotificationsPreview>('/notifications/preview')
    return res.data
  },

  async list(): Promise<NotificationItem[]> {
    const res = await apiClient.get<{ data: NotificationItem[] }>('/notifications')
    return res.data.data
  },
}

// ── Query keys / query options (categoría C — agrega cuotas vencidas/próximas) ──
// Mismo staleTime/refetchInterval que ya tenía el useQuery a mano en
// NotificationBell.tsx — solo se centraliza acá.

export const notificationKeys = {
  preview: ['notifications', 'preview'] as const,
  list: ['notifications', 'list'] as const,
}

export const notificationQueries = {
  preview: () =>
    queryOptions({
      queryKey: notificationKeys.preview,
      queryFn: () => notificationsApi.getPreview(),
      staleTime: 5 * 60 * 1000,
      refetchInterval: 5 * 60 * 1000,
    }),
  list: () =>
    queryOptions({
      queryKey: notificationKeys.list,
      queryFn: () => notificationsApi.list(),
      staleTime: 60 * 1000,
    }),
}
