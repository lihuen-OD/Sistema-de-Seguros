import { apiClient } from './client'

export interface NotificationsPreview {
  expiringPolicies: number
  expiringExtinguishers: number
  overdueInstallments: number
  nearInstallments: number
  hasAlerts: boolean
}

export const notificationsApi = {
  async getPreview(): Promise<NotificationsPreview> {
    const res = await apiClient.get<NotificationsPreview>('/notifications/preview')
    return res.data
  },
}
