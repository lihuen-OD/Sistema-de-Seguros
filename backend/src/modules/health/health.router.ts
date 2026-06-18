import { Router, Request, Response } from 'express'
import { prisma } from '../../config/database'
import { env } from '../../config/env'

export const healthRouter = Router()

healthRouter.get('/', async (req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    res.json({
      status: 'ok',
      db: 'connected',
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    })
  } catch {
    res.status(503).json({
      status: 'error',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
    })
  }
})
