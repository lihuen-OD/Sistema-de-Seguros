import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { catalogsService } from './catalogs.service'

// Valida que category sea un string alfanumérico con guiones bajos (sin espacios ni caracteres especiales)
const CATEGORY_REGEX = /^[a-zA-Z0-9_]+$/

function validateCategory(category: string): void {
  if (!category || !CATEGORY_REGEX.test(category)) {
    throw new AppError(
      400,
      'La categoría debe ser un string alfanumérico con guiones bajos',
      'VALIDATION_ERROR',
    )
  }
}

export const catalogsController = {
  listActive: asyncHandler(
    async (req: Request<{ category: string }>, res: Response) => {
      validateCategory(req.params.category)
      const items = await catalogsService.findByCategory(req.params.category)
      res.json({ data: items })
    },
  ),

  listAll: asyncHandler(
    async (req: Request<{ category: string }>, res: Response) => {
      validateCategory(req.params.category)
      const items = await catalogsService.findAll(req.params.category)
      res.json({ data: items })
    },
  ),

  create: asyncHandler(
    async (req: Request<{ category: string }>, res: Response) => {
      validateCategory(req.params.category)

      const { label, sortOrder } = req.body as { label?: unknown; sortOrder?: unknown }

      if (!label || typeof label !== 'string' || label.trim() === '') {
        throw new AppError(400, 'El campo label es requerido y no puede estar vacío', 'VALIDATION_ERROR')
      }

      if (label.trim().length > 200) {
        throw new AppError(400, 'El campo label no puede superar los 200 caracteres', 'VALIDATION_ERROR')
      }

      if (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder))) {
        throw new AppError(400, 'sortOrder debe ser un número entero', 'VALIDATION_ERROR')
      }

      const item = await catalogsService.create(
        req.params.category,
        label.trim(),
        typeof sortOrder === 'number' ? sortOrder : undefined,
      )

      res.status(201).json({ data: item })
    },
  ),

  update: asyncHandler(
    async (req: Request<{ category: string; id: string }>, res: Response) => {
      validateCategory(req.params.category)

      const { label, sortOrder, isActive } = req.body as {
        label?: unknown
        sortOrder?: unknown
        isActive?: unknown
      }

      if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) {
        throw new AppError(400, 'El campo label no puede estar vacío', 'VALIDATION_ERROR')
      }

      if (typeof label === 'string' && label.trim().length > 200) {
        throw new AppError(400, 'El campo label no puede superar los 200 caracteres', 'VALIDATION_ERROR')
      }

      if (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isInteger(sortOrder))) {
        throw new AppError(400, 'sortOrder debe ser un número entero', 'VALIDATION_ERROR')
      }

      if (isActive !== undefined && typeof isActive !== 'boolean') {
        throw new AppError(400, 'isActive debe ser un booleano', 'VALIDATION_ERROR')
      }

      const updateData: { label?: string; sortOrder?: number; isActive?: boolean } = {}
      if (label !== undefined) updateData.label = (label as string).trim()
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder as number
      if (isActive !== undefined) updateData.isActive = isActive as boolean

      const item = await catalogsService.update(req.params.id, updateData)
      res.json({ data: item })
    },
  ),

  remove: asyncHandler(
    async (req: Request<{ category: string; id: string }>, res: Response) => {
      validateCategory(req.params.category)
      await catalogsService.delete(req.params.id)
      res.json({ data: { message: 'Item eliminado correctamente' } })
    },
  ),
}
