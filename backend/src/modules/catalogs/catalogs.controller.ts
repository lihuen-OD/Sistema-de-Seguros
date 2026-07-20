import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { catalogsService } from './catalogs.service'
import type { CreateCatalogItemDTO, UpdateCatalogItemDTO } from './catalogs.schemas'

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
    async (req: Request<{ category: string }, unknown, CreateCatalogItemDTO>, res: Response) => {
      validateCategory(req.params.category)

      const { label, sortOrder } = req.body

      const item = await catalogsService.create(req.params.category, label, sortOrder)

      res.status(201).json({ data: item })
    },
  ),

  update: asyncHandler(
    async (req: Request<{ category: string; id: string }, unknown, UpdateCatalogItemDTO>, res: Response) => {
      validateCategory(req.params.category)

      const item = await catalogsService.update(req.params.id, req.body)
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
