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

// También lo consume el formulario de Pólizas (selector de tipo de seguro).
const INSURANCE_TYPES_READ_MODULES = ['insurance_types', 'policies'] as const

insuranceTypesRouter.get(
  '/',
  requireModule(...INSURANCE_TYPES_READ_MODULES),
  validateQuery(ListInsuranceTypesQuerySchema),
  insuranceTypesController.list,
)
insuranceTypesRouter.post(
  '/',
  requireModule('insurance_types'),
  validate(CreateInsuranceTypeSchema),
  insuranceTypesController.create,
)
insuranceTypesRouter.get('/:id', requireModule(...INSURANCE_TYPES_READ_MODULES), insuranceTypesController.getById)
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
