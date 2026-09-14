import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { tasksService } from './tasks.service'
import type { ListTasksQueryDTO } from './tasks.schemas'

type IdParam = { id: string }

export const tasksController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await tasksService.findAll(req.query as unknown as ListTasksQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const task = await tasksService.findById(req.params.id)
    res.json({ data: task })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const task = await tasksService.create(req.body)
    res.status(201).json({ data: task })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const task = await tasksService.update(req.params.id, req.body)
    res.json({ data: task })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await tasksService.remove(req.params.id)
    res.json({ data: { message: 'Tarea eliminada correctamente' } })
  }),
}
