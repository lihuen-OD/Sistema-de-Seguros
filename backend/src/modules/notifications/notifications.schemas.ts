import { z } from 'zod'

export const ReviewNotificationsSchema = z.object({
  items: z
    .array(
      z.object({
        notificationId: z.string().min(1),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
      }),
    )
    .min(1)
    .max(500),
})

export type ReviewNotificationsDTO = z.infer<typeof ReviewNotificationsSchema>
