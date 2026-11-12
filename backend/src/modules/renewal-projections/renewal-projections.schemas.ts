import { z } from 'zod'

// Financiero calcula lo real por cuota (dueDate), Económico por documento
// (issueDate) — dos números legítimamente distintos, así que cada uno tiene
// su propia fila de overrides para el mismo activo (ver @@unique([assetId, mode])).
export const RenewalProjectionModeSchema = z.enum(['FINANCIAL', 'ECONOMIC'])
export type RenewalProjectionMode = z.infer<typeof RenewalProjectionModeSchema>

// Solo los campos VIGENTES de la base USD — todos opcionales y nulleables
// (null = "usar el valor automático"). Los montos son USD (la base de la
// proyección), nunca ARS: el frontend solo los edita en la vista USD, así
// que ninguna escritura depende de un tipo de cambio.
// growthPercentUsdOverride admite negativos (una renovación puede bajar de
// precio). Piso -100 (no puede caer más del 100%); techo 1000 es solo una
// red anti-typo, no un límite de negocio real.
// cycleLengthMonthsOverride/installmentsCountOverride son enteros ≥1 — nunca
// tiene sentido un ciclo o una cantidad de cuotas de 0 o fraccionaria.
//
// `.strict()`: los campos LEGADOS (netOverride/vatOverride/otherOverride en
// ARS, growthPercentOverride) y la trazabilidad legacyConverted* son de
// solo lectura — mandarlos es un error de validación en vez de una escritura
// silenciosa que pise información histórica (ej. un frontend viejo cacheado).
export const UpsertRenewalProjectionOverrideSchema = z
  .object({
    netOverrideUsd: z.number().min(0).nullable().optional(),
    vatOverrideUsd: z.number().min(0).nullable().optional(),
    otherOverrideUsd: z.number().min(0).nullable().optional(),
    growthPercentUsdOverride: z.number().min(-100).max(1000).nullable().optional(),
    cycleLengthMonthsOverride: z.number().int().min(1).nullable().optional(),
    installmentsCountOverride: z.number().int().min(1).nullable().optional(),
    // 'YYYY-MM' (mes 01-12) — sin restricción de rango temporal (no tiene que
    // ser futuro ni posterior al último mes real, es un campo para simular escenarios).
    startMonthOverride: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
  })
  .strict()

export type UpsertRenewalProjectionOverrideDTO = z.infer<typeof UpsertRenewalProjectionOverrideSchema>

// Importes legados en ARS que se pueden trasladar a su par *Usd. El % legado
// NO está acá a propósito: un % pensado para inflación en pesos no tiene
// equivalente USD — se consulta como histórico y se carga uno nuevo.
export const LEGACY_AMOUNT_FIELDS = ['net', 'vat', 'other'] as const
export type LegacyAmountField = (typeof LEGACY_AMOUNT_FIELDS)[number]

// `expectedRate` y `fields` son exactamente lo que el usuario vio en la vista
// previa — el servidor recalcula ambos y rechaza (409) si algo cambió entre
// la vista previa y la confirmación, así nunca se aplica una conversión
// distinta de la que se confirmó.
export const ConvertLegacyOverridesSchema = z
  .object({
    expectedRate: z.number().positive(),
    fields: z.array(z.enum(LEGACY_AMOUNT_FIELDS)).min(1).max(LEGACY_AMOUNT_FIELDS.length),
  })
  .strict()

export type ConvertLegacyOverridesDTO = z.infer<typeof ConvertLegacyOverridesSchema>
