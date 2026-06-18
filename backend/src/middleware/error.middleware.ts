import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../shared/errors/AppError'
import { env } from '../config/env'

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // next debe estar en la firma aunque no se use — Express lo requiere para detectar error handlers
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  // Error controlado de la aplicación
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code ?? 'APP_ERROR',
        message: err.message,
      },
    })
    return
  }

  // Error de validación Zod (viene de validate middleware o ZodError lanzado manualmente)
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    })
    return
  }

  // Error desconocido — loguear en desarrollo, respuesta genérica siempre
  if (env.NODE_ENV === 'development') {
    console.error('[Unhandled Error]', err)
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    },
  })
}
