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
// AL MENOS UNO de los módulos indicados en los módulos resueltos de su
// perfil de acceso (variádico para las rutas que sirven a más de un módulo,
// ej. /fire-extinguisher-audits, que auditor y revisor comparten).
export function requireModule(...modules: ModuleKey[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
    }
    if (req.user.role === 'ADMIN') {
      return next()
    }
    if (!modules.some((module) => req.user!.modules.includes(module))) {
      return next(new AppError(403, 'Sin permisos para realizar esta acción', 'FORBIDDEN'))
    }
    next()
  }
}
