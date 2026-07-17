import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreateFireExtinguisherAuditSchema,
  AddFireExtinguisherAuditAttachmentSchema,
  ReviewFireExtinguisherAuditSchema,
  ListFireExtinguisherAuditsQuerySchema,
  CoverageQuerySchema,
} from './fire-extinguisher-audits.schemas'
import { fireExtinguisherAuditsController } from './fire-extinguisher-audits.controller'

export const fireExtinguisherAuditsRouter = Router()

fireExtinguisherAuditsRouter.use(authMiddleware)

fireExtinguisherAuditsRouter.get('/', validateQuery(ListFireExtinguisherAuditsQuerySchema), fireExtinguisherAuditsController.list)

// Antes de "/:id" — si no, Express interpreta "coverage"/"findings-report" como un :id.
fireExtinguisherAuditsRouter.get('/coverage', validateQuery(CoverageQuerySchema), fireExtinguisherAuditsController.coverage)
fireExtinguisherAuditsRouter.get(
  '/findings-report',
  validateQuery(CoverageQuerySchema),
  fireExtinguisherAuditsController.findingsReport,
)

fireExtinguisherAuditsRouter.post(
  '/',
  requireModule('fire_extinguisher_audit_coverage'),
  validate(CreateFireExtinguisherAuditSchema),
  fireExtinguisherAuditsController.create,
)

fireExtinguisherAuditsRouter.get('/:id', fireExtinguisherAuditsController.getById)

fireExtinguisherAuditsRouter.post(
  '/:id/attachments',
  requireModule('fire_extinguisher_audit_coverage'),
  upload.single('file'),
  validate(AddFireExtinguisherAuditAttachmentSchema),
  fireExtinguisherAuditsController.addAttachment,
)

fireExtinguisherAuditsRouter.post(
  '/:id/review',
  requireModule('fire_extinguisher_audits'),
  validate(ReviewFireExtinguisherAuditSchema),
  fireExtinguisherAuditsController.review,
)
