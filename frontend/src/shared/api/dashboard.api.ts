import { apiClient } from './client'

export interface DashboardKPIs {
  totalAssets: number
  activeAssets: number
  totalPolicies: number
  expiringPolicies: number
  activeClaims: number
  overdueExtinguishers: number
  totalDocuments?: number
  pendingTasks?: number
}

interface BackendKPIs {
  assets: { total: number; active: number; inactive: number }
  policies: { total: number; active: number; expiringSoon: number; expired: number }
  claims: { total: number; open: number; inProcess: number; closed: number }
  fireExtinguishers: { total: number; active: number; expired: number; expiringSoon: number }
  producers?: { total: number; active: number }
  documents?: { total: number }
  tasks?: { total: number; pending: number; overdue: number }
}

export const dashboardApi = {
  async getKPIs(): Promise<DashboardKPIs> {
    const res = await apiClient.get<{ data: BackendKPIs }>('/dashboard/kpis')
    const d = res.data.data
    return {
      totalAssets: d.assets?.total ?? 0,
      activeAssets: d.assets?.active ?? 0,
      totalPolicies: d.policies?.total ?? 0,
      expiringPolicies: (d.policies?.expiringSoon ?? 0) + (d.policies?.expired ?? 0),
      activeClaims: (d.claims?.open ?? 0) + (d.claims?.inProcess ?? 0),
      overdueExtinguishers: d.fireExtinguishers?.expired ?? 0,
      totalDocuments: d.documents?.total,
      pendingTasks: d.tasks?.pending,
    }
  },
}
