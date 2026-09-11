import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { ListTasksQuerySchema, CreateGlobalTaskSchema, UpdateGlobalTaskSchema } from './tasks.schemas'
import { tasksController } from './tasks.controller'

export const tasksRouter = Router()

tasksRouter.use(authMiddleware)

// Mismo criterio de módulos que ya usan GET /producers/:id/tasks y
// GET /producers/tasks/overdue (producers.router.ts) — un listado global no
// debería ser ni más restrictivo ni más permisivo que las rutas que reemplaza.
tasksRouter.get('/', requireModule('producers', 'tasks', 'dashboard'), validateQuery(ListTasksQuerySchema), tasksController.list)
tasksRouter.post('/', requireModule('tasks'), validate(CreateGlobalTaskSchema), tasksController.create)
tasksRouter.get('/:id', requireModule('producers', 'tasks', 'dashboard'), tasksController.getById)
tasksRouter.put('/:id', requireModule('tasks'), validate(UpdateGlobalTaskSchema), tasksController.update)
tasksRouter.delete('/:id', requireModule('tasks'), tasksController.remove)
