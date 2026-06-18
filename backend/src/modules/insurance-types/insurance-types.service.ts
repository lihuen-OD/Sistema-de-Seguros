import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import type {
  CreateInsuranceTypeDTO,
  UpdateInsuranceTypeDTO,
  CreateCoverageDTO,
  ListInsuranceTypesQueryDTO,
} from './insurance-types.schemas'

export const insuranceTypesService = {
  async findAll(query: ListInsuranceTypesQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' as const },
      }),
    }

    const [data, total] = await Promise.all([
      prisma.insuranceType.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          coverages: { orderBy: { name: 'asc' } },
          _count: { select: { policies: true } },
        },
      }),
      prisma.insuranceType.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const insuranceType = await prisma.insuranceType.findUnique({
      where: { id },
      include: {
        coverages: { orderBy: { name: 'asc' } },
        _count: { select: { policies: true } },
      },
    })
    if (!insuranceType) throw new AppError(404, 'Tipo de seguro no encontrado', 'NOT_FOUND')
    return insuranceType
  },

  async create(data: CreateInsuranceTypeDTO) {
    const { coverages, ...typeData } = data

    const exists = await prisma.insuranceType.findFirst({
      where: { name: { equals: typeData.name, mode: 'insensitive' } },
    })
    if (exists) throw new AppError(409, 'Ya existe un tipo de seguro con ese nombre', 'CONFLICT')

    return prisma.insuranceType.create({
      data: {
        ...typeData,
        coverages: {
          create: coverages.map((c) => ({ name: c.name, description: c.description })),
        },
      },
      include: { coverages: { orderBy: { name: 'asc' } } },
    })
  },

  async update(id: string, data: UpdateInsuranceTypeDTO) {
    await insuranceTypesService.findById(id)

    if (data.name) {
      const conflict = await prisma.insuranceType.findFirst({
        where: { name: { equals: data.name, mode: 'insensitive' }, id: { not: id } },
      })
      if (conflict)
        throw new AppError(409, 'Ya existe un tipo de seguro con ese nombre', 'CONFLICT')
    }

    return prisma.insuranceType.update({
      where: { id },
      data,
      include: { coverages: { orderBy: { name: 'asc' } } },
    })
  },

  async softDelete(id: string) {
    await insuranceTypesService.findById(id)

    const linkedPolicies = await prisma.policy.count({
      where: { insuranceTypeId: id, isActive: true },
    })
    if (linkedPolicies > 0) {
      throw new AppError(
        409,
        `No se puede desactivar: el tipo de seguro tiene ${linkedPolicies} póliza(s) activa(s)`,
        'CONFLICT',
      )
    }

    return prisma.insuranceType.update({ where: { id }, data: { isActive: false } })
  },

  // ── Coberturas ───────────────────────────────────────────────────────────────

  async addCoverage(insuranceTypeId: string, data: CreateCoverageDTO) {
    await insuranceTypesService.findById(insuranceTypeId)
    return prisma.insuranceCoverage.create({ data: { ...data, insuranceTypeId } })
  },

  async removeCoverage(insuranceTypeId: string, coverageId: string) {
    const coverage = await prisma.insuranceCoverage.findFirst({
      where: { id: coverageId, insuranceTypeId },
    })
    if (!coverage) throw new AppError(404, 'Cobertura no encontrada', 'NOT_FOUND')

    await prisma.insuranceCoverage.delete({ where: { id: coverageId } })
  },
}
