import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/roles.middleware'
import { validate, validateQuery } from '../../middleware/validate.middleware'
import {
  CreateCompanySchema,
  UpdateCompanySchema,
  ListCompaniesQuerySchema,
} from './companies.schemas'
import { companiesController } from './companies.controller'

export const companiesRouter = Router()

companiesRouter.use(authMiddleware)

companiesRouter.get('/', validateQuery(ListCompaniesQuerySchema), companiesController.list)
companiesRouter.post(
  '/',
  requireRole('ADMIN', 'CONTADOR'),
  validate(CreateCompanySchema),
  companiesController.create,
)
companiesRouter.get('/:id', companiesController.getById)
companiesRouter.put(
  '/:id',
  requireRole('ADMIN', 'CONTADOR'),
  validate(UpdateCompanySchema),
  companiesController.update,
)
companiesRouter.delete('/:id', requireRole('ADMIN'), companiesController.remove)
