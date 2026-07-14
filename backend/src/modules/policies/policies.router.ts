import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  AddPolicyAttachmentSchema,
  ListPoliciesQuerySchema,
} from './policies.schemas'
import { policiesController } from './policies.controller'

export const policiesRouter = Router()

policiesRouter.use(authMiddleware)

// CRUD principal
policiesRouter.get('/', validateQuery(ListPoliciesQuerySchema), policiesController.list)
policiesRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreatePolicySchema),
  policiesController.create,
)
policiesRouter.get('/:id', policiesController.getById)
policiesRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdatePolicySchema),
  policiesController.update,
)
policiesRouter.delete('/:id', requireRole('ADMIN'), policiesController.remove)

// Tasks
policiesRouter.get('/:id/tasks', policiesController.getTasks)

// Attachments
policiesRouter.get('/:id/attachments', policiesController.getAttachments)
policiesRouter.post(
  '/:id/attachments',
  requireRole('ADMIN', 'CONTADOR'),
  upload.single('file'),
  validate(AddPolicyAttachmentSchema),
  policiesController.addAttachment,
)
policiesRouter.delete(
  '/:id/attachments/:attachmentId',
  requireRole('ADMIN', 'CONTADOR'),
  policiesController.deleteAttachment,
)
policiesRouter.get('/:id/attachments/:attachmentId/download', policiesController.downloadAttachment)
