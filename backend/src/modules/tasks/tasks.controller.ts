import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { tasksService } from './tasks.service'
import type { ListTasksQueryDTO } from './tasks.schemas'

export const tasksController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await tasksService.findAll(req.query as unknown as ListTasksQueryDTO)
    res.json(result)
  }),
}
