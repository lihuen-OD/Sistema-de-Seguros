import jwt from 'jsonwebtoken'
import type { Role } from '../../shared/types'

const JWT_SECRET = process.env.JWT_SECRET!

export function makeToken(role: Role = 'ADMIN', extra: Partial<{ email: string; userId: string }> = {}): string {
  return jwt.sign(
    {
      userId: extra.userId ?? 'test-user-id',
      role,
      email: extra.email ?? 'test@losodwyer.com',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  )
}

export const adminToken = () => makeToken('ADMIN')
export const contadorToken = () => makeToken('CONTADOR')
export const viewerToken = () => makeToken('VIEWER')
