import { Request, Response } from 'express'
import { asyncHandler } from '../../shared/utils/async-handler'
import { AppError } from '../../shared/errors/AppError'
import { authService } from './auth.service'
import type { LoginDTO, ChangePasswordDTO } from './auth.schemas'

export const authController = {
  login: asyncHandler(async (req: Request<unknown, unknown, LoginDTO>, res: Response) => {
    const result = await authService.login(req.body, req.ip)
    res.json({ data: result })
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const user = await authService.me(req.user.userId)
    res.json({ data: user })
  }),

  // JWT es stateless — no hay nada que invalidar del lado del servidor hoy.
  // Existe por simetría para que el frontend tenga un endpoint que llamar.
  logout: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: { message: 'Sesión cerrada' } })
  }),

  changePassword: asyncHandler(async (req: Request<unknown, unknown, ChangePasswordDTO>, res: Response) => {
    if (!req.user) throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    const result = await authService.changePassword(req.user.userId, req.body)
    res.json({ data: result })
  }),
}
