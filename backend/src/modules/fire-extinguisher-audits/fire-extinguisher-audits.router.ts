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
  AuditDashboardQuerySchema,
  AuditorProgressQuerySchema,
  CleanlinessHistoryQuerySchema,
  AddCommentSchema,
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

// Sección "Comentarios" de Cobertura — leer, agregar uno suelto, y marcar
// como visto (mismo gate que coverage: auditor y revisor, ambos leen/escriben).
fireExtinguisherAuditsRouter.get('/comments', requireModule(...AUDITS_SHARED_READ_MODULES), validateQuery(CoverageQuerySchema), fireExtinguisherAuditsController.comments)
fireExtinguisherAuditsRouter.post('/comments', requireModule(...AUDITS_SHARED_READ_MODULES), validate(AddCommentSchema), fireExtinguisherAuditsController.addComment)
fireExtinguisherAuditsRouter.post(
  '/comments/:id/mark-seen',
  requireModule(...AUDITS_SHARED_READ_MODULES),
  fireExtinguisherAuditsController.markCommentSeen,
)
fireExtinguisherAuditsRouter.get(
  '/audit-dashboard',
  requireModule('fire_extinguisher_audits'),
  validateQuery(AuditDashboardQuerySchema),
  fireExtinguisherAuditsController.auditDashboard,
)

// Progreso por auditor — vista de revisor/admin sobre el trabajo de otros,
// mismo gate que el dashboard general (no `_coverage`: un auditor no debe
// ver el detalle de asignación/avance de sus compañeros).
fireExtinguisherAuditsRouter.get(
  '/auditor-progress',
  requireModule('fire_extinguisher_audits'),
  validateQuery(AuditorProgressQuerySchema),
  fireExtinguisherAuditsController.auditorProgress,
)

// Historial de limpieza multi-período (heatmap sector × mes) — misma vista
// ejecutiva que audit-dashboard/auditor-progress, mismo gate.
fireExtinguisherAuditsRouter.get(
  '/cleanliness-history',
  requireModule('fire_extinguisher_audits'),
  validateQuery(CleanlinessHistoryQuerySchema),
  fireExtinguisherAuditsController.cleanlinessHistory,
)

fireExtinguisherAuditsRouter.get(
  '/available-periods',
  requireModule('fire_extinguisher_audits'),
  fireExtinguisherAuditsController.availablePeriods,
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
