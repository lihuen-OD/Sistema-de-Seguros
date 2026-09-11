import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validateQuery } from '../../middleware/validate.middleware'
import { ListTasksQuerySchema } from './tasks.schemas'
import { tasksController } from './tasks.controller'

export const tasksRouter = Router()

tasksRouter.use(authMiddleware)

// Mismo criterio de módulos que ya usan GET /producers/:id/tasks y
// GET /producers/tasks/overdue (producers.router.ts) — un listado global no
// debería ser ni más restrictivo ni más permisivo que las rutas que reemplaza.
tasksRouter.get('/', requireModule('producers', 'tasks', 'dashboard'), validateQuery(ListTasksQuerySchema), tasksController.list)
