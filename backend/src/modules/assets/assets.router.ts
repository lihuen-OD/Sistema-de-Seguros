import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreateAssetSchema,
  UpdateAssetSchema,
  ReplaceAllocationsSchema,
  AddValueHistorySchema,
  AddAttachmentSchema,
  UpdateAttachmentSchema,
  ListAssetsQuerySchema,
} from './assets.schemas'
import { assetsController } from './assets.controller'

export const assetsRouter = Router()

assetsRouter.use(authMiddleware)

// CRUD principal
assetsRouter.get('/', requireModule('assets'), validateQuery(ListAssetsQuerySchema), assetsController.list)
assetsRouter.post(
  '/',
  requireModule('assets'),
  validate(CreateAssetSchema),
  assetsController.create,
)
assetsRouter.get('/:id', requireModule('assets'), assetsController.getById)
assetsRouter.put(
  '/:id',
  requireModule('assets'),
  validate(UpdateAssetSchema),
  assetsController.update,
)
assetsRouter.delete('/:id', requireModule('assets'), assetsController.remove)

// Allocations
assetsRouter.put(
  '/:id/allocations',
  requireModule('assets'),
  validate(ReplaceAllocationsSchema),
  assetsController.replaceAllocations,
)

// Status history
assetsRouter.get('/:id/status-history', requireModule('assets'), assetsController.getStatusHistory)

// Value history
assetsRouter.get('/:id/value-history', requireModule('assets'), assetsController.getValueHistory)
assetsRouter.post(
  '/:id/value-history',
  requireModule('assets'),
  validate(AddValueHistorySchema),
  assetsController.addValueHistory,
)

// Attachments
assetsRouter.get('/:id/attachments', requireModule('assets'), assetsController.getAttachments)
assetsRouter.post(
  '/:id/attachments',
  requireModule('assets'),
  upload.single('file'),
  validate(AddAttachmentSchema),
  assetsController.addAttachment,
)
assetsRouter.put(
  '/:id/attachments/:attachmentId',
  requireModule('assets'),
  validate(UpdateAttachmentSchema),
  assetsController.updateAttachment,
)
assetsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireModule('assets'),
  assetsController.deleteAttachment,
)
assetsRouter.get('/:id/attachments/:attachmentId/download', requireModule('assets'), assetsController.downloadAttachment)
