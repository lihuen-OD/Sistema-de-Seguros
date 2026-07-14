import { queryOptions } from '@tanstack/react-query'
import { apiClient } from './client'

export interface ChartCostPoint {
  mes: string
  costo: number
}

export interface DashboardCharts {
  costEvolution: ChartCostPoint[]
}

const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export const dashboardApi = {
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

// ── Query keys / query options (categoría D — dashboard) ─────────────────────────

export const dashboardKeys = {
  charts: (year?: number) => ['dashboard', 'charts', year] as const,
}

export const dashboardQueries = {
  charts: (year?: number) =>
    queryOptions({
      queryKey: dashboardKeys.charts(year),
      queryFn: () => dashboardApi.getCharts(year),
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnMount: 'always' as const,
    }),
}
