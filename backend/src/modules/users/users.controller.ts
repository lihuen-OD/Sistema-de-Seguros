import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { usersService } from './users.service'
import type { CreateUserDTO, UpdateUserDTO, ResetPasswordDTO } from './users.schemas'

type IdParam = { id: string }

export const usersController = {
  list: asyncHandler(async (_req: Request, res: Response) => {
    const users = await usersService.findAll()
    res.json({ data: users })
  }),

  create: asyncHandler(async (req: Request<unknown, unknown, CreateUserDTO>, res: Response) => {
    const user = await usersService.create(req.body)
    res.status(201).json({ data: user })
  }),

  update: asyncHandler(async (req: Request<IdParam, unknown, UpdateUserDTO>, res: Response) => {
    const user = await usersService.update(req.params.id, req.body)
    res.json({ data: user })
  }),

  resetPassword: asyncHandler(async (req: Request<IdParam, unknown, ResetPasswordDTO>, res: Response) => {
    const result = await usersService.resetPassword(req.params.id, req.body.newPassword)
    res.json({ data: result })
  }),
}
