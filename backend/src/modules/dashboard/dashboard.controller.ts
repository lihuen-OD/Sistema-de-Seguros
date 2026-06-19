import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { dashboardService } from './dashboard.service'
import type {
  ExpiringPoliciesQueryDTO,
  ExpiringInstallmentsQueryDTO,
  ChartsQueryDTO,
} from './dashboard.schemas'

export const dashboardController = {
  getKpis: asyncHandler(async (_req: Request, res: Response) => {
    const data = await dashboardService.getKpis()
    res.json({ data })
  }),

  getExpiringPolicies: asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.query as unknown as ExpiringPoliciesQueryDTO
    const data = await dashboardService.getExpiringPolicies(days)
    res.json({ data })
  }),

  getExpiringInstallments: asyncHandler(async (req: Request, res: Response) => {
    const { days } = req.query as unknown as ExpiringInstallmentsQueryDTO
    const data = await dashboardService.getExpiringInstallments(days)
    res.json({ data })
  }),

  getCharts: asyncHandler(async (req: Request, res: Response) => {
    const { year } = req.query as unknown as ChartsQueryDTO
    const data = await dashboardService.getCharts(year)
    res.json({ data })
  }),
}
