import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate } from '../../middleware/validate.middleware'
import { catalogsController } from './catalogs.controller'
import { CreateCatalogItemSchema, UpdateCatalogItemSchema } from './catalogs.schemas'

export const catalogsRouter = Router()

// GET /:category — lista items activos. Protegido como el resto del sistema.
catalogsRouter.get('/:category', authMiddleware, catalogsController.listActive)

// GET /:category/all — lista todos incluyendo inactivos. Requiere el módulo module_config (o ser ADMIN).
catalogsRouter.get('/:category/all', authMiddleware, requireModule('module_config'), catalogsController.listAll)

// POST /:category — crea un item. Requiere el módulo module_config (o ser ADMIN).
catalogsRouter.post(
  '/:category',
  authMiddleware,
  requireModule('module_config'),
  validate(CreateCatalogItemSchema),
  catalogsController.create,
)

// PATCH /:category/:id — actualiza un item. Requiere el módulo module_config (o ser ADMIN).
catalogsRouter.patch(
  '/:category/:id',
  authMiddleware,
  requireModule('module_config'),
  validate(UpdateCatalogItemSchema),
  catalogsController.update,
)

// DELETE /:category/:id — elimina permanentemente. Requiere el módulo module_config (o ser ADMIN).
catalogsRouter.delete('/:category/:id', authMiddleware, requireModule('module_config'), catalogsController.remove)
