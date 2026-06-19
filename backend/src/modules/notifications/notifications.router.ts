import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { notificationsController } from './notifications.controller'

export const notificationsRouter = Router()

notificationsRouter.use(authMiddleware)

// GET  /api/v1/notifications/preview  — cuántos items hay por categoría (sin enviar email)
notificationsRouter.get(
  '/preview',
  notificationsController.previewExpirations,
)

// POST /api/v1/notifications/send — envía el email de alertas de vencimiento
notificationsRouter.post(
  '/send',
  requireRole('ADMIN'),
  notificationsController.sendExpirationAlerts,
)
