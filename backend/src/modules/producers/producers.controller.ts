import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { producersService } from './producers.service'
import type { ListProducersQueryDTO } from './producers.schemas'

type IdParam = { id: string }
type TaskParam = { id: string; taskId: string }

export const producersController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const result = await producersService.findAll(req.query as unknown as ListProducersQueryDTO)
    res.json(result)
  }),

  getById: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const producer = await producersService.findById(req.params.id)
    res.json({ data: producer })
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const producer = await producersService.create(req.body)
    res.status(201).json({ data: producer })
  }),

  update: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const producer = await producersService.update(req.params.id, req.body)
    res.json({ data: producer })
  }),

  remove: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    await producersService.softDelete(req.params.id)
    res.json({ data: { message: 'Productor desactivado correctamente' } })
  }),

  // Tasks
  getTasks: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const tasks = await producersService.findTasks(req.params.id)
    res.json({ data: tasks })
  }),

  createTask: asyncHandler(async (req: Request<IdParam>, res: Response) => {
    const task = await producersService.createTask(req.params.id, req.body)
    res.status(201).json({ data: task })
  }),

  updateTask: asyncHandler(async (req: Request<TaskParam>, res: Response) => {
    const task = await producersService.updateTask(req.params.id, req.params.taskId, req.body)
    res.json({ data: task })
  }),

  deleteTask: asyncHandler(async (req: Request<TaskParam>, res: Response) => {
    await producersService.deleteTask(req.params.id, req.params.taskId)
    res.json({ data: { message: 'Tarea eliminada correctamente' } })
  }),
}
