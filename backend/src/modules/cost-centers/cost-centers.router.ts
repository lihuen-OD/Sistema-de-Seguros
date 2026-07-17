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

// CostCenter es dato de referencia consumido como selector por varios
// módulos (Assets, Pólizas, Empresas, Dashboard, Análisis financiero/económico)
// además de su propia pantalla de configuración.
const COST_CENTERS_READ_MODULES = ['cost_centers', 'companies', 'dashboard', 'assets', 'policies', 'financial_analysis', 'economic_analysis'] as const

costCentersRouter.get('/', requireModule(...COST_CENTERS_READ_MODULES), validateQuery(ListCostCentersQuerySchema), costCentersController.list)
costCentersRouter.post(
  '/',
  requireModule('cost_centers'),
  validate(CreateCostCenterSchema),
  costCentersController.create,
)
costCentersRouter.get('/:id', requireModule(...COST_CENTERS_READ_MODULES), costCentersController.getById)
costCentersRouter.put(
  '/:id',
  requireModule('cost_centers'),
  validate(UpdateCostCenterSchema),
  costCentersController.update,
)
costCentersRouter.delete('/:id', requireModule('cost_centers'), costCentersController.remove)
