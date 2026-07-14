import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { notificationsService } from './notifications.service'

export const notificationsController = {
  previewExpirations: asyncHandler(async (_req: Request, res: Response) => {
    const result = await notificationsService.previewExpirations()
    res.json({ data: result })
  }),

  list: asyncHandler(async (_req: Request, res: Response) => {
    const result = await notificationsService.listNotifications()
    res.json({ data: result })
  }),
}
