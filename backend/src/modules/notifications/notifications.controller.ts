import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { notificationsService } from './notifications.service'

export const notificationsController = {
  sendExpirationAlerts: asyncHandler(async (req: Request, res: Response) => {
    const { to } = req.body as { to?: string }
    const result = await notificationsService.checkAndSendExpirationAlerts(to)
    res.json({ data: result })
  }),

  previewExpirations: asyncHandler(async (_req: Request, res: Response) => {
    const result = await notificationsService.previewExpirations()
    res.json({ data: result })
  }),
}
