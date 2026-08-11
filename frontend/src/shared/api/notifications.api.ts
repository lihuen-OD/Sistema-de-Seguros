import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'
import type { ModuleKey } from '../types'

export interface NotificationsPreview {
  expiringPolicies: number
  expiringExtinguishers: number
  overdueInstallments: number
  nearInstallments: number
  expiringAttachments: number
  pendingCardUpdates: number
  hasAlerts: boolean
}

export type NotificationSeverity = 'vencido' | 'proximo_vencer'

export type NotificationCategory =
  | 'policy'
  | 'fire_extinguisher'
  | 'installment_overdue'
  | 'installment_near'
  | 'asset_attachment'
  | 'insurance_card_pending'

// Mismo mapeo que CATEGORY_MODULE en el backend (notifications.service.ts) —
// acá es solo para no ofrecer, como opción de filtro, una categoría de un
// módulo que el usuario no tiene (la seguridad real ya la aplica el backend
// al armar la lista; esto es puramente para no confundir en el filtro).
export const NOTIFICATION_CATEGORY_MODULE: Record<NotificationCategory, ModuleKey> = {
  policy: 'policies',
  fire_extinguisher: 'fire_extinguishers',
  installment_overdue: 'documents',
  installment_near: 'documents',
  asset_attachment: 'assets',
  insurance_card_pending: 'insurance_audits',
}

export interface NotificationItem {
  id: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  subtitle: string | null
  dueDate: string
  entityType: 'Policy' | 'FireExtinguisher' | 'AccountingDocument' | 'Asset' | 'InsuranceAudit'
  entityId: string
  reviewed: boolean
}

export interface ReviewNotificationInput {
  notificationId: string
  dueDate: string
}

export const notificationsApi = {
  async getPreview(): Promise<NotificationsPreview> {
    // El backend envuelve todo en { data: ... } — antes esto devolvía
    // res.data (el sobre completo, no el contenido), por eso los conteos
    // llegaban undefined y la campanita se mostraba vacía sin ningún error.
    const res = await apiClient.get<{ data: NotificationsPreview }>('/notifications/preview')
    return res.data.data
  },

  async list(): Promise<NotificationItem[]> {
    const res = await apiClient.get<{ data: NotificationItem[] }>('/notifications')
    return res.data.data
  },

  async review(items: ReviewNotificationInput[]): Promise<void> {
    await apiClient.post('/notifications/review', { items })
  },

  async unreview(items: ReviewNotificationInput[]): Promise<void> {
    await apiClient.post('/notifications/unreview', { items })
  },
}

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
