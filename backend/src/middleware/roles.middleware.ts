import { Request, Response, NextFunction } from 'express'
import { AppError } from '../shared/errors/AppError'
import type { Role } from '../shared/types'

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(403, 'Sin permisos para realizar esta acción', 'FORBIDDEN'),
      )
    }

    next()
  }
}
