import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import { AppError } from '../shared/errors/AppError'
import type { RequestUser } from '../shared/types'

// AUDITOR_MATAFUEGOS solo accede al flujo de auditoría mensual de
// matafuegos — nunca documentos contables, pólizas, activos, configuración
// ni reportes generales. Deny-by-default en un solo punto (acá) en vez de
// tener que acordarse de bloquearlo módulo por módulo: si mañana se agrega
// un router nuevo, este rol queda afuera automáticamente salvo que se sume
// explícitamente a esta lista.
// /api/v1/catalogs queda permitido de lectura en la práctica — sus
// escrituras ya las bloquea el requireRole('ADMIN','CONTADOR') propio de
// ese router.
const AUDITOR_MATAFUEGOS_ALLOWED_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/fire-extinguishers',
  '/api/v1/fire-extinguisher-audits',
  '/api/v1/catalogs',
]

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError(401, 'No autenticado', 'UNAUTHORIZED'))
  }

  const token = authHeader.split(' ')[1]

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as RequestUser
    req.user = payload

    if (
      payload.role === 'AUDITOR_MATAFUEGOS' &&
      !AUDITOR_MATAFUEGOS_ALLOWED_PREFIXES.some((prefix) => req.baseUrl.startsWith(prefix))
    ) {
      return next(new AppError(403, 'Sin permisos para realizar esta acción', 'FORBIDDEN'))
    }

    next()
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new AppError(401, 'Token expirado', 'TOKEN_EXPIRED'))
    } else {
      next(new AppError(401, 'Token inválido', 'TOKEN_INVALID'))
    }
  }
}
