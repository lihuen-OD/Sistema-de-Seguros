import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validateQuery } from '../../middleware/validate.middleware'
import { GlobalSearchQuerySchema } from './search.schemas'
import { searchController } from './search.controller'

export const searchRouter = Router()

searchRouter.use(authMiddleware)

// Alcanza con uno de los tres módulos para entrar — el service arma solo
// los grupos cuyo detalle el usuario puede abrir (ver canSearch).
searchRouter.get(
  '/',
  requireModule('assets', 'policies', 'documents'),
  validateQuery(GlobalSearchQuerySchema),
  searchController.search,
)
