import { prisma } from '../../config/database'
import { computeFireExtinguisherStatus } from '../fire-extinguishers/fire-extinguishers.expiration'
import { classifyAssetType } from '../fire-extinguishers/asset-type-classification'
import {
  CLEANLINESS_SCORES,
  CHARGE_FILL_SCORES,
  HOSE_NOZZLE_SCORES,
  BEACON_PLATE_SCORES,
  HAS_STATUS_SCORES,
  EXPIRATION_SCORES,
  CONTROL_POINT_DEFS,
  classifyLevel,
  type ControlPointKey,
} from './fire-extinguisher-audit-dashboard.constants'

interface Accumulator {
  sum: number
  count: number
}

interface FlaggedExtinguisher {
  cylinderNumber: string
  location: string | null
}

// "Necesita limpieza" = la última auditoría del período no la marcó
// impecable. A diferencia de vencimiento (que se recalcula siempre desde el
// maestro), esto solo puede saberse si hubo auditoría este período.
const CLEAN_CLEANLINESS_VALUE = 'IMPECABLE'

function emptyAccumulators(): Record<ControlPointKey, Accumulator> {
  return {
    cleanliness: { sum: 0, count: 0 },
    chargeFillStatus: { sum: 0, count: 0 },
    hoseNozzleCondition: { sum: 0, count: 0 },
    beaconPlateCondition: { sum: 0, count: 0 },
    sealStatus: { sum: 0, count: 0 },
    ringStatus: { sum: 0, count: 0 },
    expiration: { sum: 0, count: 0 },
  }
}

// Si el estado no matchea ningún score conocido, no suma nada — evita
// arrastrar el promedio con un `NaN` ante un valor inesperado.
function addScore(acc: Accumulator, score: number | undefined) {
  if (score == null) return
  acc.sum += score
  acc.count += 1
}

// Un punto de control sin ningún dato da `null`, no 0 — "sin dato no arrastra
// el promedio hacia abajo".
function levelOf(acc: Accumulator): number | null {
  return acc.count > 0 ? +(acc.sum / acc.count).toFixed(1) : null
}

function toControlPointLevels(accs: Record<ControlPointKey, Accumulator>) {
  return CONTROL_POINT_DEFS.map((def) => {
    const level = levelOf(accs[def.key])
    return { key: def.key, label: def.label, level, levelLabel: classifyLevel(level) }
  })
}

function averageOfLevels(levels: (number | null)[]): number | null {
  const values = levels.filter((v): v is number => v != null)
  if (values.length === 0) return null
  return +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)
}

export const fireExtinguisherAuditDashboardService = {
  // Dashboard ejecutivo de nivel % de la auditoría mensual — complementa a
  // getFindingsReport (que cuenta por categoría y lista matafuegos) con un
  // puntaje 0-100 por punto de control, promediado por sector y en general.
  // Mismo query base que getFindingsReport (fire-extinguisher-audits.service.ts),
  // pero acumulando {sum, count} en vez de buckets por tier.
  async getAuditDashboard(period: string, establishment?: string) {
    const feWhere: Record<string, unknown> = { isActive: true }
    if (establishment) feWhere.establishment = establishment

    const [extinguishers, audits] = await Promise.all([
      prisma.fireExtinguisher.findMany({
        where: feWhere,
        select: {
          id: true,
          code: true,
          cylinderNumber: true,
          location: true,
          establishment: true,
          locationType: true,
          expirationDate: true,
          manufacturingYear: true,
          hydraulicTestExpirationDate: true,
          assetId: true,
          asset: { select: { assetType: true } },
        },
        orderBy: [{ establishment: 'asc' }, { locationType: 'asc' }],
      }),
      prisma.fireExtinguisherAudit.findMany({
        where: { auditPeriod: period, status: { not: 'REJECTED' } },
        select: {
          fireExtinguisherId: true,
          auditDate: true,
          cleanliness: true,
          chargeFillStatus: true,
          beaconPlateCondition: true,
          sealStatus: true,
          ringStatus: true,
          hoseNozzleCondition: true,
        },
        orderBy: { auditDate: 'desc' },
      }),
    ])

    const latestAuditByExtinguisher = new Map<string, (typeof audits)[number]>()
    for (const a of audits) {
      if (!latestAuditByExtinguisher.has(a.fireExtinguisherId)) {
        latestAuditByExtinguisher.set(a.fireExtinguisherId, a)
      }
    }

    interface SectorAcc {
      total: number
      audited: number
      controlPoints: Record<ControlPointKey, Accumulator>
      expiredExtinguishers: FlaggedExtinguisher[]
      needsCleaningExtinguishers: FlaggedExtinguisher[]
    }
    const establishmentMap = new Map<string, Map<string, SectorAcc>>()
    let totalRegistered = 0
    let totalAudited = 0

    for (const fe of extinguishers) {
      // Matafuegos vinculados a un vehículo/maquinaria no forman parte de
      // este informe (tienen su propio circuito futuro de auditoría de
      // activos) — mismo criterio que getCoverage()/create() en
      // fire-extinguisher-audits.service.ts.
      if (fe.assetId && classifyAssetType(fe.asset!.assetType) !== null) continue

      totalRegistered += 1
      const est = fe.establishment ?? 'Sin establecimiento'
      if (!establishmentMap.has(est)) establishmentMap.set(est, new Map())
      const sectorsMap = establishmentMap.get(est)!
      if (!sectorsMap.has(fe.locationType)) {
        sectorsMap.set(fe.locationType, {
          total: 0,
          audited: 0,
          controlPoints: emptyAccumulators(),
          expiredExtinguishers: [],
          needsCleaningExtinguishers: [],
        })
      }
      const sectorAcc = sectorsMap.get(fe.locationType)!
      sectorAcc.total += 1

      // Vencimiento — siempre, tenga o no auditoría este período (mismo
      // cálculo combinado que ya usa getFindingsReport).
      const expirationStatus = computeFireExtinguisherStatus(
        fe.expirationDate,
        fe.manufacturingYear,
        fe.hydraulicTestExpirationDate,
      )
      addScore(sectorAcc.controlPoints.expiration, EXPIRATION_SCORES[expirationStatus])
      if (expirationStatus === 'vencido') {
        sectorAcc.expiredExtinguishers.push({ cylinderNumber: fe.cylinderNumber ?? fe.code, location: fe.location })
      }

      const audit = latestAuditByExtinguisher.get(fe.id)
      if (!audit) continue

      totalAudited += 1
      sectorAcc.audited += 1
      addScore(sectorAcc.controlPoints.cleanliness, CLEANLINESS_SCORES[audit.cleanliness])
      addScore(sectorAcc.controlPoints.chargeFillStatus, CHARGE_FILL_SCORES[audit.chargeFillStatus])
      addScore(sectorAcc.controlPoints.hoseNozzleCondition, HOSE_NOZZLE_SCORES[audit.hoseNozzleCondition])
      addScore(sectorAcc.controlPoints.beaconPlateCondition, BEACON_PLATE_SCORES[audit.beaconPlateCondition])
      addScore(sectorAcc.controlPoints.sealStatus, HAS_STATUS_SCORES[audit.sealStatus])
      addScore(sectorAcc.controlPoints.ringStatus, HAS_STATUS_SCORES[audit.ringStatus])
      if (audit.cleanliness !== CLEAN_CLEANLINESS_VALUE) {
        sectorAcc.needsCleaningExtinguishers.push({ cylinderNumber: fe.cylinderNumber ?? fe.code, location: fe.location })
      }
    }

    const sectors = [...establishmentMap.entries()]
      .flatMap(([est, sectorsMap]) =>
        [...sectorsMap.entries()].map(([locationType, sectorAcc]) => {
          const controlPoints = toControlPointLevels(sectorAcc.controlPoints)
          const level = averageOfLevels(controlPoints.map((c) => c.level))
          return {
            establishment: est,
            locationType,
            total: sectorAcc.total,
            audited: sectorAcc.audited,
            level,
            levelLabel: classifyLevel(level),
            controlPoints,
            expiredExtinguishers: sectorAcc.expiredExtinguishers,
            needsCleaningExtinguishers: sectorAcc.needsCleaningExtinguishers,
          }
        }),
      )
      .sort((a, b) => a.establishment.localeCompare(b.establishment) || a.locationType.localeCompare(b.locationType))

    // Nivel global por punto de control = promedio (no ponderado) del nivel
    // de ese punto entre los sectores que sí tienen dato — así "Nivel
    // general" (promedio de sectores) coincide con el promedio de estos 7
    // (asumiendo cobertura completa, ver plan).
    const controlPoints = CONTROL_POINT_DEFS.map((def) => {
      const level = averageOfLevels(sectors.map((s) => s.controlPoints.find((c) => c.key === def.key)!.level))
      return { key: def.key, label: def.label, level, levelLabel: classifyLevel(level) }
    })

    const overallLevel = averageOfLevels(sectors.map((s) => s.level))

    return {
      period,
      establishment: establishment ?? null,
      establishments: establishment ? null : [...establishmentMap.keys()].sort((a, b) => a.localeCompare(b)),
      totalRegistered,
      totalAudited,
      overallLevel,
      overallLevelLabel: classifyLevel(overallLevel),
      controlPoints,
      sectors,
    }
  },
}
