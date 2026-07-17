import { prisma } from '../../config/database'
import { currentYearMonth } from '../../shared/utils/dates'
import { computeFireExtinguisherStatus, buildFireExtinguisherStatusFilter } from './fire-extinguishers.expiration'
import { catalogsService } from '../catalogs/catalogs.service'

interface StatusBucket {
  total: number
  vigente: number
  proximo_vencer: number
  vencido: number
}

interface LocationTypeBucket extends StatusBucket {
  locationType: string
}

function emptyBucket(): StatusBucket {
  return { total: 0, vigente: 0, proximo_vencer: 0, vencido: 0 }
}

export const fireExtinguishersDashboardService = {
  async getDashboardSummary() {
    const currentPeriod = currentYearMonth()

    const [
      totalActive,
      vencidoCount,
      proximoVencerCount,
      establishmentRows,
      establishmentCatalog,
      byTypeRaw,
      auditedRows,
      pendingReview,
      needsCorrection,
      recentAuditsRaw,
    ] = await Promise.all([
      prisma.fireExtinguisher.count({ where: { isActive: true } }),
      prisma.fireExtinguisher.count({ where: { isActive: true, ...buildFireExtinguisherStatusFilter('vencido') } }),
      prisma.fireExtinguisher.count({ where: { isActive: true, ...buildFireExtinguisherStatusFilter('proximo_vencer') } }),
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
      prisma.fireExtinguisherAudit.findMany({
        where: { auditPeriod: currentPeriod, status: { not: 'REJECTED' } },
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
    ])

    const vigenteCount = totalActive - vencidoCount - proximoVencerCount

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

    const auditedThisPeriod = auditedRows.length
    const coveragePercent = totalActive > 0 ? Math.round((auditedThisPeriod / totalActive) * 100) : 0

    const recentAudits = recentAuditsRaw.map((a) => ({
      id: a.id,
      extinguisherCode: a.extinguisher.code,
      status: a.status,
      auditPeriod: a.auditPeriod,
      auditedBy: a.auditedBy,
      createdAt: a.createdAt,
    }))

    return {
      totals: { total: totalActive, vigente: vigenteCount, proximo_vencer: proximoVencerCount, vencido: vencidoCount },
      byEstablishment,
      byType,
      audits: {
        currentPeriod,
        totalActive,
        auditedThisPeriod,
        coveragePercent,
        pendingReview,
        needsCorrection,
      },
      recentAudits,
    }
  },
}
