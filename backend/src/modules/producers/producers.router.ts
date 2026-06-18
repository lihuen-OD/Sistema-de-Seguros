import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
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
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateProducerSchema),
  producersController.create,
)
producersRouter.get('/:id', producersController.getById)
producersRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateProducerSchema),
  producersController.update,
)
producersRouter.delete('/:id', requireRole('ADMIN'), producersController.remove)

// Tasks
producersRouter.get('/:id/tasks', producersController.getTasks)
producersRouter.post(
  '/:id/tasks',
  requireRole('ADMIN', 'CONTADOR', 'PRODUCTOR'),
  validate(CreateTaskSchema),
  producersController.createTask,
)
producersRouter.put(
  '/:id/tasks/:taskId',
  requireRole('ADMIN', 'CONTADOR', 'PRODUCTOR'),
  validate(UpdateTaskSchema),
  producersController.updateTask,
)
producersRouter.delete(
  '/:id/tasks/:taskId',
  requireRole('ADMIN', 'CONTADOR'),
  producersController.deleteTask,
)
