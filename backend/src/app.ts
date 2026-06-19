import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import { env } from './config/env'
import { errorMiddleware } from './middleware/error.middleware'
import { healthRouter } from './modules/health/health.router'
import { devRouter } from './modules/dev/dev.router'
import { companiesRouter } from './modules/companies/companies.router'
import { costCentersRouter } from './modules/cost-centers/cost-centers.router'
import { insuranceTypesRouter } from './modules/insurance-types/insurance-types.router'
import { assetsRouter } from './modules/assets/assets.router'
import { producersRouter } from './modules/producers/producers.router'
import { policiesRouter } from './modules/policies/policies.router'
import { documentsRouter } from './modules/documents/documents.router'
import { fireExtinguishersRouter } from './modules/fire-extinguishers/fire-extinguishers.router'
import { claimsRouter } from './modules/claims/claims.router'
import { catalogsRouter } from './modules/catalogs/catalogs.router'
import { dashboardRouter } from './modules/dashboard/dashboard.router'
import { uploadsRouter } from './modules/uploads/uploads.router'
import { notificationsRouter } from './modules/notifications/notifications.router'

const app = express()

// ─── Security headers ────────────────────────────────────────────────────────
app.use(helmet())

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
)

// ─── Rate limiting global ─────────────────────────────────────────────────────
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Demasiadas solicitudes. Esperá unos minutos.',
      },
    },
  }),
)

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))

// ─── HTTP logging ─────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'))
}

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/health', healthRouter)

// Endpoint de desarrollo para generar tokens JWT — solo en NODE_ENV=development
if (env.NODE_ENV === 'development') {
  app.use('/dev', devRouter)
}

// ─── API v1 ───────────────────────────────────────────────────────────────────
// Fase 2 — Catálogos
app.use('/api/v1/companies', companiesRouter)
app.use('/api/v1/cost-centers', costCentersRouter)
app.use('/api/v1/insurance-types', insuranceTypesRouter)
// Fase 3 — Activos
app.use('/api/v1/assets', assetsRouter)
// Fase 4 — Productores
app.use('/api/v1/producers', producersRouter)
// Fase 5 — Pólizas
app.use('/api/v1/policies', policiesRouter)
// Fase 6 — Documentos Contables
app.use('/api/v1/documents', documentsRouter)
// Fase 7 — Matafuegos
app.use('/api/v1/fire-extinguishers', fireExtinguishersRouter)
// Fase 8 — Siniestros
app.use('/api/v1/claims', claimsRouter)
// Fase 11 — Catálogos dinámicos
app.use('/api/v1/catalogs', catalogsRouter)
// Fase 9 — Dashboard y Analytics
app.use('/api/v1/dashboard', dashboardRouter)
// Fase 10 — File Storage + Notificaciones
app.use('/api/v1/uploads', uploadsRouter)
app.use('/api/v1/notifications', notificationsRouter)

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Ruta ${req.method} ${req.path} no encontrada`,
    },
  })
})

// ─── Error handler global (debe ir último) ───────────────────────────────────
app.use(errorMiddleware)

export { app }
