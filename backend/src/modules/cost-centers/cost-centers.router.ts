import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
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
  requireModule('cost_centers'),
  validate(CreateCostCenterSchema),
  costCentersController.create,
)
costCentersRouter.get('/:id', costCentersController.getById)
costCentersRouter.put(
  '/:id',
  requireModule('cost_centers'),
  validate(UpdateCostCenterSchema),
  costCentersController.update,
)
costCentersRouter.delete('/:id', requireModule('cost_centers'), costCentersController.remove)
