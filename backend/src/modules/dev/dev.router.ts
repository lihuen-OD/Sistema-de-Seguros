import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../../config/env'
import type { Role } from '../../shared/types'

// Este router SOLO se monta en NODE_ENV=development (ver app.ts).
// Permite generar tokens JWT para pruebas sin depender de la plataforma externa.

export const devRouter = Router()

const VALID_ROLES: Role[] = ['ADMIN', 'CONTADOR', 'PRODUCTOR', 'VIEWER']

devRouter.post('/token', (req: Request, res: Response) => {
  const role: Role = VALID_ROLES.includes(req.body?.role) ? req.body.role : 'ADMIN'

  const token = jwt.sign(
    {
      userId: 'dev-user-001',
      role,
      email: 'dev@losodwyer.com',
    },
    env.JWT_SECRET,
    { expiresIn: '30d' },
  )

  res.json({
    token,
    role,
    usage: 'Authorization: Bearer <token>',
    note: 'Token de desarrollo — válido 30 días. No disponible en producción.',
  })
})

devRouter.get('/token/roles', (req: Request, res: Response) => {
  res.json({ roles: VALID_ROLES })
})
