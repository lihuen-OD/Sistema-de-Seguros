import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})

// Política mínima a propósito — nada más elaborado en esta primera versión.
// Exportado para reusarlo en users.schemas.ts (alta y reseteo de contraseña).
export const NewPasswordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .refine((v) => /[a-zA-Z]/.test(v), 'La contraseña debe tener al menos una letra')
  .refine((v) => /[0-9]/.test(v), 'La contraseña debe tener al menos un número')

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: NewPasswordSchema,
})

export type LoginDTO = z.infer<typeof LoginSchema>
export type ChangePasswordDTO = z.infer<typeof ChangePasswordSchema>
