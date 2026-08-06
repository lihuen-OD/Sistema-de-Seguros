import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { RenewalProjectionModeSchema, type UpsertRenewalProjectionOverrideDTO } from './renewal-projections.schemas'

function parseMode(mode: string) {
  const result = RenewalProjectionModeSchema.safeParse(mode)
  if (!result.success) throw new AppError(400, 'Modo inválido — debe ser FINANCIAL o ECONOMIC', 'INVALID_MODE')
  return result.data
}

export const renewalProjectionsService = {
  // Tabla chica — una fila por activo+modo con algún override activo, sin
  // paginar. El frontend la indexa por assetId en memoria.
  async findAll(mode: string) {
    return prisma.assetRenewalProjectionOverride.findMany({ where: { mode: parseMode(mode) } })
  },

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

  // Botón "volver al automático": borra la fila entera en vez de dejarla con
  // los 4 campos en null — equivalente (findAll ya trata "sin fila" igual
  // que "fila con todo null") y más simple. Idempotente si no existía.
  async reset(assetId: string, mode: string) {
    await prisma.assetRenewalProjectionOverride.deleteMany({ where: { assetId, mode: parseMode(mode) } })
  },
}
