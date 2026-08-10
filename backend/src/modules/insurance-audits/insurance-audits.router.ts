import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule, requireRole } from '../../middleware/roles.middleware'
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
  SaveAssignmentSchema,
  AddCommentSchema,
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
insuranceAuditsRouter.get('/comments', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(CoverageQuerySchema), insuranceAuditsController.comments)
// Comentario suelto ("Agregar comentario") — cualquiera de las dos partes
// puede dejar uno, sin necesidad de auditar.
insuranceAuditsRouter.post('/comments', requireModule(...AUDITS_SHARED_READ_MODULES), validate(AddCommentSchema), insuranceAuditsController.addComment)
// Bytes reales de la tarjeta de circulación de un activo (Ver/Descargar) —
// no pasa por :id porque también se usa antes de crear la auditoría (wizard).
insuranceAuditsRouter.get(
  '/assets/:assetId/circulation-card',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  insuranceAuditsController.downloadCirculationCard,
)
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

// Asignación por activo individual — exclusivo del admin, reparte el pool
// elegible entre los auditores (ver insurance-audits.service.ts#getAssignments).
insuranceAuditsRouter.get('/assignments', requireRole('ADMIN'), insuranceAuditsController.getAssignments)
insuranceAuditsRouter.put(
  '/assignments/:userId',
  requireRole('ADMIN'),
  validate(SaveAssignmentSchema),
  insuranceAuditsController.saveAssignment,
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

// Seguimiento de tarjeta de circulación: el auditor avisa (módulo de
// cobertura), el revisor confirma (módulo de revisión) — funciona aunque la
// auditoría ya esté aprobada, ver insurance-audits.service.ts.
insuranceAuditsRouter.post(
  '/:id/request-card-update',
  requireModule('insurance_audit_coverage'),
  insuranceAuditsController.requestCardUpdate,
)

insuranceAuditsRouter.post(
  '/:id/confirm-card-placed',
  requireModule('insurance_audits'),
  insuranceAuditsController.confirmCardPlaced,
)

// Seguimiento de comentarios: cualquiera de las dos partes marca como visto
// el comentario de la OTRA, desde la sección "Comentarios" de Cobertura — el
// service rechaza que alguien marque su propio comentario (SELF_SEEN_FORBIDDEN).
insuranceAuditsRouter.post(
  '/:id/mark-comment-seen',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  insuranceAuditsController.markCommentSeen,
)
