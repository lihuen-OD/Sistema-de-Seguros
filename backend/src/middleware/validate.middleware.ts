import { Request, Response, NextFunction } from 'express'
import { ZodSchema } from 'zod'

// Valida req.body contra un schema Zod.
// En éxito reemplaza req.body con el valor parseado (incluye defaults y coerciones).
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)
    if (!result.success) {
      next(result.error)
      return
    }
    req.body = result.data
    next()
  }
}

// Valida req.query — útil para filtros y paginación.
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query)
    if (!result.success) {
      next(result.error)
      return
    }
    // req.query es readonly en Express types pero necesitamos mutarlo
    ;(req as Request & { query: Record<string, unknown> }).query = result.data
    next()
  }
}
