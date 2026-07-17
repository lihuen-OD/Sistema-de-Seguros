import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  CreateAccessProfileSchema,
  UpdateAccessProfileSchema,
  ListAccessProfilesQuerySchema,
} from './access-profiles.schemas'
import { accessProfilesController } from './access-profiles.controller'

export const accessProfilesRouter = Router()

accessProfilesRouter.use(authMiddleware)
accessProfilesRouter.use(requireRole('ADMIN'))

accessProfilesRouter.get('/', validateQuery(ListAccessProfilesQuerySchema), accessProfilesController.list)
accessProfilesRouter.post('/', validate(CreateAccessProfileSchema), accessProfilesController.create)
accessProfilesRouter.get('/:id', accessProfilesController.getById)
accessProfilesRouter.put('/:id', validate(UpdateAccessProfileSchema), accessProfilesController.update)
accessProfilesRouter.delete('/:id', accessProfilesController.remove)
