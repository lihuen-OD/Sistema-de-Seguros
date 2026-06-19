import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validateQuery } from '../../middleware/validate.middleware'
import { dashboardController } from './dashboard.controller'
import {
  ExpiringPoliciesQuerySchema,
  ExpiringInstallmentsQuerySchema,
  ChartsQuerySchema,
} from './dashboard.schemas'

export const dashboardRouter = Router()

dashboardRouter.use(authMiddleware)

dashboardRouter.get('/kpis', dashboardController.getKpis)
dashboardRouter.get(
  '/expiring-policies',
  validateQuery(ExpiringPoliciesQuerySchema),
  dashboardController.getExpiringPolicies,
)
dashboardRouter.get(
  '/expiring-installments',
  validateQuery(ExpiringInstallmentsQuerySchema),
  dashboardController.getExpiringInstallments,
)
dashboardRouter.get('/charts', validateQuery(ChartsQuerySchema), dashboardController.getCharts)
