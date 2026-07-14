import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { notificationsController } from './notifications.controller'

export const notificationsRouter = Router()

notificationsRouter.use(authMiddleware)

// GET /api/v1/notifications/preview — conteos por categoría, para la campanita
notificationsRouter.get('/preview', notificationsController.previewExpirations)

// GET /api/v1/notifications — lista itemizada completa, para el centro de notificaciones
notificationsRouter.get('/', notificationsController.list)
