import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { claimsController } from './claims.controller'
import {
  CreateClaimSchema,
  UpdateClaimSchema,
  ListClaimsQuerySchema,
  AddEventSchema,
} from './claims.schemas'

export const claimsRouter = Router()

claimsRouter.use(authMiddleware)

// ── CRUD ──────────────────────────────────────────────────────────────────────
claimsRouter.get('/', validateQuery(ListClaimsQuerySchema), claimsController.list)
claimsRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateClaimSchema),
  claimsController.create,
)
claimsRouter.get('/:id', claimsController.getById)
claimsRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateClaimSchema),
  claimsController.update,
)
claimsRouter.delete('/:id', requireRole('ADMIN'), claimsController.remove)

// ── Eventos ───────────────────────────────────────────────────────────────────
claimsRouter.get('/:id/events', claimsController.getEvents)
claimsRouter.post(
  '/:id/events',
  requireRole('ADMIN', 'CONTADOR'),
  validate(AddEventSchema),
  claimsController.addEvent,
)
claimsRouter.delete(
  '/:id/events/:eventId',
  requireRole('ADMIN'),
  claimsController.deleteEvent,
)
