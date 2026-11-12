import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  BudgetAuditLogQuerySchema,
  CreateBudgetSchema,
  ListBudgetsQuerySchema,
  UpdateBudgetSchema,
} from './insurance-budgets.schemas'
import { insuranceBudgetsController } from './insurance-budgets.controller'

export const insuranceBudgetsRouter = Router()

insuranceBudgetsRouter.use(authMiddleware)

// Lectura: `insurance_budgets`. Escritura: `insurance_budgets` Y
// `insurance_budgets_edit` (dos requireModule encadenados = AND, mismo patrón
// que policies + policy_renewals). ADMIN pasa siempre.
// No hay DELETE: un presupuesto y su historial nunca se borran — vaciar un
// mes es una edición (amountUsd: null) y queda auditada.

insuranceBudgetsRouter.get('/', requireModule('insurance_budgets'), validateQuery(ListBudgetsQuerySchema), insuranceBudgetsController.list)
insuranceBudgetsRouter.post(
  '/',
  requireModule('insurance_budgets'),
  requireModule('insurance_budgets_edit'),
  validate(CreateBudgetSchema),
  insuranceBudgetsController.create,
)
insuranceBudgetsRouter.put(
  '/:id',
  requireModule('insurance_budgets'),
  requireModule('insurance_budgets_edit'),
  validate(UpdateBudgetSchema),
  insuranceBudgetsController.update,
)
insuranceBudgetsRouter.get(
  '/:id/audit-log',
  requireModule('insurance_budgets'),
  validateQuery(BudgetAuditLogQuerySchema),
  insuranceBudgetsController.auditLog,
)
