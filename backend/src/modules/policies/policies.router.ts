import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreatePolicySchema,
  UpdatePolicySchema,
  ReplaceCoveragesSchema,
  AddPolicyAttachmentSchema,
  ListPoliciesQuerySchema,
} from './policies.schemas'
import { policiesController } from './policies.controller'

export const policiesRouter = Router()

policiesRouter.use(authMiddleware)

// CRUD principal
policiesRouter.get('/', requireModule('policies'), validateQuery(ListPoliciesQuerySchema), policiesController.list)
policiesRouter.post(
  '/',
  requireModule('policies'),
  validate(CreatePolicySchema),
  policiesController.create,
)
policiesRouter.get('/:id', requireModule('policies'), policiesController.getById)
policiesRouter.put(
  '/:id',
  requireModule('policies'),
  validate(UpdatePolicySchema),
  policiesController.update,
)
policiesRouter.delete('/:id', requireModule('policies'), policiesController.remove)
policiesRouter.post('/:id/de-baja', requireModule('policies'), policiesController.markAsDeBaja)

// Tasks
policiesRouter.get('/:id/tasks', requireModule('policies'), policiesController.getTasks)

// Líneas de cobertura (una por activo cubierto, o "sin activo")
policiesRouter.get('/:id/coverages', requireModule('policies'), policiesController.getCoverages)
policiesRouter.put(
  '/:id/coverages',
  requireModule('policies'),
  validate(ReplaceCoveragesSchema),
  policiesController.replaceCoverages,
)

// Attachments — por línea de cobertura, no por póliza (una póliza de flota
// tiene una tarjeta de circulación distinta por vehículo).
policiesRouter.get('/:id/coverages/:coverageId/attachments', requireModule('policies'), policiesController.getAttachments)
policiesRouter.post(
  '/:id/coverages/:coverageId/attachments',
  requireModule('policies'),
  upload.single('file'),
  validate(AddPolicyAttachmentSchema),
  policiesController.addAttachment,
)
policiesRouter.delete(
  '/:id/coverages/:coverageId/attachments/:attachmentId',
  requireModule('policies'),
  policiesController.deleteAttachment,
)
policiesRouter.get(
  '/:id/coverages/:coverageId/attachments/:attachmentId/download',
  requireModule('policies'),
  policiesController.downloadAttachment,
)
