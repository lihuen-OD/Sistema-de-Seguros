import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { upload } from '../../middleware/upload.middleware'
import { claimsController } from './claims.controller'
import {
  CreateClaimSchema,
  UpdateClaimSchema,
  ListClaimsQuerySchema,
  AddEventSchema,
  AddClaimAttachmentSchema,
  CreateExpenseSchema,
  UpdateExpenseSchema,
} from './claims.schemas'

export const claimsRouter = Router()

claimsRouter.use(authMiddleware)

// ── CRUD ──────────────────────────────────────────────────────────────────────
claimsRouter.get('/', validateQuery(ListClaimsQuerySchema), claimsController.list)
claimsRouter.post(
  '/',
  requireModule('claims'),
  validate(CreateClaimSchema),
  claimsController.create,
)
claimsRouter.get('/:id', claimsController.getById)
claimsRouter.put(
  '/:id',
  requireModule('claims'),
  validate(UpdateClaimSchema),
  claimsController.update,
)
claimsRouter.delete('/:id', requireModule('claims'), claimsController.remove)

// ── Eventos ───────────────────────────────────────────────────────────────────
claimsRouter.get('/:id/events', claimsController.getEvents)
claimsRouter.post(
  '/:id/events',
  requireModule('claims'),
  validate(AddEventSchema),
  claimsController.addEvent,
)
claimsRouter.delete(
  '/:id/events/:eventId',
  requireModule('claims'),
  claimsController.deleteEvent,
)

// ── Gastos ────────────────────────────────────────────────────────────────────
claimsRouter.get('/:id/expenses', claimsController.getExpenses)
claimsRouter.post(
  '/:id/expenses',
  requireModule('claims'),
  validate(CreateExpenseSchema),
  claimsController.addExpense,
)
claimsRouter.put(
  '/:id/expenses/:expenseId',
  requireModule('claims'),
  validate(UpdateExpenseSchema),
  claimsController.updateExpense,
)
claimsRouter.delete(
  '/:id/expenses/:expenseId',
  requireModule('claims'),
  claimsController.deleteExpense,
)

// ── Attachments ───────────────────────────────────────────────────────────────
claimsRouter.get('/:id/attachments', claimsController.getAttachments)
claimsRouter.post(
  '/:id/attachments',
  requireModule('claims'),
  upload.single('file'),
  validate(AddClaimAttachmentSchema),
  claimsController.addAttachment,
)
claimsRouter.delete(
  '/:id/attachments/:attachmentId',
  requireModule('claims'),
  claimsController.deleteAttachment,
)
claimsRouter.get('/:id/attachments/:attachmentId/download', claimsController.downloadAttachment)
