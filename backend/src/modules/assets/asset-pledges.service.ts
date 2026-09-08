import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { isPledgeEligibleAssetType } from './asset-pledge-eligibility'
import type { CancelAssetPledgeDTO, CreateAssetPledgeDTO } from './assets.schemas'

async function getEligibleAsset(assetId: string) {
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: { id: true, assetType: true },
  })
  if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
  if (!isPledgeEligibleAssetType(asset.assetType)) {
    throw new AppError(400, 'Este tipo de activo no admite gestión de prendas.', 'ASSET_NOT_PLEDGE_ELIGIBLE')
  }
  return asset
}

function mapPledge<T extends { cancelledAt: Date | null }>(pledge: T) {
  return { ...pledge, status: pledge.cancelledAt ? 'CANCELLED' as const : 'ACTIVE' as const }
}

export const assetPledgesService = {
  async findAll(assetId: string) {
    await getEligibleAsset(assetId)
    const pledges = await prisma.assetPledge.findMany({
      where: { assetId },
      select: {
        id: true, assetId: true, creditorName: true, startDate: true, endDate: true,
        notes: true, cancelledAt: true, cancellationReason: true, createdBy: true,
        cancelledBy: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    return pledges.map(mapPledge)
  },

  async create(assetId: string, data: CreateAssetPledgeDTO, createdBy?: string) {
    await getEligibleAsset(assetId)
    try {
      const pledge = await prisma.$transaction(async (tx) => {
        const active = await tx.assetPledge.findFirst({
          where: { assetId, cancelledAt: null },
          select: { id: true },
        })
        if (active) throw new AppError(409, 'El activo ya tiene una prenda activa.', 'ACTIVE_PLEDGE_EXISTS')
        return tx.assetPledge.create({
          data: { assetId, ...data, createdBy },
        })
      })
      return mapPledge(pledge)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'El activo ya tiene una prenda activa.', 'ACTIVE_PLEDGE_EXISTS')
      }
      throw error
    }
  },

  async cancel(assetId: string, pledgeId: string, data: CancelAssetPledgeDTO, cancelledBy?: string) {
    await getEligibleAsset(assetId)
    const pledge = await prisma.assetPledge.findFirst({
      where: { id: pledgeId, assetId },
      select: { id: true, cancelledAt: true },
    })
    if (!pledge) throw new AppError(404, 'Prenda no encontrada', 'NOT_FOUND')
    if (pledge.cancelledAt) throw new AppError(409, 'La prenda ya fue dada de baja.', 'PLEDGE_ALREADY_CANCELLED')

    const result = await prisma.assetPledge.updateMany({
      where: { id: pledgeId, assetId, cancelledAt: null },
      data: { cancelledAt: new Date(), cancellationReason: data.cancellationReason, cancelledBy },
    })
    if (result.count === 0) {
      throw new AppError(409, 'La prenda ya fue dada de baja.', 'PLEDGE_ALREADY_CANCELLED')
    }
    const cancelled = await prisma.assetPledge.findUniqueOrThrow({ where: { id: pledgeId } })
    return mapPledge(cancelled)
  },
}
