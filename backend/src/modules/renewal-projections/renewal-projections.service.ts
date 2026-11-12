import type { AssetRenewalProjectionOverride, Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { computeDualAmounts, isPlausibleArsPerUsd } from '../../shared/utils/currency'
import { exchangeRateService } from '../exchange-rate/exchange-rate.service'
import {
  LEGACY_AMOUNT_FIELDS,
  RenewalProjectionModeSchema,
  type ConvertLegacyOverridesDTO,
  type LegacyAmountField,
  type UpsertRenewalProjectionOverrideDTO,
} from './renewal-projections.schemas'

function parseMode(mode: string) {
  const result = RenewalProjectionModeSchema.safeParse(mode)
  if (!result.success) throw new AppError(400, 'Modo inválido — debe ser FINANCIAL o ECONOMIC', 'INVALID_MODE')
  return result.data
}

// ── Información histórica protegida ──────────────────────────────────────────
// Importes ARS y % legados + la trazabilidad de su conversión. Ninguna
// operación ordinaria (PUT, reset, reset-all, convert) los borra ni los
// modifica — ver schema.prisma#AssetRenewalProjectionOverride.
const PROTECTED_FIELDS = [
  'netOverride',
  'vatOverride',
  'otherOverride',
  'growthPercentOverride',
  'legacyConvertedRate',
  'legacyConvertedAt',
  'legacyConvertedBy',
] as const

// Campos que "Volver al automático" sí limpia: la base USD vigente y la
// configuración de ciclo/cuotas/inicio (sin moneda, editable a voluntad).
const RESETTABLE_FIELDS = [
  'netOverrideUsd',
  'vatOverrideUsd',
  'otherOverrideUsd',
  'growthPercentUsdOverride',
  'cycleLengthMonthsOverride',
  'installmentsCountOverride',
  'startMonthOverride',
] as const

function hasProtectedData(row: AssetRenewalProjectionOverride): boolean {
  return PROTECTED_FIELDS.some((field) => row[field] != null)
}

const LEGACY_FIELD_COLUMNS: Record<LegacyAmountField, { ars: 'netOverride' | 'vatOverride' | 'otherOverride'; usd: 'netOverrideUsd' | 'vatOverrideUsd' | 'otherOverrideUsd' }> = {
  net: { ars: 'netOverride', usd: 'netOverrideUsd' },
  vat: { ars: 'vatOverride', usd: 'vatOverrideUsd' },
  other: { ars: 'otherOverride', usd: 'otherOverrideUsd' },
}

// Qué importes ARS legados se trasladarían hoy a USD: los que existen y cuyo
// par *Usd sigue vacío (un USD ya cargado a mano nunca se pisa). Misma regla
// que usa el frontend para armar la vista previa.
export function convertibleLegacyFields(row: AssetRenewalProjectionOverride): LegacyAmountField[] {
  if (row.legacyConvertedAt != null) return []
  return LEGACY_AMOUNT_FIELDS.filter((field) => {
    const { ars, usd } = LEGACY_FIELD_COLUMNS[field]
    return row[ars] != null && row[usd] == null
  })
}

function sameFieldSet(a: readonly LegacyAmountField[], b: readonly LegacyAmountField[]): boolean {
  const setB = new Set(b)
  return a.length === setB.size && a.every((f) => setB.has(f))
}

export const renewalProjectionsService = {
  // Tabla chica — una fila por activo+modo con algún override activo, sin
  // paginar. El frontend la indexa por assetId en memoria.
  async findAll(mode: string) {
    return prisma.assetRenewalProjectionOverride.findMany({ where: { mode: parseMode(mode) } })
  },

  // `data` ya viene filtrado por UpsertRenewalProjectionOverrideSchema
  // (.strict()) — solo campos vigentes, nunca los protegidos.
  async upsert(assetId: string, mode: string, data: UpsertRenewalProjectionOverrideDTO) {
    const parsedMode = parseMode(mode)
    const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true } })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')

    return prisma.assetRenewalProjectionOverride.upsert({
      where: { assetId_mode: { assetId, mode: parsedMode } },
      create: { assetId, mode: parsedMode, ...data },
      update: data,
    })
  },

  // Botón "volver al automático". Una fila con información histórica
  // protegida NUNCA se borra: solo se limpian los campos vigentes. Solo una
  // fila sin nada protegido (creada con la base USD) se elimina — y el
  // deleteMany repite la condición "todo protegido en null" para que una
  // escritura concurrente no la convierta en un borrado de histórico.
  // Idempotente si no existía.
  async reset(assetId: string, mode: string) {
    const parsedMode = parseMode(mode)
    await prisma.$transaction(async (tx) => {
      const row = await tx.assetRenewalProjectionOverride.findUnique({
        where: { assetId_mode: { assetId, mode: parsedMode } },
      })
      if (!row) return

      if (hasProtectedData(row)) {
        const cleared = Object.fromEntries(RESETTABLE_FIELDS.map((f) => [f, null])) as Prisma.AssetRenewalProjectionOverrideUpdateInput
        await tx.assetRenewalProjectionOverride.update({ where: { id: row.id }, data: cleared })
        return
      }

      const allProtectedNull = Object.fromEntries(PROTECTED_FIELDS.map((f) => [f, null])) as Prisma.AssetRenewalProjectionOverrideWhereInput
      await tx.assetRenewalProjectionOverride.deleteMany({ where: { id: row.id, ...allProtectedNull } })
    })
  },

  // Conversión CONFIRMADA por el usuario de los importes ARS legados a USD,
  // con el TC actual del sistema (resuelto acá, nunca el que mande el
  // cliente). Todo o nada: se convierten exactamente los campos que el
  // usuario vio en la vista previa, con el TC que vio, o no se escribe nada.
  // Los ARS originales quedan intactos y se registra TC, fecha y usuario.
  async convertLegacy(assetId: string, mode: string, input: ConvertLegacyOverridesDTO, performedBy?: string) {
    const parsedMode = parseMode(mode)

    return prisma.$transaction(async (tx) => {
      const row = await tx.assetRenewalProjectionOverride.findUnique({
        where: { assetId_mode: { assetId, mode: parsedMode } },
      })
      if (!row) throw new AppError(404, 'No hay valores anteriores guardados para este activo', 'NOT_FOUND')
      if (row.legacyConvertedAt != null) {
        throw new AppError(409, 'Los valores anteriores en ARS ya se convirtieron a USD', 'ALREADY_CONVERTED')
      }

      const fields = convertibleLegacyFields(row)
      if (fields.length === 0) {
        throw new AppError(409, 'No hay importes anteriores en ARS pendientes de conversión', 'NOTHING_TO_CONVERT')
      }

      const current = await exchangeRateService.getCurrent()
      if (current.isPlaceholder) {
        throw new AppError(409, 'El tipo de cambio actual es el valor inicial de ejemplo — actualizalo antes de convertir', 'PLACEHOLDER_RATE')
      }
      if (!isPlausibleArsPerUsd(current.rate)) {
        throw new AppError(409, 'No hay un tipo de cambio actual válido para convertir', 'NO_VALID_CURRENT_RATE')
      }
      const rate = current.rate
      if (Math.abs(rate - input.expectedRate) > 1e-9) {
        throw new AppError(409, 'El tipo de cambio actual cambió — revisá la vista previa y confirmá de nuevo', 'RATE_CHANGED')
      }
      if (!sameFieldSet(fields, input.fields)) {
        throw new AppError(409, 'Los valores cambiaron desde la vista previa — revisala y confirmá de nuevo', 'PREVIEW_OUTDATED')
      }

      const data: Prisma.AssetRenewalProjectionOverrideUpdateManyMutationInput = {
        legacyConvertedRate: rate,
        legacyConvertedAt: new Date(),
        legacyConvertedBy: performedBy ?? null,
      }
      // Compare-and-set: solo escribe si la fila sigue exactamente como se
      // leyó (sin conversión previa y con los *Usd a convertir todavía
      // vacíos). Si una escritura concurrente cargó un USD a mano, no se pisa.
      const where: Prisma.AssetRenewalProjectionOverrideWhereInput = { id: row.id, legacyConvertedAt: null }
      for (const field of fields) {
        const { ars, usd } = LEGACY_FIELD_COLUMNS[field]
        data[usd] = computeDualAmounts(row[ars] as number, 'ARS', rate).amountUsd
        where[usd] = null
      }

      const result = await tx.assetRenewalProjectionOverride.updateMany({ where, data })
      if (result.count !== 1) {
        throw new AppError(409, 'Los valores cambiaron mientras se convertían — revisá la vista previa y confirmá de nuevo', 'PREVIEW_OUTDATED')
      }

      return tx.assetRenewalProjectionOverride.findUnique({ where: { id: row.id } })
    })
  },
}
