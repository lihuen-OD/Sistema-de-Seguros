import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import type {
  CreateAccessProfileDTO,
  UpdateAccessProfileDTO,
  ListAccessProfilesQueryDTO,
} from './access-profiles.schemas'

export const accessProfilesService = {
  async findAll(query: ListAccessProfilesQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' as const },
      }),
    }

    const [data, total] = await Promise.all([
      prisma.accessProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      prisma.accessProfile.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const profile = await prisma.accessProfile.findUnique({ where: { id } })
    if (!profile) throw new AppError(404, 'Perfil de acceso no encontrado', 'NOT_FOUND')
    return profile
  },

  async create(data: CreateAccessProfileDTO) {
    const exists = await prisma.accessProfile.findUnique({ where: { name: data.name } })
    if (exists) throw new AppError(409, 'Ya existe un perfil de acceso con ese nombre', 'CONFLICT')

    return prisma.accessProfile.create({ data })
  },

  async update(id: string, data: UpdateAccessProfileDTO) {
    await accessProfilesService.findById(id)

    if (data.name) {
      const conflict = await prisma.accessProfile.findFirst({
        where: { name: data.name, id: { not: id } },
      })
      if (conflict)
        throw new AppError(409, 'Ya existe un perfil de acceso con ese nombre', 'CONFLICT')
    }

    return prisma.accessProfile.update({ where: { id }, data })
  },

  async remove(id: string) {
    await accessProfilesService.findById(id)

    const linkedUsers = await prisma.user.count({ where: { accessProfileId: id } })
    if (linkedUsers > 0) {
      throw new AppError(
        409,
        `No se puede eliminar: el perfil tiene ${linkedUsers} usuario(s) asignado(s)`,
        'CONFLICT',
      )
    }

    await prisma.accessProfile.delete({ where: { id } })
  },
}
