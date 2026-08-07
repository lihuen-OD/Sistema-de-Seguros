import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import {
  CreateInsuranceAuditSchema,
  UpdateInsuranceAuditSchema,
  AddInsuranceAuditAttachmentSchema,
  ReviewInsuranceAuditSchema,
  BulkApproveInsuranceAuditsSchema,
  ListInsuranceAuditsQuerySchema,
  CoverageQuerySchema,
  AuditDashboardQuerySchema,
  AuditorProgressQuerySchema,
} from './insurance-audits.schemas'
import { insuranceAuditsController } from './insurance-audits.controller'

export const insuranceAuditsRouter = Router()

insuranceAuditsRouter.use(authMiddleware)

// Lista/detalle/cobertura son compartidos por quien audita (coverage) y quien
// revisa/aprueba (audits) — mismo criterio que asset-audits/fire-extinguisher-audits.
const AUDITS_SHARED_READ_MODULES = ['insurance_audits', 'insurance_audit_coverage'] as const

insuranceAuditsRouter.get('/', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(ListInsuranceAuditsQuerySchema), insuranceAuditsController.list)

// Antes de "/:id" — si no, Express interpreta "coverage"/"audit-dashboard" como un :id.
insuranceAuditsRouter.get('/coverage', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(CoverageQuerySchema), insuranceAuditsController.coverage)
insuranceAuditsRouter.get(
  '/audit-dashboard',
  requireModule('insurance_audit_dashboard'),
  validateQuery(AuditDashboardQuerySchema),
  insuranceAuditsController.auditDashboard,
)
insuranceAuditsRouter.get(
  '/auditor-progress',
  requireModule('insurance_audits'),
  validateQuery(AuditorProgressQuerySchema),
  insuranceAuditsController.auditorProgress,
)

insuranceAuditsRouter.post('/', requireModule('insurance_audit_coverage'), validate(CreateInsuranceAuditSchema), insuranceAuditsController.create)

insuranceAuditsRouter.post(
  '/bulk-approve',
  requireModule('insurance_audits'),
  validate(BulkApproveInsuranceAuditsSchema),
  insuranceAuditsController.bulkApprove,
)

insuranceAuditsRouter.get('/:id', requireModule(...AUDITS_SHARED_READ_MODULES), insuranceAuditsController.getById)

insuranceAuditsRouter.put(
  '/:id',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  validate(UpdateInsuranceAuditSchema),
  insuranceAuditsController.update,
)

insuranceAuditsRouter.post(
  '/:id/attachments',
  requireModule('insurance_audit_coverage'),
  upload.single('file'),
  validate(AddInsuranceAuditAttachmentSchema),
  insuranceAuditsController.addAttachment,
)

insuranceAuditsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireModule('insurance_audit_coverage'),
  insuranceAuditsController.deleteAttachment,
)

insuranceAuditsRouter.get(
  '/:id/attachments/:attachmentId/download',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  insuranceAuditsController.downloadAttachment,
)

insuranceAuditsRouter.post(
  '/:id/review',
  requireModule('insurance_audits'),
  validate(ReviewInsuranceAuditSchema),
  insuranceAuditsController.review,
)
