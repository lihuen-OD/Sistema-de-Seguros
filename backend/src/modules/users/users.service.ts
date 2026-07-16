import bcrypt from 'bcrypt'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { BCRYPT_COST } from '../auth/auth.service'
import type { CreateUserDTO, UpdateUserDTO } from './users.schemas'

function safeUser(user: {
  id: string
  name: string
  email: string
  role: string
  isActive: boolean
  mustChangePassword: boolean
  lastLoginAt: Date | null
  createdAt: Date
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}

export const usersService = {
  async findAll() {
    const users = await prisma.user.findMany({ orderBy: { createdAt: 'asc' } })
    return users.map(safeUser)
  },

  async create(data: CreateUserDTO) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      throw new AppError(409, 'Ya existe un usuario con ese email', 'CONFLICT')
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST)
    // mustChangePassword siempre true al alta — la contraseña que carga el
    // ADMIN es temporal, la persona la cambia en su primer login.
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        passwordHash,
        mustChangePassword: true,
      },
    })

    return safeUser(user)
  },

  async update(id: string, data: UpdateUserDTO) {
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } })
      if (emailTaken) {
        throw new AppError(409, 'Ya existe un usuario con ese email', 'CONFLICT')
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.role !== undefined && { role: data.role }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    })

    return safeUser(updated)
  },

  async resetPassword(id: string, newPassword: string) {
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    })

    return { message: 'Contraseña reseteada correctamente' }
  },
}
