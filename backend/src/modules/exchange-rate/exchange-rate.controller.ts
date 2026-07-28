import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { exchangeRateService } from './exchange-rate.service'
import type { SetExchangeRateDTO } from './exchange-rate.schemas'

export const exchangeRateController = {
  getCurrent: asyncHandler(async (_req: Request, res: Response) => {
    const current = await exchangeRateService.getCurrent()
    res.json({ data: current })
  }),

  getHistory: asyncHandler(async (_req: Request, res: Response) => {
    const history = await exchangeRateService.getHistory()
    res.json({ data: history })
  }),

  setCurrent: asyncHandler(
    async (req: Request<unknown, unknown, SetExchangeRateDTO>, res: Response) => {
      const entry = await exchangeRateService.setCurrent(req.body.rate, req.user?.email)
      res.status(201).json({ data: entry })
    },
  ),
}
