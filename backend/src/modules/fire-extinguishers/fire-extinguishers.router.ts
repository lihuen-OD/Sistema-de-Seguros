import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import { fireExtinguishersController } from './fire-extinguishers.controller'
import {
  CreateFireExtinguisherSchema,
  UpdateFireExtinguisherSchema,
  ListFireExtinguishersQuerySchema,
  RechargeSchema,
  AddHistorySchema,
  BulkRechargeSchema,
} from './fire-extinguishers.schemas'

export const fireExtinguishersRouter = Router()

fireExtinguishersRouter.use(authMiddleware)

// Rutas estáticas ANTES de /:id para que Express no las interprete como param
fireExtinguishersRouter.get(
  '/by-asset/:assetId',
  fireExtinguishersController.getByAsset,
)
fireExtinguishersRouter.get('/dashboard/summary', fireExtinguishersController.getDashboardSummary)
fireExtinguishersRouter.post(
  '/bulk-recharge',
  requireModule('fire_extinguishers'),
  validate(BulkRechargeSchema),
  fireExtinguishersController.bulkRecharge,
)

// ── CRUD principal ────────────────────────────────────────────────────────────
fireExtinguishersRouter.get(
  '/',
  validateQuery(ListFireExtinguishersQuerySchema),
  fireExtinguishersController.list,
)
fireExtinguishersRouter.post(
  '/',
  requireModule('fire_extinguishers'),
  validate(CreateFireExtinguisherSchema),
  fireExtinguishersController.create,
)
fireExtinguishersRouter.get('/:id', fireExtinguishersController.getById)
fireExtinguishersRouter.put(
  '/:id',
  requireModule('fire_extinguishers'),
  validate(UpdateFireExtinguisherSchema),
  fireExtinguishersController.update,
)
fireExtinguishersRouter.delete('/:id', requireModule('fire_extinguishers'), fireExtinguishersController.remove)

// ── Recarga (actualiza fechas + registra historial) ───────────────────────────
fireExtinguishersRouter.post(
  '/:id/recharge',
  requireModule('fire_extinguishers'),
  validate(RechargeSchema),
  fireExtinguishersController.recharge,
)

// ── Historial ─────────────────────────────────────────────────────────────────
fireExtinguishersRouter.get('/:id/history', fireExtinguishersController.getHistory)
fireExtinguishersRouter.post(
  '/:id/history',
  requireModule('fire_extinguishers'),
  validate(AddHistorySchema),
  fireExtinguishersController.addHistory,
)
