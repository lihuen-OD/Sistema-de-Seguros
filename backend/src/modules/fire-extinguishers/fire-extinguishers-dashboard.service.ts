import { prisma } from '../../config/database'
import { currentYearMonth } from '../../shared/utils/dates'
import { computeFireExtinguisherStatus, buildFireExtinguisherStatusFilter } from './fire-extinguishers.expiration'
import { classifyAssetType } from './asset-type-classification'
import { catalogsService } from '../catalogs/catalogs.service'

interface StatusBucket {
  total: number
  vigente: number
  proximo_vencer: number
  vencido: number
  sin_fecha: number
}

interface LocationTypeBucket extends StatusBucket {
  locationType: string
}

function emptyBucket(): StatusBucket {
  return { total: 0, vigente: 0, proximo_vencer: 0, vencido: 0, sin_fecha: 0 }
}

interface VehicleMachineryItem {
  id: string
  code: string
  name: string
  assetType: string
  fireExtinguishers: { id: string; code: string; status: string }[]
}

interface VehicleMachineryGroup {
  total: number
  conMatafuego: number
  sinMatafuego: number
  items: VehicleMachineryItem[]
}

function emptyVehicleMachineryGroup(): VehicleMachineryGroup {
  return { total: 0, conMatafuego: 0, sinMatafuego: 0, items: [] }
}

// Sin matafuego primero — son los que requieren acción, igual criterio que el
// resto de los tableros de esta pantalla (ver AUDIT_STATUS_SORT_ORDER análogo
// en el frontend).
function sortVehicleMachineryItems(items: VehicleMachineryItem[]): VehicleMachineryItem[] {
  return [...items].sort((a, b) => {
    const aMissing = a.fireExtinguishers.length === 0
    const bMissing = b.fireExtinguishers.length === 0
    if (aMissing !== bMissing) return aMissing ? -1 : 1
    return a.code.localeCompare(b.code, 'es', { numeric: true })
  })
}

export const fireExtinguishersDashboardService = {
  async getDashboardSummary() {
    const currentPeriod = currentYearMonth()

    const [
      totalActive,
      vencidoCount,
      proximoVencerCount,
      sinFechaCount,
      establishmentRows,
      establishmentCatalog,
      byTypeRaw,
      auditedRows,
      pendingReview,
      needsCorrection,
      recentAuditsRaw,
      vehicleMachineryAssets,
    ] = await Promise.all([
      prisma.fireExtinguisher.count({ where: { isActive: true } }),
      prisma.fireExtinguisher.count({ where: { isActive: true, ...buildFireExtinguisherStatusFilter('vencido') } }),
      prisma.fireExtinguisher.count({ where: { isActive: true, ...buildFireExtinguisherStatusFilter('proximo_vencer') } }),
      prisma.fireExtinguisher.count({ where: { isActive: true, ...buildFireExtinguisherStatusFilter('sin_fecha') } }),
      prisma.fireExtinguisher.findMany({
        where: { isActive: true },
        select: {
          establishment: true,
          locationType: true,
          expirationDate: true,
          manufacturingYear: true,
          hydraulicTestExpirationDate: true,
        },
      }),
      catalogsService.findByCategory('fire_ext_establishment'),
      prisma.fireExtinguisher.groupBy({
        by: ['type'],
        _count: { _all: true },
        where: { isActive: true },
        orderBy: { _count: { type: 'desc' } },
      }),
      // Sin filtrar por status — mismo criterio que getCoverage()/getAuditDashboard()
      // en fire-extinguisher-audits.service.ts: un matafuego con solo una
      // auditoría RECHAZADA todavía sin recorregir cuenta como "auditado este
      // período" acá también, igual que ya contaba si esa auditoría estaba en
      // NEEDS_CORRECTION.
      prisma.fireExtinguisherAudit.findMany({
        where: { auditPeriod: currentPeriod },
        select: { fireExtinguisherId: true },
        distinct: ['fireExtinguisherId'],
      }),
      prisma.fireExtinguisherAudit.count({ where: { status: 'SUBMITTED' } }),
      prisma.fireExtinguisherAudit.count({ where: { status: 'NEEDS_CORRECTION' } }),
      prisma.fireExtinguisherAudit.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { extinguisher: { select: { code: true } } },
      }),
      prisma.asset.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          name: true,
          assetType: true,
          fireExtinguishers: {
            where: { isActive: true },
            select: { id: true, code: true, expirationDate: true, manufacturingYear: true, hydraulicTestExpirationDate: true },
          },
        },
      }),
    ])

    const vigenteCount = totalActive - vencidoCount - proximoVencerCount - sinFechaCount

    const establishments = establishmentCatalog.map((c) => c.label)
    const byEstablishmentMap = new Map<string, StatusBucket>(
      establishments.map((e) => [e, emptyBucket()]),
    )
    const byLocationTypeMap = new Map<string, Map<string, LocationTypeBucket>>(
      establishments.map((e) => [e, new Map()]),
    )
    for (const row of establishmentRows) {
      const bucket = row.establishment ? byEstablishmentMap.get(row.establishment) : undefined
      if (!bucket) continue // establecimiento legacy sin valor reconocido — no rompe el desglose
      const status = computeFireExtinguisherStatus(row.expirationDate, row.manufacturingYear, row.hydraulicTestExpirationDate)
      bucket.total += 1
      bucket[status] += 1

      const locationTypeMap = byLocationTypeMap.get(row.establishment!)!
      const locationTypeBucket = locationTypeMap.get(row.locationType) ?? { locationType: row.locationType, ...emptyBucket() }
      locationTypeBucket.total += 1
      locationTypeBucket[status] += 1
      locationTypeMap.set(row.locationType, locationTypeBucket)
    }
    const byEstablishment = establishments.map((establishment) => ({
      establishment,
      ...byEstablishmentMap.get(establishment)!,
      byLocationType: [...byLocationTypeMap.get(establishment)!.values()].sort((a, b) => b.total - a.total),
    }))

    const byType = byTypeRaw.map((row) => ({ type: row.type, count: row._count._all }))

    const recentAudits = recentAuditsRaw.map((a) => ({
      id: a.id,
      extinguisherCode: a.extinguisher.code,
      status: a.status,
      auditPeriod: a.auditPeriod,
      auditedBy: a.auditedBy,
      createdAt: a.createdAt,
    }))

    // Matafuegos vinculados a un vehículo/maquinaria — excluidos de la
    // auditoría de matafuegos (no de este dashboard: `totals.total` sigue
    // siendo TODO activo, sin filtrar). Se derivan de vehicleMachineryAssets
    // en vez de agregar una query nueva.
    const excludedFeIds = new Set<string>()
    const vehiculos = emptyVehicleMachineryGroup()
    const maquinaria = emptyVehicleMachineryGroup()
    for (const asset of vehicleMachineryAssets) {
      const category = classifyAssetType(asset.assetType)
      if (!category) continue

      for (const fe of asset.fireExtinguishers) excludedFeIds.add(fe.id)

      const group = category === 'vehiculo' ? vehiculos : maquinaria
      const fireExtinguishers = asset.fireExtinguishers.map((fe) => ({
        id: fe.id,
        code: fe.code ?? fe.id.slice(0, 8).toUpperCase(),
        status: computeFireExtinguisherStatus(fe.expirationDate, fe.manufacturingYear, fe.hydraulicTestExpirationDate),
      }))

      group.total += 1
      if (fireExtinguishers.length > 0) group.conMatafuego += 1
      else group.sinMatafuego += 1
      group.items.push({
        id: asset.id,
        code: asset.code ?? asset.id.slice(0, 8).toUpperCase(),
        name: asset.name,
        assetType: asset.assetType,
        fireExtinguishers,
      })
    }
    vehiculos.items = sortVehicleMachineryItems(vehiculos.items)
    maquinaria.items = sortVehicleMachineryItems(maquinaria.items)

    const auditApplicableActive = Math.max(0, totalActive - excludedFeIds.size)
    const auditedThisPeriod = auditedRows.filter((r) => !excludedFeIds.has(r.fireExtinguisherId)).length
    const coveragePercent =
      auditApplicableActive > 0 ? Math.round((auditedThisPeriod / auditApplicableActive) * 100) : 0

    return {
      totals: {
        total: totalActive,
        vigente: vigenteCount,
        proximo_vencer: proximoVencerCount,
        vencido: vencidoCount,
        sin_fecha: sinFechaCount,
      },
      byEstablishment,
      byType,
      audits: {
        currentPeriod,
        totalActive: auditApplicableActive,
        auditedThisPeriod,
        coveragePercent,
        pendingReview,
        needsCorrection,
      },
      recentAudits,
      vehicleMachineryCoverage: { vehiculos, maquinaria },
    }
  },
}
