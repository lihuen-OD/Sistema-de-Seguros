import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import type { CreateCostCenterDTO, UpdateCostCenterDTO, ListCostCentersQueryDTO } from './cost-centers.schemas'

export const costCentersService = {
  async findAll(query: ListCostCentersQueryDTO) {
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
      prisma.costCenter.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.costCenter.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const costCenter = await prisma.costCenter.findUnique({ where: { id } })
    if (!costCenter) throw new AppError(404, 'Centro de costo no encontrado', 'NOT_FOUND')
    return costCenter
  },

  async create(data: CreateCostCenterDTO) {
    let code = data.code

    if (!code) {
      const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('cost_center_code_seq')`
      code = `CC-${String(Number(seqResult[0].nextval)).padStart(3, '0')}`
    } else {
      const exists = await prisma.costCenter.findUnique({ where: { code } })
      if (exists) throw new AppError(409, 'Ya existe un centro de costo con ese código', 'CONFLICT')
    }

    return prisma.costCenter.create({ data: { ...data, code } })
  },

  async update(id: string, data: UpdateCostCenterDTO) {
    await costCentersService.findById(id)

    if (data.code) {
      const conflict = await prisma.costCenter.findFirst({
        where: { code: data.code, id: { not: id } },
      })
      if (conflict)
        throw new AppError(409, 'Ya existe un centro de costo con ese código', 'CONFLICT')
    }

    return prisma.costCenter.update({ where: { id }, data })
  },

  async remove(id: string) {
    await costCentersService.findById(id)

    const [linkedAllocations, linkedPolicies] = await Promise.all([
      prisma.assetAllocation.count({ where: { costCenterId: id } }),
      prisma.policy.count({ where: { costCenterId: id } }),
    ])
    if (linkedAllocations > 0) {
      throw new AppError(
        409,
        `No se puede eliminar: el centro de costo tiene ${linkedAllocations} activo(s) asignado(s)`,
        'CONFLICT',
      )
    }
    if (linkedPolicies > 0) {
      throw new AppError(
        409,
        `No se puede eliminar: el centro de costo está asignado a ${linkedPolicies} póliza(s)`,
        'CONFLICT',
      )
    }

    try {
      await prisma.costCenter.delete({ where: { id } })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new AppError(409, 'No se puede eliminar: el centro de costo todavía está en uso', 'CONFLICT')
      }
      throw e
    }
  },
}
