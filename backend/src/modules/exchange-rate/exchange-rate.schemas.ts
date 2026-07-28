import { z } from 'zod'

export const SetExchangeRateSchema = z.object({
  rate: z.number().positive('El tipo de cambio debe ser un valor positivo'),
})

export type SetExchangeRateDTO = z.infer<typeof SetExchangeRateSchema>
