import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { notificationsService } from './notifications.service'
import type { ReviewNotificationsDTO } from './notifications.schemas'

export const notificationsController = {
  previewExpirations: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const result = await notificationsService.previewExpirations(req.user.userId)
    res.json({ data: result })
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const result = await notificationsService.listNotifications(req.user.userId)
    res.json({ data: result })
  }),

  review: asyncHandler(async (req: Request<unknown, unknown, ReviewNotificationsDTO>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const result = await notificationsService.review(req.user.userId, req.body.items)
    res.json({ data: result })
  }),

  unreview: asyncHandler(async (req: Request<unknown, unknown, ReviewNotificationsDTO>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const result = await notificationsService.unreview(req.user.userId, req.body.items)
    res.json({ data: result })
  }),
}
