import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import type {
  CreateFixedAssetDTO,
  UpdateFixedAssetDTO,
  ListFixedAssetsQueryDTO,
} from './fixed-assets.schemas'

export const fixedAssetsService = {
  async findAll(query: ListFixedAssetsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { code: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.fixedAsset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.fixedAsset.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const fixedAsset = await prisma.fixedAsset.findUnique({ where: { id } })
    if (!fixedAsset) throw new AppError(404, 'Bien de uso no encontrado', 'NOT_FOUND')
    return fixedAsset
  },

  async create(data: CreateFixedAssetDTO) {
    let code = data.code

    if (!code) {
      const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('fixed_asset_code_seq')`
      code = `BU-${String(Number(seqResult[0].nextval)).padStart(3, '0')}`
    } else {
      const exists = await prisma.fixedAsset.findUnique({ where: { code } })
      if (exists) throw new AppError(409, 'Ya existe un bien de uso con ese código', 'CONFLICT')
    }

    return prisma.fixedAsset.create({ data: { ...data, code } })
  },

  async update(id: string, data: UpdateFixedAssetDTO) {
    await fixedAssetsService.findById(id)

    if (data.code) {
      const conflict = await prisma.fixedAsset.findFirst({
        where: { code: data.code, id: { not: id } },
      })
      if (conflict)
        throw new AppError(409, 'Ya existe un bien de uso con ese código', 'CONFLICT')
    }

    return prisma.fixedAsset.update({ where: { id }, data })
  },

  async remove(id: string) {
    await fixedAssetsService.findById(id)

    const linkedAssets = await prisma.asset.count({
      where: { fixedAssetId: id },
    })
    if (linkedAssets > 0) {
      throw new AppError(
        409,
        `No se puede eliminar: el bien de uso tiene ${linkedAssets} activo(s) asignado(s)`,
        'CONFLICT',
      )
    }

    try {
      await prisma.fixedAsset.delete({ where: { id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new AppError(409, 'No se puede eliminar: el bien de uso todavía está en uso', 'CONFLICT')
      }
      throw e
    }
  },
}
