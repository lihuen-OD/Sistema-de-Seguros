import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  CreateFixedAssetSchema,
  UpdateFixedAssetSchema,
  ListFixedAssetsQuerySchema,
} from './fixed-assets.schemas'
import { fixedAssetsController } from './fixed-assets.controller'

export const fixedAssetsRouter = Router()

fixedAssetsRouter.use(authMiddleware)

// El listado también lo usa el selector de "Bien de Uso" del formulario de
// Activos (BienDeUsoField), por eso acepta también el módulo `assets`.
fixedAssetsRouter.get('/', requireModule('fixed_assets', 'assets'), validateQuery(ListFixedAssetsQuerySchema), fixedAssetsController.list)
fixedAssetsRouter.post(
  '/',
  requireModule('fixed_assets'),
  validate(CreateFixedAssetSchema),
  fixedAssetsController.create,
)
fixedAssetsRouter.get('/:id', requireModule('fixed_assets'), fixedAssetsController.getById)
fixedAssetsRouter.put(
  '/:id',
  requireModule('fixed_assets'),
  validate(UpdateFixedAssetSchema),
  fixedAssetsController.update,
)
fixedAssetsRouter.delete('/:id', requireModule('fixed_assets'), fixedAssetsController.remove)
