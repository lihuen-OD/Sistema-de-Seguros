import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3001')
    .transform((val) => parseInt(val, 10)),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  SEED_ADMIN_NAME: z.string().optional().default('Administrador'),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  EMAIL_PROVIDER: z.string().optional().default('resend'),
  EMAIL_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM_DEFAULT: z.string().optional().default('Sistema Seguros <notificaciones@losodwyer.com>'),
  EMAIL_FROM_NOTIFICATIONS: z.string().optional().default('Sistema Seguros <notificaciones@losodwyer.com>'),
  EMAIL_FROM_MANUAL: z.string().optional().default('Sistema Seguros <seguros@losodwyer.com>'),
  EMAIL_FORCE_TO: z.string().optional(),
  EMAIL_LOG_BODY: z
    .string()
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌  Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env

// EMAIL_FORCE_TO redirige TODOS los emails salientes (incluido el envío
// manual de documentos a productores/clientes) a una sola casilla. Es una
// herramienta de demo/staging — si queda cargada en producción por error, los
// clientes reales dejan de recibir mail sin que nadie lo note. No bloquea el
// arranque (podría ser intencional en un ambiente de pruebas con
// NODE_ENV=production), pero se avisa fuerte en los logs de arranque.
if (env.NODE_ENV === 'production' && env.EMAIL_FORCE_TO) {
  console.warn(
    `⚠️  EMAIL_FORCE_TO está seteado en producción ("${env.EMAIL_FORCE_TO}") — ` +
      'TODOS los emails salientes se están redirigiendo a esa dirección en vez de a sus destinatarios reales. ' +
      'Si esto no es intencional, sacá la variable de entorno.',
  )
}
