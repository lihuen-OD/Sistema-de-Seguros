import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import { AppError } from '../shared/errors/AppError'
import { asyncHandler } from '../shared/utils/async-handler'
import { TOKEN_EXPIRES_IN } from '../modules/auth/auth.service'
import type { JwtPayload, ModuleKey, Role } from '../shared/types'

// Sesión deslizante: el token dura 12hs (TOKEN_EXPIRES_IN) desde que se firma,
// pero si el usuario sigue activo no debería quedar afuera a mitad de uso solo
// porque pasaron 12hs desde el login. Cada vez que un token "viejo" (más de
// RENEW_THRESHOLD_SECONDS desde que se emitió) pasa por acá, se firma uno
// nuevo con otras 12hs completas y se lo mandamos al frontend por header —
// mientras haya al menos un request cada RENEW_THRESHOLD_SECONDS, el token
// nunca llega a vencer. Si el usuario deja de usar la app 12hs seguidas, el
// jwt.verify de abajo lo rechaza por TOKEN_EXPIRED antes de llegar a esta
// lógica, como corresponde.
const RENEW_THRESHOLD_SECONDS = 60 * 60
export const RENEWED_TOKEN_HEADER = 'X-Renewed-Token'

// Se resuelve el usuario fresco desde la base en cada request (no se confía
// en role/módulos cacheados en el JWT) — así, desactivar a alguien o
// cambiarle el perfil de acceso surte efecto en el próximo request, no en el
// próximo login.
export const authMiddleware = asyncHandler(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
  }

  const token = authHeader.split(' ')[1]

  let payload: JwtPayload
  try {
    // algorithms explícito (defensa en profundidad): sin esto, jwt.verify
    // infiere el algoritmo del propio token en vez de exigir uno fijo.
    payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as JwtPayload
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'Token expirado', 'TOKEN_EXPIRED'))
    }
    return next(new AppError(401, 'Token inválido', 'TOKEN_INVALID'))
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: { accessProfile: true },
  })

  if (!user || !user.isActive) {
    return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
  }

  req.user = {
    userId: user.id,
    email: user.email,
    role: user.role as Role,
    modules: (user.role === 'ADMIN' ? [] : (user.accessProfile?.modules ?? [])) as ModuleKey[],
  }

  if (payload.iat && Date.now() / 1000 - payload.iat > RENEW_THRESHOLD_SECONDS) {
    const renewedToken = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN })
    res.setHeader(RENEWED_TOKEN_HEADER, renewedToken)
  }

  next()
})
