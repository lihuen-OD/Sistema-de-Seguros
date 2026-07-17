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
  requireModule('fire_extinguishers'),
  fireExtinguishersController.getByAsset,
)
fireExtinguishersRouter.get(
  '/dashboard/summary',
  requireModule('fire_extinguisher_dashboard'),
  fireExtinguishersController.getDashboardSummary,
)
fireExtinguishersRouter.post(
  '/bulk-recharge',
  requireModule('fire_extinguishers'),
  validate(BulkRechargeSchema),
  fireExtinguishersController.bulkRecharge,
)

// ── CRUD principal ────────────────────────────────────────────────────────────
// El listado también lo consumen Dashboard y la ficha de Activos.
fireExtinguishersRouter.get(
  '/',
  requireModule('fire_extinguishers', 'dashboard', 'assets'),
  validateQuery(ListFireExtinguishersQuerySchema),
  fireExtinguishersController.list,
)
fireExtinguishersRouter.post(
  '/',
  requireModule('fire_extinguishers'),
  validate(CreateFireExtinguisherSchema),
  fireExtinguishersController.create,
)
// El detalle también lo consumen las pantallas de Auditorías (para mostrar
// el matafuego auditado/a auditar).
fireExtinguishersRouter.get(
  '/:id',
  requireModule('fire_extinguishers', 'fire_extinguisher_audit_coverage', 'fire_extinguisher_audits'),
  fireExtinguishersController.getById,
)
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
fireExtinguishersRouter.get('/:id/history', requireModule('fire_extinguishers'), fireExtinguishersController.getHistory)
fireExtinguishersRouter.post(
  '/:id/history',
  requireModule('fire_extinguishers'),
  validate(AddHistorySchema),
  fireExtinguishersController.addHistory,
)
