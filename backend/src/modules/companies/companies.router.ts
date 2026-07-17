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

// Company es dato de referencia consumido como selector por varios módulos
// (Assets, Pólizas, Dashboard, Análisis financiero/económico) además de su
// propia pantalla de configuración — de ahí la lista amplia de módulos.
const COMPANIES_READ_MODULES = ['companies', 'dashboard', 'assets', 'policies', 'financial_analysis', 'economic_analysis'] as const

companiesRouter.get('/', requireModule(...COMPANIES_READ_MODULES), validateQuery(ListCompaniesQuerySchema), companiesController.list)
companiesRouter.post(
  '/',
  requireModule('companies'),
  validate(CreateCompanySchema),
  companiesController.create,
)
companiesRouter.get('/:id', requireModule(...COMPANIES_READ_MODULES), companiesController.getById)
companiesRouter.put(
  '/:id',
  requireModule('companies'),
  validate(UpdateCompanySchema),
  companiesController.update,
)
companiesRouter.delete('/:id', requireModule('companies'), companiesController.remove)
