import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
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
  requireModule('policies'),
  validate(CreatePolicySchema),
  policiesController.create,
)
policiesRouter.get('/:id', policiesController.getById)
policiesRouter.put(
  '/:id',
  requireModule('policies'),
  validate(UpdatePolicySchema),
  policiesController.update,
)
policiesRouter.delete('/:id', requireModule('policies'), policiesController.remove)

// Tasks
policiesRouter.get('/:id/tasks', policiesController.getTasks)

// Attachments
policiesRouter.get('/:id/attachments', policiesController.getAttachments)
policiesRouter.post(
  '/:id/attachments',
  requireModule('policies'),
  upload.single('file'),
  validate(AddPolicyAttachmentSchema),
  policiesController.addAttachment,
)
policiesRouter.delete(
  '/:id/attachments/:attachmentId',
  requireModule('policies'),
  policiesController.deleteAttachment,
)
policiesRouter.get('/:id/attachments/:attachmentId/download', policiesController.downloadAttachment)
