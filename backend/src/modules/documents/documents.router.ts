import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import { documentsController } from './documents.controller'
import {
  CreateDocumentSchema,
  UpdateDocumentSchema,
  ListDocumentsQuerySchema,
  UpdateInstallmentSchema,
  ReplaceInstallmentsSchema,
  ReplaceAllocationsSchema,
  AddDocumentAttachmentSchema,
  BulkIdsQuerySchema,
} from './documents.schemas'

export const documentsRouter = Router()

documentsRouter.use(authMiddleware)

// ── Documentos ────────────────────────────────────────────────────────────────
documentsRouter.get('/', validateQuery(ListDocumentsQuerySchema), documentsController.list)
documentsRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateDocumentSchema),
  documentsController.create,
)

// ── Análisis financiero (debe ir antes de /:id para evitar conflicto de ruta) ─
documentsRouter.get('/financial', documentsController.getFinancial)

// ── Bulk (deben ir antes de /:id para evitar conflicto de ruta) ───────────────
documentsRouter.get('/bulk/installments', validateQuery(BulkIdsQuerySchema), documentsController.getBulkInstallments)
documentsRouter.get('/bulk/allocations', validateQuery(BulkIdsQuerySchema), documentsController.getBulkAllocations)

documentsRouter.get('/:id', documentsController.getById)
documentsRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateDocumentSchema),
  documentsController.update,
)
documentsRouter.delete('/:id', requireRole('ADMIN', 'CONTADOR'), documentsController.remove)

// ── Cuotas ────────────────────────────────────────────────────────────────────
documentsRouter.get('/:id/installments', documentsController.getInstallments)
documentsRouter.put(
  '/:id/installments',
  requireRole('ADMIN', 'CONTADOR'),
  validate(ReplaceInstallmentsSchema),
  documentsController.replaceInstallments,
)
documentsRouter.put(
  '/:id/installments/:installmentId',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateInstallmentSchema),
  documentsController.updateInstallment,
)

// ── Asignaciones de pólizas ───────────────────────────────────────────────────
documentsRouter.get('/:id/allocations', documentsController.getAllocations)
documentsRouter.put(
  '/:id/allocations',
  requireRole('ADMIN', 'CONTADOR'),
  validate(ReplaceAllocationsSchema),
  documentsController.replaceAllocations,
)

// ── Adjuntos ──────────────────────────────────────────────────────────────────
documentsRouter.get('/:id/attachments', documentsController.getAttachments)
documentsRouter.post(
  '/:id/attachments',
  requireRole('ADMIN', 'CONTADOR'),
  upload.single('file'),
  validate(AddDocumentAttachmentSchema),
  documentsController.addAttachment,
)
documentsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireRole('ADMIN', 'CONTADOR'),
  documentsController.deleteAttachment,
)
