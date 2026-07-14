import { z } from 'zod'

// Reutilizado tanto por el body de endpoints de módulos consumidores
// (ej. documents.schemas.ts) como internamente en EmailService.
export const EmailRecipientsSchema = z.object({
  to: z.array(z.string().email('Email inválido')).min(1, 'Se requiere al menos un destinatario').max(5),
  cc: z.array(z.string().email('Email inválido')).max(5).optional().default([]),
  bcc: z.array(z.string().email('Email inválido')).max(5).optional().default([]),
  subject: z.string().max(200).optional(),
  message: z.string().max(2000).optional(),
})

export type EmailRecipientsDTO = z.infer<typeof EmailRecipientsSchema>
