import { PrismaClient } from '@prisma/client'

// Singleton — evita múltiples conexiones en hot-reload (desarrollo)
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
