import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { accessProfilesService } from './access-profiles.service'
import type { ListAccessProfilesQueryDTO } from './access-profiles.schemas'

export const accessProfilesController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await accessProfilesService.findAll(req.query as unknown as ListAccessProfilesQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const profile = await accessProfilesService.findById(req.params.id)
    res.json({ data: profile })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const profile = await accessProfilesService.create(req.body)
    res.status(201).json({ data: profile })
  }),

  update: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    const profile = await accessProfilesService.update(req.params.id, req.body)
    res.json({ data: profile })
  }),

  remove: asyncHandler(async (req: Request<{ id: string }>, res: Response) => {
    await accessProfilesService.remove(req.params.id)
    res.json({ data: { message: 'Perfil de acceso eliminado correctamente' } })
  }),
}
