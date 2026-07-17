import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { fixedAssetsService } from './fixed-assets.service'
import type { ListFixedAssetsQueryDTO } from './fixed-assets.schemas'

export const fixedAssetsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await fixedAssetsService.findAll(req.query as unknown as ListFixedAssetsQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const fixedAsset = await fixedAssetsService.findById(req.params.id)
    res.json({ data: fixedAsset })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const fixedAsset = await fixedAssetsService.create(req.body)
    res.status(201).json({ data: fixedAsset })
  }),

  update: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const fixedAsset = await fixedAssetsService.update(req.params.id, req.body)
    res.json({ data: fixedAsset })
  }),

  remove: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await fixedAssetsService.remove(req.params.id)
    res.json({ data: { message: 'Bien de uso eliminado correctamente' } })
  }),
}
