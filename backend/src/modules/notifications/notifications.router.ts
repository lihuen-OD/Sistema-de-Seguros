import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate } from '../../middleware/validate.middleware'
import { ReviewNotificationsSchema } from './notifications.schemas'
import { notificationsController } from './notifications.controller'

export const notificationsRouter = Router()

notificationsRouter.use(authMiddleware)
// Agrega datos de varios módulos (pólizas, cuotas, documentos, matafuegos,
// activos) — cada ítem se filtra en el servicio según los módulos del
// usuario (ADMIN ve todo). No es un módulo otorgable en sí mismo: cualquier
// usuario autenticado entra, y ve solo lo que ya podría ver en su propio
// módulo.

// GET /api/v1/notifications/preview — conteos por categoría, para la campanita
notificationsRouter.get('/preview', notificationsController.previewExpirations)

// GET /api/v1/notifications — lista itemizada completa, para el centro de notificaciones
notificationsRouter.get('/', notificationsController.list)

// Marcar/desmarcar como revisado — es un estado COMPARTIDO (no por usuario):
// cuando se revisa una notificación, desaparece para todos. Por eso queda
// exclusivo del ADMIN, que es quien gestiona centralizadamente qué está
// resuelto — un usuario común solo puede consultar, nunca descartar algo que
// otro (incluido el propio ADMIN) todavía no vio.
notificationsRouter.post('/review', requireRole('ADMIN'), validate(ReviewNotificationsSchema), notificationsController.review)
notificationsRouter.post('/unreview', requireRole('ADMIN'), validate(ReviewNotificationsSchema), notificationsController.unreview)
