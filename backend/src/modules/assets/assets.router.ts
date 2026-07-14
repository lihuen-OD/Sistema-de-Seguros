import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreateAssetSchema,
  UpdateAssetSchema,
  ReplaceAllocationsSchema,
  AddValueHistorySchema,
  AddAttachmentSchema,
  ListAssetsQuerySchema,
} from './assets.schemas'
import { assetsController } from './assets.controller'

export const assetsRouter = Router()

assetsRouter.use(authMiddleware)

// CRUD principal
assetsRouter.get('/', validateQuery(ListAssetsQuerySchema), assetsController.list)
assetsRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateAssetSchema),
  assetsController.create,
)
assetsRouter.get('/:id', assetsController.getById)
assetsRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateAssetSchema),
  assetsController.update,
)
assetsRouter.delete('/:id', requireRole('ADMIN'), assetsController.remove)

// Allocations
assetsRouter.put(
  '/:id/allocations',
  requireRole('ADMIN', 'CONTADOR'),
  validate(ReplaceAllocationsSchema),
  assetsController.replaceAllocations,
)

// Status history
assetsRouter.get('/:id/status-history', assetsController.getStatusHistory)

// Value history
assetsRouter.get('/:id/value-history', assetsController.getValueHistory)
assetsRouter.post(
  '/:id/value-history',
  requireRole('ADMIN', 'CONTADOR'),
  validate(AddValueHistorySchema),
  assetsController.addValueHistory,
)

// Attachments
assetsRouter.get('/:id/attachments', assetsController.getAttachments)
assetsRouter.post(
  '/:id/attachments',
  requireRole('ADMIN', 'CONTADOR'),
  upload.single('file'),
  validate(AddAttachmentSchema),
  assetsController.addAttachment,
)
assetsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireRole('ADMIN', 'CONTADOR'),
  assetsController.deleteAttachment,
)
assetsRouter.get('/:id/attachments/:attachmentId/download', assetsController.downloadAttachment)
