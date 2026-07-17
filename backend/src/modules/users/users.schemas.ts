import { z } from 'zod'
import { NewPasswordSchema } from '../auth/auth.schemas'

export const AssignableRoleSchema = z.enum(['ADMIN', 'USER'])

export const CreateUserSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido').max(200),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  role: AssignableRoleSchema,
  accessProfileId: z.string().uuid('Perfil de acceso inválido').nullable().optional(),
  password: NewPasswordSchema,
})

export const UpdateUserSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  email: z.string().trim().toLowerCase().email('Email inválido').optional(),
  role: AssignableRoleSchema.optional(),
  accessProfileId: z.string().uuid('Perfil de acceso inválido').nullable().optional(),
  isActive: z.boolean().optional(),
})

export const ResetPasswordSchema = z.object({
  newPassword: NewPasswordSchema,
})

export type CreateUserDTO = z.infer<typeof CreateUserSchema>
export type UpdateUserDTO = z.infer<typeof UpdateUserSchema>
export type ResetPasswordDTO = z.infer<typeof ResetPasswordSchema>
