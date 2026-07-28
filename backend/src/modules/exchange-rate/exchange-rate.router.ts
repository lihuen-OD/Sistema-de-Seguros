import { Router } from 'express'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireModule } from '../../middleware/roles.middleware'
import { validate } from '../../middleware/validate.middleware'
import { exchangeRateController } from './exchange-rate.controller'
import { SetExchangeRateSchema } from './exchange-rate.schemas'

export const exchangeRateRouter = Router()

// GET /current — cualquier usuario autenticado necesita leerlo para
// prellenar el tipo de cambio en sus propios formularios (pólizas, documentos,
// siniestros, activos).
exchangeRateRouter.get('/current', authMiddleware, exchangeRateController.getCurrent)

// GET /history — historial de actualizaciones. Requiere el módulo
// module_config (o ser ADMIN), mismo criterio que Catálogos.
exchangeRateRouter.get('/history', authMiddleware, requireModule('module_config'), exchangeRateController.getHistory)

// POST / — actualiza el tipo de cambio actual (inserta una fila nueva en el
// log). Requiere el módulo module_config (o ser ADMIN).
exchangeRateRouter.post(
  '/',
  authMiddleware,
  requireModule('module_config'),
  validate(SetExchangeRateSchema),
  exchangeRateController.setCurrent,
)
