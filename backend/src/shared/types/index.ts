// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'USER'

// Un módulo = una pantalla otorgable por perfil de acceso. `dashboard`,
// `notifications`, `financial_analysis`, `economic_analysis` y
// `fire_extinguisher_dashboard` no tienen rutas de escritura propias que
// proteger — solo se usan para ocultar/mostrar en el frontend — el resto sí
// se hace cumplir vía requireModule() en el router correspondiente.
export const MODULE_KEYS = [
  'dashboard', 'notifications',
  'assets',
  'policies', 'documents', 'financial_analysis', 'economic_analysis',
  'claims',
  'fire_extinguishers', 'fire_extinguisher_audits', 'fire_extinguisher_dashboard',
  'producers', 'tasks',
  'companies', 'cost_centers', 'fixed_assets', 'insurance_types', 'module_config',
] as const

export type ModuleKey = typeof MODULE_KEYS[number]

// Lo único que viaja firmado en el JWT — todo lo demás (role, isActive,
// módulos del perfil) se resuelve fresco desde la base en cada request, para
// que desactivar a alguien o cambiarle el perfil surta efecto de inmediato
// sin esperar a que el token (12hs) expire.
export interface JwtPayload {
  userId: string
}

// Lo que queda en req.user después de authMiddleware.
export interface RequestUser {
  userId: string
  email: string
  role: Role
  modules: ModuleKey[] // [] si role === 'ADMIN' (bypass total) o si no tiene perfil asignado
}

// Augment Express Request para que req.user esté tipado globalmente
declare global {
  namespace Express {
    interface Request {
      user?: RequestUser
    }
  }
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
}

export interface ApiErrorDetail {
  field: string
  message: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: ApiErrorDetail[]
  }
}

// ─── Shared domain types ──────────────────────────────────────────────────────

export type ExpirationStatus = 'vigente' | 'proximo_vencer' | 'vencido'
export type PaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'NOT_APPLICABLE'
export type Currency = 'ARS' | 'USD' | 'EUR'
