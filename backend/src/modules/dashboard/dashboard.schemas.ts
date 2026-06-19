import { z } from 'zod'

export const ExpiringPoliciesQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
})

export const ExpiringInstallmentsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(60),
})

export const ChartsQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
})

export type ExpiringPoliciesQueryDTO = z.infer<typeof ExpiringPoliciesQuerySchema>
export type ExpiringInstallmentsQueryDTO = z.infer<typeof ExpiringInstallmentsQuerySchema>
export type ChartsQueryDTO = z.infer<typeof ChartsQuerySchema>
