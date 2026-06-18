import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  CreateInsuranceTypeSchema,
  UpdateInsuranceTypeSchema,
  CreateCoverageSchema,
  ListInsuranceTypesQuerySchema,
} from './insurance-types.schemas'
import { insuranceTypesController } from './insurance-types.controller'

export const insuranceTypesRouter = Router()

insuranceTypesRouter.use(authMiddleware)

insuranceTypesRouter.get(
  '/',
  validateQuery(ListInsuranceTypesQuerySchema),
  insuranceTypesController.list,
)
insuranceTypesRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateInsuranceTypeSchema),
  insuranceTypesController.create,
)
insuranceTypesRouter.get('/:id', insuranceTypesController.getById)
insuranceTypesRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateInsuranceTypeSchema),
  insuranceTypesController.update,
)
insuranceTypesRouter.delete('/:id', requireRole('ADMIN'), insuranceTypesController.remove)

// Coberturas anidadas
insuranceTypesRouter.post(
  '/:id/coverages',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateCoverageSchema),
  insuranceTypesController.addCoverage,
)
insuranceTypesRouter.delete(
  '/:id/coverages/:coverageId',
  requireRole('ADMIN', 'CONTADOR'),
  insuranceTypesController.removeCoverage,
)
