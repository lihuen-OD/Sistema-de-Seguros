import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { catalogsController } from './catalogs.controller'

export const catalogsRouter = Router()

// GET /:category — lista items activos. Protegido como el resto del sistema.
catalogsRouter.get('/:category', authMiddleware, catalogsController.listActive)

// GET /:category/all — lista todos incluyendo inactivos. Solo ADMIN.
catalogsRouter.get('/:category/all', authMiddleware, requireRole('ADMIN'), catalogsController.listAll)

// POST /:category — crea un item. ADMIN o CONTADOR.
catalogsRouter.post('/:category', authMiddleware, requireRole('ADMIN', 'CONTADOR'), catalogsController.create)

// PATCH /:category/:id — actualiza un item. ADMIN o CONTADOR.
catalogsRouter.patch('/:category/:id', authMiddleware, requireRole('ADMIN', 'CONTADOR'), catalogsController.update)

// DELETE /:category/:id — elimina permanentemente. Solo ADMIN.
catalogsRouter.delete('/:category/:id', authMiddleware, requireRole('ADMIN'), catalogsController.remove)
