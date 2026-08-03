import { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { ZodError } from 'zod'
import { AppError } from '../shared/errors/AppError'

const MULTER_ERROR_MESSAGES: Record<string, string> = {
  LIMIT_FILE_SIZE: 'El archivo supera el tamaño máximo permitido (20 MB)',
  LIMIT_FILE_COUNT: 'Solo se puede subir un archivo por vez',
  LIMIT_UNEXPECTED_FILE: 'Campo de archivo inesperado',
}

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

  // Error de Multer (ej. archivo demasiado grande) — antes caía al 500
  // genérico de más abajo; acá se traduce a un 413/400 con mensaje claro.
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    res.status(status).json({
      error: {
        code: err.code,
        message: MULTER_ERROR_MESSAGES[err.code] ?? 'Error al procesar el archivo subido',
      },
    })
    return
  }

  // Error desconocido — se loguea siempre (también en producción: Render
  // captura stdout/stderr en sus propios logs, no depende de un servicio
  // externo). Antes solo se logueaba en development, así que un error real
  // en producción no dejaba ningún rastro para investigar después.
  console.error(`[Unhandled Error] ${req.method} ${req.path}`, err)

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor',
    },
  })
}
