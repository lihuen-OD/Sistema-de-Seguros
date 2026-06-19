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
      const last = await prisma.costCenter.findFirst({
        where: { code: { startsWith: 'CC-' } },
        orderBy: { code: 'desc' },
      })
      const lastNum = last?.code ? parseInt(last.code.replace('CC-', ''), 10) || 0 : 0
      let seq = lastNum + 1
      code = `CC-${String(seq).padStart(3, '0')}`
      while (await prisma.costCenter.findUnique({ where: { code } })) {
        seq++
        code = `CC-${String(seq).padStart(3, '0')}`
      }
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

  async softDelete(id: string) {
    await costCentersService.findById(id)

    const linkedAllocations = await prisma.assetAllocation.count({
      where: { costCenterId: id },
    })
    if (linkedAllocations > 0) {
      throw new AppError(
        409,
        `No se puede desactivar: el centro de costo tiene ${linkedAllocations} activo(s) asignado(s)`,
        'CONFLICT',
      )
    }

    return prisma.costCenter.update({ where: { id }, data: { isActive: false } })
  },
}
