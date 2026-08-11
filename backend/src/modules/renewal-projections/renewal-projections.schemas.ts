import { z } from 'zod'

// Financiero calcula lo real por cuota (dueDate), Económico por documento
// (issueDate) — dos números legítimamente distintos, así que cada uno tiene
// su propia fila de overrides para el mismo activo (ver @@unique([assetId, mode])).
export const RenewalProjectionModeSchema = z.enum(['FINANCIAL', 'ECONOMIC'])
export type RenewalProjectionMode = z.infer<typeof RenewalProjectionModeSchema>

// Mismos campos que AssetRenewalProjectionOverride, todos opcionales y
// nulleables — null = "usar el valor automático". growthPercentOverride
// admite negativos (una renovación puede bajar de precio), a diferencia de
// otros porcentajes del sistema (ej. allocationPercentage) que son siempre
// positivos. Piso -100 (no puede caer más del 100%); techo 1000 es solo una
// red anti-typo, no un límite de negocio real.
// cycleLengthMonthsOverride/installmentsCountOverride son enteros ≥1 — nunca
// tiene sentido un ciclo o una cantidad de cuotas de 0 o fraccionaria.
export const UpsertRenewalProjectionOverrideSchema = z.object({
  netOverride: z.number().min(0).nullable().optional(),
  vatOverride: z.number().min(0).nullable().optional(),
  otherOverride: z.number().min(0).nullable().optional(),
  growthPercentOverride: z.number().min(-100).max(1000).nullable().optional(),
  cycleLengthMonthsOverride: z.number().int().min(1).nullable().optional(),
  installmentsCountOverride: z.number().int().min(1).nullable().optional(),
  // 'YYYY-MM' (mes 01-12) — sin restricción de rango temporal (no tiene que
  // ser futuro ni posterior al último mes real, es un campo para simular escenarios).
  startMonthOverride: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
})

export type UpsertRenewalProjectionOverrideDTO = z.infer<typeof UpsertRenewalProjectionOverrideSchema>
