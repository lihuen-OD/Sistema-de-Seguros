import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  CreateCostCenterSchema,
  UpdateCostCenterSchema,
  ListCostCentersQuerySchema,
} from './cost-centers.schemas'
import { costCentersController } from './cost-centers.controller'

export const costCentersRouter = Router()

costCentersRouter.use(authMiddleware)

costCentersRouter.get('/', validateQuery(ListCostCentersQuerySchema), costCentersController.list)
costCentersRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateCostCenterSchema),
  costCentersController.create,
)
costCentersRouter.get('/:id', costCentersController.getById)
costCentersRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateCostCenterSchema),
  costCentersController.update,
)
costCentersRouter.delete('/:id', requireRole('ADMIN'), costCentersController.remove)
