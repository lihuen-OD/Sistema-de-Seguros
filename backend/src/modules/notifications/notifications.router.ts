import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate } from '../../middleware/validate.middleware'
import { ReviewNotificationsSchema } from './notifications.schemas'
import { notificationsController } from './notifications.controller'

export const notificationsRouter = Router()

notificationsRouter.use(authMiddleware)
// Agrega datos de todos los módulos (pólizas, cuotas, documentos, matafuegos)
// sin filtrar por permisos de cada uno — por eso queda exclusivo del ADMIN,
// no otorgable por perfil (mismo criterio que /settings/users).
notificationsRouter.use(requireRole('ADMIN'))

// GET /api/v1/notifications/preview — conteos por categoría, para la campanita
notificationsRouter.get('/preview', notificationsController.previewExpirations)

// GET /api/v1/notifications — lista itemizada completa, para el centro de notificaciones
notificationsRouter.get('/', notificationsController.list)

// Marcar/desmarcar como revisado — cada quien gestiona sus propias revisiones
notificationsRouter.post('/review', validate(ReviewNotificationsSchema), notificationsController.review)
notificationsRouter.post('/unreview', validate(ReviewNotificationsSchema), notificationsController.unreview)
