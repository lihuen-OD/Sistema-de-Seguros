import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { AppError } from '../../shared/errors/AppError'
import type { LoginDTO, ChangePasswordDTO } from './auth.schemas'

const BCRYPT_COST = 12
const TOKEN_EXPIRES_IN = '12h'
const GENERIC_LOGIN_ERROR = 'Credenciales inválidas'

type UserWithProfile = {
  id: string
  name: string
  email: string
  role: string
  mustChangePassword: boolean
  accessProfile: { id: string; name: string; modules: string[] } | null
}

function safeUser(user: UserWithProfile) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    accessProfileId: user.accessProfile?.id ?? null,
    accessProfileName: user.accessProfile?.name ?? null,
    modules: user.role === 'ADMIN' ? [] : (user.accessProfile?.modules ?? []),
  }
}

// Log de seguridad de intentos fallidos — nunca la contraseña, solo lo
// necesario para detectar fuerza bruta/credential stuffing en los logs de
// Render. No es una tabla propia a propósito: el rate-limit de /auth/login
// ya acota el volumen, esto es solo para poder investigar después un pico.
function logFailedLogin(email: string, reason: string, ip?: string) {
  console.warn(
    `[auth] Intento de login fallido — email=${email} reason=${reason} ip=${ip ?? 'desconocida'} at=${new Date().toISOString()}`,
  )
}

export const authService = {
  async login(data: LoginDTO, ip?: string) {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { accessProfile: true },
    })

    // Mismo error genérico sin importar el motivo (no existe, inactivo,
    // contraseña incorrecta) — nunca revelar cuál de los tres fue.
    if (!user || !user.isActive) {
      logFailedLogin(data.email, !user ? 'no existe' : 'inactivo', ip)
      throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS')
    }

    const passwordMatches = await bcrypt.compare(data.password, user.passwordHash)
    if (!passwordMatches) {
      logFailedLogin(data.email, 'contraseña incorrecta', ip)
      throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS')
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    // El JWT solo lleva el id — role, isActive y módulos se resuelven
    // fresco desde la base en cada request (ver auth.middleware.ts).
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: TOKEN_EXPIRES_IN })

    return { token, user: safeUser(user) }
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accessProfile: true },
    })
    if (!user || !user.isActive) {
      throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    }
    return safeUser(user)
  },

  async changePassword(userId: string, data: ChangePasswordDTO) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.isActive) {
      throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    }

    if (!user.mustChangePassword) {
      if (!data.currentPassword) {
        throw new AppError(400, 'La contraseña actual es requerida', 'BAD_REQUEST')
      }
      const matches = await bcrypt.compare(data.currentPassword, user.passwordHash)
      if (!matches) {
        throw new AppError(400, 'La contraseña actual es incorrecta', 'BAD_REQUEST')
      }
    }

    const passwordHash = await bcrypt.hash(data.newPassword, BCRYPT_COST)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    })

    return { message: 'Contraseña actualizada correctamente' }
  },
}

export { BCRYPT_COST }
