import { Request, Response, NextFunction } from 'express'
import { AppError } from '../shared/errors/AppError'
import type { ModuleKey, Role } from '../shared/types'

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

// ADMIN pasa siempre (bypass total); cualquier otro usuario necesita tener
// este módulo en los módulos resueltos de su perfil de acceso.
export function requireModule(module: ModuleKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
    }
    if (req.user.role === 'ADMIN') {
      return next()
    }
    if (!req.user.modules.includes(module)) {
      return next(new AppError(403, 'Sin permisos para realizar esta acción', 'FORBIDDEN'))
    }
    next()
  }
}
