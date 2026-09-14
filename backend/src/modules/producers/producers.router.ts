import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  CreateProducerSchema,
  UpdateProducerSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  ListProducersQuerySchema,
  SearchProducersQuerySchema,
  ListOverdueTasksQuerySchema,
} from './producers.schemas'
import { producersController } from './producers.controller'

export const producersRouter = Router()

producersRouter.use(authMiddleware)

// CRUD principal — el listado también lo consumen Tareas, Dashboard y
// Pólizas (selector/agregado de productor), de ahí el OR de módulos.
const PRODUCERS_LIST_MODULES = ['producers', 'tasks', 'dashboard', 'policies'] as const

producersRouter.get('/', requireModule(...PRODUCERS_LIST_MODULES), validateQuery(ListProducersQuerySchema), producersController.list)
// Debe declararse antes de /:id para que Express no interprete "search" como un ID de productor.
producersRouter.get('/search', requireModule(...PRODUCERS_LIST_MODULES), validateQuery(SearchProducersQuerySchema), producersController.search)
producersRouter.post(
  '/',
  requireModule('producers'),
  validate(CreateProducerSchema),
  producersController.create,
)
producersRouter.get('/:id', requireModule('producers'), producersController.getById)
producersRouter.put(
  '/:id',
  requireModule('producers'),
  validate(UpdateProducerSchema),
  producersController.update,
)
producersRouter.delete('/:id', requireModule('producers'), producersController.remove)

// Tasks — agregado también por Tareas y Dashboard (tareas de todos los productores)

// Ruta estática ANTES de /:id/tasks — mismo permiso que esa, agregado de
// tareas vencidas de TODOS los productores en una sola request (reemplaza,
// para el Dashboard, el fan-out de un GET /:id/tasks por productor).
producersRouter.get(
  '/tasks/overdue',
  requireModule('producers', 'tasks', 'dashboard'),
  validateQuery(ListOverdueTasksQuerySchema),
  producersController.getOverdueTasks,
)
producersRouter.get('/:id/tasks', requireModule('producers', 'tasks', 'dashboard'), producersController.getTasks)
producersRouter.post(
  '/:id/tasks',
  requireModule('tasks'),
  validate(CreateTaskSchema),
  producersController.createTask,
)
producersRouter.put(
  '/:id/tasks/:taskId',
  requireModule('tasks'),
  validate(UpdateTaskSchema),
  producersController.updateTask,
)
producersRouter.delete(
  '/:id/tasks/:taskId',
  requireModule('tasks'),
  producersController.deleteTask,
)
