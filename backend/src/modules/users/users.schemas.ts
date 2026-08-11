import { z } from 'zod'
import { NewPasswordSchema } from '../auth/auth.schemas'

export const AssignableRoleSchema = z.enum(['ADMIN', 'USER'])

// Alcance de auditoría de un usuario — ver UserAuditScope en schema.prisma.
// Único área que se gestiona desde el alta/edición de usuario:
// FIRE_EXTINGUISHER_AUDIT (matafuegos de edificio, por establecimiento —
// valida contra el catálogo real, chequeo async en el service, no expresable
// acá). ASSET_AUDIT/INSURANCE_AUDIT (Rodados/Seguros) ya no viajan por acá —
// se asignan por activo individual desde .../assignments/:userId.
const AuditScopeItemSchema = z.discriminatedUnion('area', [
  z.object({ area: z.literal('FIRE_EXTINGUISHER_AUDIT'), scopeValue: z.string().trim().min(1).max(200) }),
])

export const AuditScopeInputSchema = z
  .array(AuditScopeItemSchema)
  .max(200)
  .refine(
    (arr) => {
      const keys = arr.map((s) => `${s.area}::${s.scopeValue}`)
      return new Set(keys).size === keys.length
    },
    { message: 'No se puede asignar el mismo alcance dos veces' },
  )

export const CreateUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  role: AssignableRoleSchema,
  accessProfileId: z.string().uuid('Perfil de acceso inválido').nullable().optional(),
  password: NewPasswordSchema,
  auditScope: AuditScopeInputSchema.optional(),
})

export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email('Email inválido').optional(),
  role: AssignableRoleSchema.optional(),
  accessProfileId: z.string().uuid('Perfil de acceso inválido').nullable().optional(),
  isActive: z.boolean().optional(),
  auditScope: AuditScopeInputSchema.optional(),
})

export const ResetPasswordSchema = z.object({
  newPassword: NewPasswordSchema,
})

export type CreateUserDTO = z.infer<typeof CreateUserSchema>
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>
export type ResetPasswordDTO = z.infer<typeof ResetPasswordSchema>
