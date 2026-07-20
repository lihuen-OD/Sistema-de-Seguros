import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { prisma } from '../config/database'
import { AppError } from '../shared/errors/AppError'
import { asyncHandler } from '../shared/utils/async-handler'
import type { JwtPayload, ModuleKey, Role } from '../shared/types'

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

  next()
})
