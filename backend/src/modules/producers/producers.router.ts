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
} from './producers.schemas'
import { producersController } from './producers.controller'

export const producersRouter = Router()

producersRouter.use(authMiddleware)

// CRUD principal
producersRouter.get('/', validateQuery(ListProducersQuerySchema), producersController.list)
producersRouter.post(
  '/',
  requireModule('producers'),
  validate(CreateProducerSchema),
  producersController.create,
)
producersRouter.get('/:id', producersController.getById)
producersRouter.put(
  '/:id',
  requireModule('producers'),
  validate(UpdateProducerSchema),
  producersController.update,
)
producersRouter.delete('/:id', requireModule('producers'), producersController.remove)

// Tasks
producersRouter.get('/:id/tasks', producersController.getTasks)
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
