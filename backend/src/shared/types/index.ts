// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'USER'

// Un módulo = una pantalla otorgable por perfil de acceso. Todos se hacen
// cumplir vía requireModule() en el router correspondiente — incluidas las
// lecturas (GET), no solo las escrituras: un módulo de solo-lectura como
// `dashboard`/`financial_analysis`/`economic_analysis`/`fire_extinguisher_dashboard`
// igual expone datos sensibles y necesita el mismo gate que un POST/PUT/DELETE.
// `economic_analysis`/`insurance_dashboard` no tienen endpoint propio —
// componen datos de policies/assets/documents(financial)/claims, cada uno ya
// protegido por su propio módulo. Notificaciones NO es un módulo otorgable —
// agrega datos de todos los módulos sin filtrar por permisos, así que queda
// exclusivo del ADMIN (requireRole en su router).
export const MODULE_KEYS = [
  'dashboard',
  'assets',
  'policies', 'documents', 'financial_analysis', 'economic_analysis', 'renewal_projections', 'renewal_projections_economic', 'insurance_dashboard',
  'claims',
  'fire_extinguishers', 'fire_extinguisher_audits', 'fire_extinguisher_audit_coverage', 'fire_extinguisher_dashboard',
  'asset_audits', 'asset_audit_coverage', 'asset_audit_dashboard',
  'insurance_audits', 'insurance_audit_coverage', 'insurance_audit_dashboard',
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
  // Inyectado automáticamente por jsonwebtoken al firmar con `expiresIn` — no
  // es algo que nosotros elijamos codificar. Lo usa authMiddleware para saber
  // qué tan viejo es el token y decidir si toca renovarlo (sesión deslizante).
  iat?: number
}

// Lo que queda en req.user después de authMiddleware.
export interface RequestUser {
  userId: string
  email: string
  role: Role
  modules: ModuleKey[] // [] si role === 'ADMIN' (bypass total) o si no tiene perfil asignado
}

// ─── Alcance de auditoría ──────────────────────────────────────────────────────

// A qué dominio de auditoría pertenece una fila de UserAuditScope. No es un
// ModuleKey — el módulo sigue resolviendo "puede entrar a la pantalla",
// mientras que el área resuelve "cuáles establecimientos/categorías puede
// operar dentro de esa pantalla" (ver resolveAuditScope).
export const AUDIT_SCOPE_AREAS = ['FIRE_EXTINGUISHER_AUDIT', 'ASSET_AUDIT', 'INSURANCE_AUDIT'] as const
export type AuditScopeArea = typeof AUDIT_SCOPE_AREAS[number]

// Espejo de AssetCategory (frontend/src/shared/types/index.ts), filtrado a las
// categorías que Asset.auditable habilita hoy (ver IS_AUDITABLE_CATEGORY en
// frontend/src/modules/assets/AssetNewPage.tsx) — mismo patrón de duplicación
// FE/BE ya usado para MODULE_KEYS, porque el backend no tiene enum/catálogo
// propio de categoría de activo.
export const AUDITABLE_ASSET_CATEGORIES = [
  'vehiculo', 'camioneta', 'camion', 'transporte_pasajeros',
  'tractor', 'cosechadora', 'pulverizadora', 'implemento', 'maquinaria',
] as const
export type AuditableAssetCategory = typeof AUDITABLE_ASSET_CATEGORIES[number]

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
