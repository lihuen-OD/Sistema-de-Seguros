import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate } from '../../middleware/validate.middleware'
import { UpsertRenewalProjectionOverrideSchema } from './renewal-projections.schemas'
import { renewalProjectionsController } from './renewal-projections.controller'

export const renewalProjectionsRouter = Router()

renewalProjectionsRouter.use(authMiddleware)

// `mode` (FINANCIAL/ECONOMIC) es un segmento de ruta, validado en el service
// (parseMode) — cualquiera de los dos módulos puede pegarle a cualquier modo,
// el filtro por `mode` en el `where` ya aísla los datos de cada página.
const RENEWAL_PROJECTION_MODULES = ['renewal_projections', 'renewal_projections_economic'] as const

renewalProjectionsRouter.get('/overrides/:mode', requireModule(...RENEWAL_PROJECTION_MODULES), renewalProjectionsController.list)
renewalProjectionsRouter.put(
  '/overrides/:mode/:assetId',
  requireModule(...RENEWAL_PROJECTION_MODULES),
  validate(UpsertRenewalProjectionOverrideSchema),
  renewalProjectionsController.upsert,
)
renewalProjectionsRouter.delete('/overrides/:mode/:assetId', requireModule(...RENEWAL_PROJECTION_MODULES), renewalProjectionsController.reset)
