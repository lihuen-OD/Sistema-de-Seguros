import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { prisma } from '../../config/database'
import { env } from '../../config/env'
import { AppError } from '../../shared/errors/AppError'
import type { Role } from '../../shared/types'
import type { LoginDTO, ChangePasswordDTO } from './auth.schemas'

const BCRYPT_COST = 12
const TOKEN_EXPIRES_IN = '12h'
const GENERIC_LOGIN_ERROR = 'Credenciales inválidas'

function safeUser(user: { id: string; name: string; email: string; role: string; mustChangePassword: boolean }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  }
}

export const authService = {
  async login(data: LoginDTO) {
    const user = await prisma.user.findUnique({ where: { email: data.email } })

    // Mismo error genérico sin importar el motivo (no existe, inactivo,
    // contraseña incorrecta) — nunca revelar cuál de los tres fue.
    if (!user || !user.isActive) {
      throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS')
    }

    const passwordMatches = await bcrypt.compare(data.password, user.passwordHash)
    if (!passwordMatches) {
      throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS')
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    const token = jwt.sign(
      { userId: user.id, role: user.role as Role, email: user.email },
      env.JWT_SECRET,
      { expiresIn: TOKEN_EXPIRES_IN },
    )

    return { token, user: safeUser(user) }
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !user.isActive) {
      throw new AppError(401, 'No autenticado', 'UNAUTHORIZED')
    }
    return { id: user.id, name: user.name, email: user.email, role: user.role }
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
