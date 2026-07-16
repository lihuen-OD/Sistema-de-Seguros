import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { authMiddleware } from '../../middleware/auth.middleware'
import { validate } from '../../middleware/validate.middleware'
import { LoginSchema, ChangePasswordSchema } from './auth.schemas'
import { authController } from './auth.controller'

export const authRouter = Router()

// Más estricto que el rate limit global (300/15min en app.ts) — el login es
// el único endpoint del sistema que no requiere estar ya autenticado, así
// que es el blanco natural de fuerza bruta.
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Demasiados intentos. Esperá unos minutos y volvé a intentar.',
    },
  },
})

authRouter.post('/login', loginRateLimit, validate(LoginSchema), authController.login)

authRouter.use(authMiddleware)
authRouter.get('/me', authController.me)
authRouter.post('/logout', authController.logout)
authRouter.post('/change-password', validate(ChangePasswordSchema), authController.changePassword)
