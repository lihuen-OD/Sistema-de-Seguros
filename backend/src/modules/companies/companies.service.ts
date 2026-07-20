import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import type { CreateCompanyDTO, UpdateCompanyDTO, ListCompaniesQueryDTO } from './companies.schemas'

export const companiesService = {
  async findAll(query: ListCompaniesQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { cuit: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.company.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) throw new AppError(404, 'Empresa no encontrada', 'NOT_FOUND')
    return company
  },

  async create(data: CreateCompanyDTO) {
    if (data.cuit) {
      const exists = await prisma.company.findUnique({ where: { cuit: data.cuit } })
      if (exists) throw new AppError(409, 'Ya existe una empresa con ese CUIT', 'CONFLICT')
    }

    return prisma.company.create({ data })
  },

  async update(id: string, data: UpdateCompanyDTO) {
    await companiesService.findById(id)

    if (data.cuit) {
      const conflict = await prisma.company.findFirst({
        where: { cuit: data.cuit, id: { not: id } },
      })
      if (conflict) throw new AppError(409, 'Ya existe una empresa con ese CUIT', 'CONFLICT')
    }

    return prisma.company.update({ where: { id }, data })
  },

  async softDelete(id: string) {
    await companiesService.findById(id) // 404 si no existe

    const linkedPolicies = await prisma.policy.count({
      where: { companyId: id, isActive: true },
    })
    if (linkedPolicies > 0) {
      throw new AppError(
        409,
        `No se puede desactivar: la empresa tiene ${linkedPolicies} póliza(s) activa(s)`,
        'CONFLICT',
      )
    }

    return prisma.company.update({ where: { id }, data: { isActive: false } })
  },
}
