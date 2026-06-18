import { app } from './app'
import { env } from './config/env'
import { prisma } from './config/database'

const server = app.listen(env.PORT, () => {
  console.log(`✅  Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`)

  if (env.NODE_ENV === 'development') {
    console.log(`🔑  Dev token endpoint: POST http://localhost:${env.PORT}/dev/token`)
    console.log(`❤️   Health check:       GET  http://localhost:${env.PORT}/health`)
  }
})

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`\n${signal} received. Closing server...`)
  server.close(async () => {
    await prisma.$disconnect()
    console.log('Server closed.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
