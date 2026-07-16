import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate } from '../../middleware/validate.middleware'
import { CreateUserSchema, UpdateUserSchema, ResetPasswordSchema } from './users.schemas'
import { usersController } from './users.controller'

export const usersRouter = Router()

// Administración de usuarios — ADMIN únicamente, ninguna excepción.
usersRouter.use(authMiddleware)
usersRouter.use(requireRole('ADMIN'))

usersRouter.get('/', usersController.list)
usersRouter.post('/', validate(CreateUserSchema), usersController.create)
usersRouter.put('/:id', validate(UpdateUserSchema), usersController.update)
usersRouter.post('/:id/reset-password', validate(ResetPasswordSchema), usersController.resetPassword)
