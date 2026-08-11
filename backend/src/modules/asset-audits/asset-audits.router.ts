import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule, requireRole } from '../../middleware/roles.middleware'
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
  AuditDashboardQuerySchema,
  AuditorProgressQuerySchema,
  AddCommentSchema,
} from '../fire-extinguisher-audits/fire-extinguisher-audits.schemas'
import { SaveAssignmentSchema } from './asset-audits-assignments.schemas'
import { assetAuditsController } from './asset-audits.controller'

export const assetAuditsRouter = Router()

assetAuditsRouter.use(authMiddleware)

// Lista/detalle/cobertura son compartidos por quien audita (coverage) y quien
// revisa/aprueba (audits) — mismo criterio que fire-extinguisher-audits.
const AUDITS_SHARED_READ_MODULES = ['asset_audits', 'asset_audit_coverage'] as const

assetAuditsRouter.get('/', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(ListFireExtinguisherAuditsQuerySchema), assetAuditsController.list)

// Antes de "/:id" — si no, Express interpreta "coverage"/"audit-dashboard" como un :id.
assetAuditsRouter.get('/coverage', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(CoverageQuerySchema), assetAuditsController.coverage)

// Sección "Comentarios" de Cobertura — leer, agregar uno suelto, y marcar
// como visto (mismo gate que coverage: auditor y revisor, ambos leen/escriben).
assetAuditsRouter.get('/comments', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(CoverageQuerySchema), assetAuditsController.comments)
assetAuditsRouter.post('/comments', requireModule(...AUDITS_SHARED_READ_MODULES), validate(AddCommentSchema), assetAuditsController.addComment)
assetAuditsRouter.post('/comments/:id/mark-seen', requireModule(...AUDITS_SHARED_READ_MODULES), assetAuditsController.markCommentSeen)
assetAuditsRouter.get(
  '/audit-dashboard',
  requireModule('asset_audit_dashboard'),
  validateQuery(AuditDashboardQuerySchema),
  assetAuditsController.auditDashboard,
)
assetAuditsRouter.get(
  '/auditor-progress',
  requireModule('asset_audits'),
  validateQuery(AuditorProgressQuerySchema),
  assetAuditsController.auditorProgress,
)

// Asignación por activo individual — exclusivo del admin, reparte el pool
// elegible entre los auditores (ver asset-audits-assignments.service.ts).
assetAuditsRouter.get('/assignments', requireRole('ADMIN'), assetAuditsController.getAssignments)
assetAuditsRouter.put(
  '/assignments/:userId',
  requireRole('ADMIN'),
  validate(SaveAssignmentSchema),
  assetAuditsController.saveAssignment,
)

assetAuditsRouter.post('/', requireModule('asset_audit_coverage'), validate(CreateFireExtinguisherAuditSchema), assetAuditsController.create)

assetAuditsRouter.post(
  '/bulk-approve',
  requireModule('asset_audits'),
  validate(BulkApproveFireExtinguisherAuditsSchema),
  assetAuditsController.bulkApprove,
)

assetAuditsRouter.get('/:id', requireModule(...AUDITS_SHARED_READ_MODULES), assetAuditsController.getById)

assetAuditsRouter.put(
  '/:id',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  validate(UpdateFireExtinguisherAuditSchema),
  assetAuditsController.update,
)

assetAuditsRouter.post(
  '/:id/attachments',
  requireModule('asset_audit_coverage'),
  upload.single('file'),
  validate(AddFireExtinguisherAuditAttachmentSchema),
  assetAuditsController.addAttachment,
)

assetAuditsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireModule('asset_audit_coverage'),
  assetAuditsController.deleteAttachment,
)

assetAuditsRouter.get(
  '/:id/attachments/:attachmentId/download',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  assetAuditsController.downloadAttachment,
)

assetAuditsRouter.post(
  '/:id/review',
  requireModule('asset_audits'),
  validate(ReviewFireExtinguisherAuditSchema),
  assetAuditsController.review,
)
