import bcrypt from 'bcrypt'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { BCRYPT_COST } from '../auth/auth.service'
import type { CreateUserDTO, UpdateUserDTO } from './users.schemas'

function safeUser(user: {
  id: string
  name: string
  email: string
  role: string
  accessProfileId: string | null
  accessProfile?: { name: string } | null
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
    accessProfileId: user.accessProfileId,
    accessProfileName: user.accessProfile?.name ?? null,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}

// Campos sensibles que registramos en UserAuditLog — no incluye passwordHash
// (nunca se loguea, ni antes ni después).
const AUDITED_FIELDS = ['name', 'email', 'role', 'accessProfileId', 'isActive'] as const

function pickAuditedFields(user: {
  name: string
  email: string
  role: string
  accessProfileId: string | null
  isActive: boolean
}) {
  return Object.fromEntries(AUDITED_FIELDS.map((f) => [f, user[f]]))
}

async function logUserAudit(
  targetUserId: string,
  action: 'CREATE' | 'UPDATE' | 'RESET_PASSWORD',
  performedBy: string | undefined,
  previousData?: Record<string, unknown>,
  newData?: Record<string, unknown>,
) {
  await prisma.userAuditLog.create({
    data: {
      targetUserId,
      action,
      performedBy,
      previousData: previousData as Prisma.InputJsonValue,
      newData: newData as Prisma.InputJsonValue,
    },
  })
}

// Un ADMIN nunca depende de un perfil (siempre tiene acceso total) — se
// ignora cualquier accessProfileId que llegue junto con role: 'ADMIN'.
async function resolveAccessProfileId(
  role: string | undefined,
  accessProfileId: string | null | undefined,
): Promise<string | null | undefined> {
  if (role === 'ADMIN') return null
  if (accessProfileId === undefined) return undefined
  if (accessProfileId === null) return null

  const profile = await prisma.accessProfile.findUnique({ where: { id: accessProfileId } })
  if (!profile) throw new AppError(400, 'El perfil de acceso seleccionado no existe', 'INVALID_REFERENCE')
  return accessProfileId
}

export const usersService = {
  async findAll() {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: { accessProfile: { select: { name: true } } },
    })
    return users.map(safeUser)
  },

  async create(data: CreateUserDTO, performedBy?: string) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      throw new AppError(409, 'Ya existe un usuario con ese email', 'CONFLICT')
    }

    const accessProfileId = await resolveAccessProfileId(data.role, data.accessProfileId)
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST)
    // mustChangePassword siempre true al alta — la contraseña que carga el
    // ADMIN es temporal, la persona la cambia en su primer login.
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: data.role,
        accessProfileId,
        passwordHash,
        mustChangePassword: true,
      },
      include: { accessProfile: { select: { name: true } } },
    })

    await logUserAudit(user.id, 'CREATE', performedBy, undefined, pickAuditedFields(user))

    return safeUser(user)
  },

  async update(id: string, data: UpdateUserDTO, performedBy?: string) {
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

    const accessProfileId = await resolveAccessProfileId(
      data.role ?? existing.role,
      data.accessProfileId,
    )

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.role !== undefined && { role: data.role }),
        ...(accessProfileId !== undefined && { accessProfileId }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      include: { accessProfile: { select: { name: true } } },
    })

    const before = pickAuditedFields(existing)
    const after = pickAuditedFields(updated)
    const changedFields = AUDITED_FIELDS.filter((f) => before[f] !== after[f])
    if (changedFields.length > 0) {
      await logUserAudit(
        id,
        'UPDATE',
        performedBy,
        Object.fromEntries(changedFields.map((f) => [f, before[f]])),
        Object.fromEntries(changedFields.map((f) => [f, after[f]])),
      )
    }

    return safeUser(updated)
  },

  async resetPassword(id: string, newPassword: string, performedBy?: string) {
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST)
    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    })

    await logUserAudit(id, 'RESET_PASSWORD', performedBy)

    return { message: 'Contraseña reseteada correctamente' }
  },
}
