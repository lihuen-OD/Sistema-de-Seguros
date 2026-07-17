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

// Lista/detalle/cobertura son compartidos por quien audita (coverage) y quien
// revisa/aprueba (audits) — findings-report es exclusivo de revisión.
const AUDITS_SHARED_READ_MODULES = ['fire_extinguisher_audits', 'fire_extinguisher_audit_coverage'] as const

fireExtinguisherAuditsRouter.get('/', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(ListFireExtinguisherAuditsQuerySchema), fireExtinguisherAuditsController.list)

// Antes de "/:id" — si no, Express interpreta "coverage"/"findings-report" como un :id.
fireExtinguisherAuditsRouter.get('/coverage', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(CoverageQuerySchema), fireExtinguisherAuditsController.coverage)
fireExtinguisherAuditsRouter.get(
  '/findings-report',
  requireModule('fire_extinguisher_audits'),
  validateQuery(CoverageQuerySchema),
  fireExtinguisherAuditsController.findingsReport,
)

fireExtinguisherAuditsRouter.post(
  '/',
  requireModule('fire_extinguisher_audit_coverage'),
  validate(CreateFireExtinguisherAuditSchema),
  fireExtinguisherAuditsController.create,
)

fireExtinguisherAuditsRouter.get('/:id', requireModule(...AUDITS_SHARED_READ_MODULES), fireExtinguisherAuditsController.getById)

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
