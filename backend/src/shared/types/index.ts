// ─── Auth ─────────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'CONTADOR' | 'PRODUCTOR' | 'VIEWER'

// Payload que viene del JWT (emitido por la plataforma externa)
export interface RequestUser {
  userId: string
  role: Role
  email: string
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

export type ExpirationStatus = 'vigente' | 'proximo_a_vencer' | 'vencido'
export type PaymentStatus = 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'NOT_APPLICABLE'
export type Currency = 'ARS' | 'USD' | 'EUR'
