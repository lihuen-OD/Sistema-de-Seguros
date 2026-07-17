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

fixedAssetsRouter.get('/', validateQuery(ListFixedAssetsQuerySchema), fixedAssetsController.list)
fixedAssetsRouter.post(
  '/',
  requireModule('fixed_assets'),
  validate(CreateFixedAssetSchema),
  fixedAssetsController.create,
)
fixedAssetsRouter.get('/:id', fixedAssetsController.getById)
fixedAssetsRouter.put(
  '/:id',
  requireModule('fixed_assets'),
  validate(UpdateFixedAssetSchema),
  fixedAssetsController.update,
)
fixedAssetsRouter.delete('/:id', requireModule('fixed_assets'), fixedAssetsController.remove)
