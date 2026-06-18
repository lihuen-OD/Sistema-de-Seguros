import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AppError } from '../shared/errors/AppError'
import type { RequestUser } from '../shared/types'

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as RequestUser
    req.user = payload
    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AppError(401, 'Token expirado', 'TOKEN_EXPIRED'))
    } else {
      next(new AppError(401, 'Token inválido', 'TOKEN_INVALID'))
    }
  }
}
