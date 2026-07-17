import jwt from 'jsonwebtoken'
import type { ModuleKey, Role } from '../../shared/types'

const JWT_SECRET = process.env.JWT_SECRET!

export const ADMIN_USER_ID = 'test-admin-id'
export const USER_USER_ID = 'test-user-id'

// El JWT ahora solo lleva el userId — role/módulos se resuelven fresco desde
// la base en cada request (ver auth.middleware.ts), así que estos helpers
// solo necesitan identificar CUÁL usuario simular; el mock de
// prisma.user.findUnique (armá el fixture con mockDbUser) es lo que decide
// qué rol/módulos tiene ese usuario para el test.
function makeToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1h' })
}

export const adminToken = () => makeToken(ADMIN_USER_ID)
export const userToken = () => makeToken(USER_USER_ID)

// Fixture de fila de `users` (con accessProfile incluido) para mockear
// prisma.user.findUnique en los tests de integración que pasan por
// authMiddleware. Por default es un ADMIN activo (bypass total).
export function mockDbUser(overrides: Partial<{
  id: string
  role: Role
  isActive: boolean
  modules: ModuleKey[]
}> = {}) {
  const role: Role = overrides.role ?? 'ADMIN'
  const modules = overrides.modules ?? []
  return {
    id: overrides.id ?? (role === 'ADMIN' ? ADMIN_USER_ID : USER_USER_ID),
    name: 'Test User',
    email: 'test@losodwyer.com',
    role,
    isActive: overrides.isActive ?? true,
    accessProfile:
      role === 'ADMIN'
        ? null
        : { id: 'test-profile-id', name: 'Perfil de prueba', modules, isActive: true },
  }
}
