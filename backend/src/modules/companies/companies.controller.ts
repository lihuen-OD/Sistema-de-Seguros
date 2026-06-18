import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { companiesService } from './companies.service'
import type { ListCompaniesQueryDTO } from './companies.schemas'

export const companiesController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await companiesService.findAll(req.query as unknown as ListCompaniesQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const company = await companiesService.findById(req.params.id)
    res.json({ data: company })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const company = await companiesService.create(req.body)
    res.status(201).json({ data: company })
  }),

  update: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const company = await companiesService.update(req.params.id, req.body)
    res.json({ data: company })
  }),

  remove: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await companiesService.softDelete(req.params.id)
    res.json({ data: { message: 'Empresa desactivada correctamente' } })
  }),
}
