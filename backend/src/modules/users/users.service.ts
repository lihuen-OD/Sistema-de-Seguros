import bcrypt from 'bcrypt'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { BCRYPT_COST } from '../auth/auth.service'
import type { CreateUserDTO, UpdateUserDTO, AuditScopeInputSchema } from './users.schemas'
import type { z } from 'zod'

type AuditScopeInput = z.infer<typeof AuditScopeInputSchema>

const USER_INCLUDE = {
  accessProfile: { select: { name: true } },
  auditScopes: { select: { area: true, scopeValue: true } },
} satisfies Prisma.UserInclude

function safeUser(user: {
  id: string
  name: string
  email: string
  role: string
  accessProfileId: string | null
  accessProfile?: { name: string } | null
  auditScopes?: { area: string; scopeValue: string }[]
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
    auditScope: (user.auditScopes ?? []).map((s) => ({ area: s.area, scopeValue: s.scopeValue })),
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  }
}

// FIRE_EXTINGUISHER_AUDIT valida contra el catálogo real (a diferencia de
// ASSET_AUDIT/INSURANCE_AUDIT, que ya vienen validados por Zod contra la
// lista fija AUDITABLE_ASSET_CATEGORIES) — un establecimiento es texto libre
// editable, así que hace falta chequear que exista y esté activo.
async function assertValidAuditScope(items: AuditScopeInput): Promise<void> {
  const establishments = items.filter((s) => s.area === 'FIRE_EXTINGUISHER_AUDIT').map((s) => s.scopeValue)
  if (establishments.length === 0) return

  const found = await prisma.catalogItem.findMany({
    where: { category: 'fire_ext_establishment', isActive: true, label: { in: establishments } },
    select: { label: true },
  })
  const foundLabels = new Set(found.map((f) => f.label))
  const missing = establishments.filter((label) => !foundLabels.has(label))
  if (missing.length > 0) {
    throw new AppError(400, `Establecimiento(s) inválido(s) en el alcance de auditoría: ${missing.join(', ')}`, 'INVALID_REFERENCE')
  }
}

// Reemplazo completo del set de alcance de un usuario — mismo patrón que ya
// usa fire-extinguisher-audits.service.ts para sus proposedChanges en update().
async function replaceAuditScope(tx: Prisma.TransactionClient, userId: string, items: AuditScopeInput): Promise<void> {
  await tx.userAuditScope.deleteMany({ where: { userId } })
  if (items.length > 0) {
    await tx.userAuditScope.createMany({
      data: items.map((s) => ({ userId, area: s.area, scopeValue: s.scopeValue })),
    })
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
      include: USER_INCLUDE,
    })
    return users.map(safeUser)
  },

  async create(data: CreateUserDTO, performedBy?: string) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      throw new AppError(409, 'Ya existe un usuario con ese email', 'CONFLICT')
    }

    if (data.auditScope) await assertValidAuditScope(data.auditScope)

    const accessProfileId = await resolveAccessProfileId(data.role, data.accessProfileId)
    const passwordHash = await bcrypt.hash(data.password, BCRYPT_COST)
    // mustChangePassword siempre true al alta — la contraseña que carga el
    // ADMIN es temporal, la persona la cambia en su primer login.
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          role: data.role,
          accessProfileId,
          passwordHash,
          mustChangePassword: true,
        },
      })
      if (data.auditScope) await replaceAuditScope(tx, created.id, data.auditScope)
      return tx.user.findUniqueOrThrow({ where: { id: created.id }, include: USER_INCLUDE })
    })

    await logUserAudit(user.id, 'CREATE', performedBy, undefined, {
      ...pickAuditedFields(user),
      ...(data.auditScope !== undefined && { auditScope: user.auditScopes }),
    })

    return safeUser(user)
  },

  async update(id: string, data: UpdateUserDTO, performedBy?: string) {
    const existing = await prisma.user.findUnique({
      where: { id },
      include: { auditScopes: { select: { area: true, scopeValue: true } } },
    })
    if (!existing) {
      throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')
    }

    if (data.email && data.email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } })
      if (emailTaken) {
        throw new AppError(409, 'Ya existe un usuario con ese email', 'CONFLICT')
      }
    }

    if (data.auditScope) await assertValidAuditScope(data.auditScope)

    const accessProfileId = await resolveAccessProfileId(
      data.role ?? existing.role,
      data.accessProfileId,
    )

    const updated = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.role !== undefined && { role: data.role }),
          ...(accessProfileId !== undefined && { accessProfileId }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      })
      // Solo se toca el alcance cuando el campo viene presente en el body —
      // así un PUT que solo cambia isActive (ej. desactivar) no borra las
      // asignaciones existentes. El frontend siempre manda el set completo
      // vigente al guardar, así que esto es reemplazo total, no un merge.
      if (data.auditScope) await replaceAuditScope(tx, id, data.auditScope)
      return tx.user.findUniqueOrThrow({ where: { id }, include: USER_INCLUDE })
    })

    const before = pickAuditedFields(existing)
    const after = pickAuditedFields(updated)
    const changedFields = AUDITED_FIELDS.filter((f) => before[f] !== after[f])
    const auditScopeChanged = data.auditScope !== undefined && JSON.stringify(existing.auditScopes) !== JSON.stringify(updated.auditScopes)

    if (changedFields.length > 0 || auditScopeChanged) {
      await logUserAudit(
        id,
        'UPDATE',
        performedBy,
        {
          ...Object.fromEntries(changedFields.map((f) => [f, before[f]])),
          ...(auditScopeChanged && { auditScope: existing.auditScopes }),
        },
        {
          ...Object.fromEntries(changedFields.map((f) => [f, after[f]])),
          ...(auditScopeChanged && { auditScope: updated.auditScopes }),
        },
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
