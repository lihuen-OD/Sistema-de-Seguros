import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
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
  requireModule('companies'),
  validate(CreateCompanySchema),
  companiesController.create,
)
companiesRouter.get('/:id', companiesController.getById)
companiesRouter.put(
  '/:id',
  requireModule('companies'),
  validate(UpdateCompanySchema),
  companiesController.update,
)
companiesRouter.delete('/:id', requireModule('companies'), companiesController.remove)
