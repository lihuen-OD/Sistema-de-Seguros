import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { costCentersService } from './cost-centers.service'
import type { ListCostCentersQueryDTO } from './cost-centers.schemas'

export const costCentersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await costCentersService.findAll(req.query as unknown as ListCostCentersQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const costCenter = await costCentersService.findById(req.params.id)
    res.json({ data: costCenter })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const costCenter = await costCentersService.create(req.body)
    res.status(201).json({ data: costCenter })
  }),

  update: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const costCenter = await costCentersService.update(req.params.id, req.body)
    res.json({ data: costCenter })
  }),

  remove: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await costCentersService.remove(req.params.id)
    res.json({ data: { message: 'Centro de costo eliminado correctamente' } })
  }),
}
