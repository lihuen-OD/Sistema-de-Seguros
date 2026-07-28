import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreateFireExtinguisherAuditSchema,
  UpdateFireExtinguisherAuditSchema,
  AddFireExtinguisherAuditAttachmentSchema,
  ReviewFireExtinguisherAuditSchema,
  BulkApproveFireExtinguisherAuditsSchema,
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

// Aprueba varias auditorías SUBMITTED de una sola vez (ver service.bulkApprove) —
// path fijo, sin conflicto posible con "/:id/review" (ese requiere el sufijo "/review").
fireExtinguisherAuditsRouter.post(
  '/bulk-approve',
  requireModule('fire_extinguisher_audits'),
  validate(BulkApproveFireExtinguisherAuditsSchema),
  fireExtinguisherAuditsController.bulkApprove,
)

fireExtinguisherAuditsRouter.get('/:id', requireModule(...AUDITS_SHARED_READ_MODULES), fireExtinguisherAuditsController.getById)

// Editar una auditoría propia SUBMITTED — tanto quien la auditó como quien la
// revisa pueden corregirla sin tener que rechazarla primero (ver service.update).
fireExtinguisherAuditsRouter.put(
  '/:id',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  validate(UpdateFireExtinguisherAuditSchema),
  fireExtinguisherAuditsController.update,
)

fireExtinguisherAuditsRouter.post(
  '/:id/attachments',
  requireModule('fire_extinguisher_audit_coverage'),
  upload.single('file'),
  validate(AddFireExtinguisherAuditAttachmentSchema),
  fireExtinguisherAuditsController.addAttachment,
)

fireExtinguisherAuditsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireModule('fire_extinguisher_audit_coverage'),
  fireExtinguisherAuditsController.deleteAttachment,
)

fireExtinguisherAuditsRouter.get(
  '/:id/attachments/:attachmentId/download',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  fireExtinguisherAuditsController.downloadAttachment,
)

fireExtinguisherAuditsRouter.post(
  '/:id/review',
  requireModule('fire_extinguisher_audits'),
  validate(ReviewFireExtinguisherAuditSchema),
  fireExtinguisherAuditsController.review,
)
