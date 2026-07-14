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
  CancelDocumentSchema,
  BulkIdsQuerySchema,
  SendDocumentEmailSchema,
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

// ── Tipos de documento controlados (debe ir antes de /:id) ───────────────────
documentsRouter.get('/types', documentsController.getTypes)

// ── Verificación de número duplicado (debe ir antes de /:id) ─────────────────
documentsRouter.get('/check-number', documentsController.checkNumber)

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

// ── Saldo y ciclo de aplicación (Fase 2) ──────────────────────────────────────
documentsRouter.get('/:id/balance', documentsController.getBalance)
documentsRouter.post('/:id/apply', requireRole('ADMIN', 'CONTADOR'), documentsController.apply)
documentsRouter.post(
  '/:id/cancel',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CancelDocumentSchema),
  documentsController.cancel,
)
documentsRouter.post(
  '/:id/send-email',
  requireRole('ADMIN', 'CONTADOR'),
  validate(SendDocumentEmailSchema),
  documentsController.sendEmail,
)

// ── Auditoría (Fase 4) ────────────────────────────────────────────────────────
documentsRouter.get('/:id/audit-log', documentsController.getAuditLog)

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
documentsRouter.get('/:id/attachments/:attachmentId/download', documentsController.downloadAttachment)
