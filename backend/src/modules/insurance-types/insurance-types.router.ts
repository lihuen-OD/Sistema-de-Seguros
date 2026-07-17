import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
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
  requireModule('insurance_types'),
  validate(CreateInsuranceTypeSchema),
  insuranceTypesController.create,
)
insuranceTypesRouter.get('/:id', insuranceTypesController.getById)
insuranceTypesRouter.put(
  '/:id',
  requireModule('insurance_types'),
  validate(UpdateInsuranceTypeSchema),
  insuranceTypesController.update,
)
insuranceTypesRouter.delete('/:id', requireModule('insurance_types'), insuranceTypesController.remove)

// Coberturas anidadas
insuranceTypesRouter.post(
  '/:id/coverages',
  requireModule('insurance_types'),
  validate(CreateCoverageSchema),
  insuranceTypesController.addCoverage,
)
insuranceTypesRouter.delete(
  '/:id/coverages/:coverageId',
  requireModule('insurance_types'),
  insuranceTypesController.removeCoverage,
)
