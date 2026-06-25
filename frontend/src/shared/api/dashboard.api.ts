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

export interface ChartCostPoint {
  mes: string
  costo: number
}

export interface DashboardCharts {
  costEvolution: ChartCostPoint[]
}

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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

  async getCharts(year?: number): Promise<DashboardCharts> {
    const res = await apiClient.get<{ data: { costEvolution: { month: string; amount: number }[] } }>(
      '/dashboard/charts',
      { params: year ? { year } : undefined },
    )
    const { costEvolution } = res.data.data
    return {
      costEvolution: costEvolution.map((p) => ({
        mes: MONTH_ABBR[parseInt(p.month.slice(5, 7), 10) - 1] ?? p.month,
        costo: p.amount,
      })),
    }
  },
}
