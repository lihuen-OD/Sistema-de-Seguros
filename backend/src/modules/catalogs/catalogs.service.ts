import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'

// Chequeo de "¿está en uso?" antes de borrar/desactivar un valor de catálogo —
// cubre solo las categorías con mapeo 1:1 confiable a una columna real. Gap
// conocido y documentado, no una regresión — estas categorías quedan SIN
// chequeo (mismo comportamiento que antes de Fase 6):
//   - asset_fuel_type, asset_building_purpose, asset_infrastructure_type,
//     asset_silo_content, asset_cargo_species, asset_implement_type,
//     asset_productive_unit, asset_area
//     → viven dentro de Asset.metadata (JSON), estructura por-tipo no confirmada.
//   - claim_status → los labels del catálogo ("Denunciado", "En trámite", ...)
//     no coinciden con los valores reales guardados en Claim.status
//     ("denunciado", "en_tramite", ...) — parece un catálogo desconectado/obsoleto.
//   - task_type → solo alimenta el título libre de una tarea (ProducerTask.title),
//     no hay columna propia que lo almacene de forma estable.
const CATALOG_USAGE_CHECKS: Record<string, (label: string) => Promise<number>> = {
  fire_ext_type: (label) => prisma.fireExtinguisher.count({ where: { type: label } }),
  fire_ext_capacity: (label) => prisma.fireExtinguisher.count({ where: { capacity: label } }),
  fire_ext_location_type: (label) => prisma.fireExtinguisher.count({ where: { locationType: label } }),
  claim_type: (label) => prisma.claim.count({ where: { claimType: label } }),
  document_payment_method: (label) => prisma.accountingDocument.count({ where: { paymentMethod: label } }),

  insurance_company: async (label) => {
    const [documents, claims, thirdPartyClaims] = await Promise.all([
      prisma.accountingDocument.count({ where: { insuranceCompany: label } }),
      prisma.claim.count({ where: { insuranceCompany: label } }),
      prisma.claim.count({ where: { thirdPartyInsuranceCompany: label } }),
    ])
    return documents + claims + thirdPartyClaims
  },

  document_currency: async (label) => {
    const [documents, policies, claims] = await Promise.all([
      prisma.accountingDocument.count({ where: { currency: label } }),
      prisma.policy.count({ where: { currency: label } }),
      prisma.claim.count({ where: { currency: label } }),
    ])
    return documents + policies + claims
  },
}

async function assertNotInUse(id: string): Promise<void> {
  const item = await prisma.catalogItem.findUnique({ where: { id } })
  if (!item) return // 404 lo maneja el caller si corresponde

  const check = CATALOG_USAGE_CHECKS[item.category]
  if (!check) return // categoría sin chequeo registrado — comportamiento sin cambios

  const count = await check(item.label)
  if (count > 0) {
    throw new AppError(
      409,
      `No se puede eliminar/desactivar "${item.label}" — está en uso por ${count} registro(s)`,
      'CATALOG_ITEM_IN_USE',
    )
  }
}

function handleDuplicateCatalogItem(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new AppError(409, 'Ya existe un ítem con ese label en esta categoría', 'DUPLICATE_CATALOG_ITEM')
  }
  throw e
}

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
    return prisma.catalogItem
      .create({ data: { category, label, sortOrder: sortOrder ?? 0 } })
      .catch(handleDuplicateCatalogItem)
  },

  async update(id: string, data: { label?: string; sortOrder?: number; isActive?: boolean }) {
    // Desactivar requiere el mismo chequeo de uso que borrar. Renombrar (label)
    // no lo requiere: los registros existentes ya copiaron el string viejo (no
    // hay FK), así que renombrar el catálogo no los rompe — es una limitación
    // pre-existente y aceptada, fuera de esta pasada.
    if (data.isActive === false) {
      await assertNotInUse(id)
    }
    return prisma.catalogItem.update({ where: { id }, data }).catch(handleDuplicateCatalogItem)
  },

  async delete(id: string) {
    await assertNotInUse(id)
    return prisma.catalogItem.delete({ where: { id } })
  },
}
