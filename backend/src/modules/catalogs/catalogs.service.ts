import { prisma } from '../../config/database'

export const catalogsService = {
  findByCategory(category: string) {
    return prisma.catalogItem.findMany({
      where: { category, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
  },

  findAll(category: string) {
    // Incluye inactivos — para la vista de administración
    return prisma.catalogItem.findMany({
      where: { category },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
  },

  create(category: string, label: string, sortOrder?: number) {
    return prisma.catalogItem.create({
      data: { category, label, sortOrder: sortOrder ?? 0 },
    })
  },

  update(id: string, data: { label?: string; sortOrder?: number; isActive?: boolean }) {
    return prisma.catalogItem.update({
      where: { id },
      data,
    })
  },

  delete(id: string) {
    return prisma.catalogItem.delete({ where: { id } })
  },
}
