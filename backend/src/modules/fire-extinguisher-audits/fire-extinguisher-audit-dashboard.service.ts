import { prisma } from '../../config/database'
import type { ModuleKey, AuditScopeArea } from '../../shared/types'
import { latestByKey } from '../../shared/utils/latest-by-key'
import { computeFireExtinguisherStatus } from '../fire-extinguishers/fire-extinguishers.expiration'
import { matchesAuditPopulation, auditScopeKeyFor, auditScopeMatchValueFor, type FireExtAuditPopulation } from './fire-extinguisher-audits.population'
import {
  CLEANLINESS_SCORES,
  CHARGE_FILL_SCORES,
  HOSE_NOZZLE_SCORES,
  MOUNTING_CONDITION_SCORES,
  HAS_STATUS_SCORES,
  EXPIRATION_SCORES,
  CONTROL_POINT_DEFS,
  controlPointLabel,
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

interface AuditChecklistScores {
  cleanliness: string
  chargeFillStatus: string
  mountingCondition: string
  sealStatus: string
  ringStatus: string
  hoseNozzleCondition: string
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
    mountingCondition: { sum: 0, count: 0 },
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

// Puntaje de los 6 puntos de control que vienen de la auditoría del período
// (todo salvo vencimiento, que se calcula siempre desde el maestro y se suma
// aparte) — misma matemática para las dos poblaciones (Matafuegos/Activos),
// único lugar que la implementa.
function accumulateAuditScores(acc: Record<ControlPointKey, Accumulator>, audit: AuditChecklistScores) {
  addScore(acc.cleanliness, CLEANLINESS_SCORES[audit.cleanliness])
  addScore(acc.chargeFillStatus, CHARGE_FILL_SCORES[audit.chargeFillStatus])
  addScore(acc.hoseNozzleCondition, HOSE_NOZZLE_SCORES[audit.hoseNozzleCondition])
  addScore(acc.mountingCondition, MOUNTING_CONDITION_SCORES[audit.mountingCondition])
  addScore(acc.sealStatus, HAS_STATUS_SCORES[audit.sealStatus])
  addScore(acc.ringStatus, HAS_STATUS_SCORES[audit.ringStatus])
}

// Un punto de control sin ningún dato da `null`, no 0 — "sin dato no arrastra
// el promedio hacia abajo".
function levelOf(acc: Accumulator): number | null {
  return acc.count > 0 ? +(acc.sum / acc.count).toFixed(1) : null
}

function toControlPointLevels(accs: Record<ControlPointKey, Accumulator>, population: FireExtAuditPopulation) {
  return CONTROL_POINT_DEFS.map((def) => {
    const level = levelOf(accs[def.key])
    return { key: def.key, label: controlPointLabel(def.key, population), level, levelLabel: classifyLevel(level) }
  })
}

function averageOfLevels(levels: (number | null)[]): number | null {
  const values = levels.filter((v): v is number => v != null)
  if (values.length === 0) return null
  return +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)
}

// Único módulo "de auditar" + área de scope por población — usado solo por
// getAuditorProgress para resolver quién es "un auditor de esta población".
const POPULATION_CONFIG: Record<FireExtAuditPopulation, { coverageModule: ModuleKey; scopeArea: AuditScopeArea }> = {
  ESTABLISHMENT: { coverageModule: 'fire_extinguisher_audit_coverage', scopeArea: 'FIRE_EXTINGUISHER_AUDIT' },
  ASSET: { coverageModule: 'asset_audit_coverage', scopeArea: 'ASSET_AUDIT' },
}

function buildFireExtinguisherAuditDashboardService(population: FireExtAuditPopulation) {
  return {
    // Dashboard ejecutivo de nivel % de la auditoría mensual — complementa a
    // getFindingsReport (que cuenta por categoría y lista matafuegos) con un
    // puntaje 0-100 por punto de control. Población ESTABLISHMENT: agrupado en
    // dos niveles (establecimiento → zona), igual que siempre. Población
    // ASSET: agrupado en un solo nivel, por categoría de activo — no hay
    // establecimiento en un vehículo/maquinaria.
    async getAuditDashboard(period: string, groupFilter?: string) {
      // `establishment` es una columna real — filtrar en el WHERE evita traer
      // el resto del universo. `category` (población ASSET) es derivada de
      // Asset.assetType, no una columna: se filtra en memoria más abajo.
      const feWhere: Record<string, unknown> = { isActive: true }
      if (population === 'ESTABLISHMENT' && groupFilter) feWhere.establishment = groupFilter

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
            asset: { select: { assetType: true, fireExtinguisherAuditable: true } },
          },
          orderBy: [{ establishment: 'asc' }, { locationType: 'asc' }],
        }),
        prisma.fireExtinguisherAudit.findMany({
          where: { auditPeriod: period },
          select: {
            fireExtinguisherId: true,
            auditDate: true,
            cleanliness: true,
            chargeFillStatus: true,
            mountingCondition: true,
            sealStatus: true,
            ringStatus: true,
            hoseNozzleCondition: true,
          },
          // Más reciente por createdAt, no por auditDate — ver latest-by-key.ts.
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const latestAuditByExtinguisher = latestByKey(audits, (a) => a.fireExtinguisherId)

      interface GroupAcc {
        total: number
        audited: number
        controlPoints: Record<ControlPointKey, Accumulator>
        expiredExtinguishers: FlaggedExtinguisher[]
        needsCleaningExtinguishers: FlaggedExtinguisher[]
      }
      function emptyGroupAcc(): GroupAcc {
        return { total: 0, audited: 0, controlPoints: emptyAccumulators(), expiredExtinguishers: [], needsCleaningExtinguishers: [] }
      }

      let totalRegistered = 0
      let totalAudited = 0

      if (population === 'ESTABLISHMENT') {
        // El filtro por establecimiento ya se aplicó en el WHERE de Prisma
        // (feWhere más arriba) — acá solo queda excluir la población ASSET.
        const establishmentMap = new Map<string, Map<string, GroupAcc>>()

        for (const fe of extinguishers) {
          if (!matchesAuditPopulation(fe, population)) continue

          totalRegistered += 1
          const est = fe.establishment ?? 'Sin establecimiento'
          if (!establishmentMap.has(est)) establishmentMap.set(est, new Map())
          const sectorsMap = establishmentMap.get(est)!
          if (!sectorsMap.has(fe.locationType)) sectorsMap.set(fe.locationType, emptyGroupAcc())
          const sectorAcc = sectorsMap.get(fe.locationType)!
          sectorAcc.total += 1

          const expirationStatus = computeFireExtinguisherStatus(fe.expirationDate, fe.manufacturingYear, fe.hydraulicTestExpirationDate)
          addScore(sectorAcc.controlPoints.expiration, EXPIRATION_SCORES[expirationStatus])
          if (expirationStatus === 'vencido') {
            sectorAcc.expiredExtinguishers.push({ cylinderNumber: fe.cylinderNumber ?? fe.code, location: fe.location })
          }

          const audit = latestAuditByExtinguisher.get(fe.id)
          if (!audit) continue

          totalAudited += 1
          sectorAcc.audited += 1
          accumulateAuditScores(sectorAcc.controlPoints, audit)
          if (audit.cleanliness !== CLEAN_CLEANLINESS_VALUE) {
            sectorAcc.needsCleaningExtinguishers.push({ cylinderNumber: fe.cylinderNumber ?? fe.code, location: fe.location })
          }
        }

        const sectors = [...establishmentMap.entries()]
          .flatMap(([est, sectorsMap]) =>
            [...sectorsMap.entries()].map(([locationType, sectorAcc]) => {
              const controlPoints = toControlPointLevels(sectorAcc.controlPoints, population)
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

        const controlPoints = CONTROL_POINT_DEFS.map((def) => {
          const level = averageOfLevels(sectors.map((s) => s.controlPoints.find((c) => c.key === def.key)!.level))
          return { key: def.key, label: controlPointLabel(def.key, population), level, levelLabel: classifyLevel(level) }
        })
        const overallLevel = averageOfLevels(sectors.map((s) => s.level))

        return {
          period,
          establishment: groupFilter ?? null,
          establishments: groupFilter ? null : [...establishmentMap.keys()].sort((a, b) => a.localeCompare(b)),
          totalRegistered,
          totalAudited,
          overallLevel,
          overallLevelLabel: classifyLevel(overallLevel),
          controlPoints,
          sectors,
        }
      }

      // Población ASSET — un solo nivel de agrupación, por categoría de activo.
      const categoryMap = new Map<string, GroupAcc>()

      for (const fe of extinguishers) {
        if (!matchesAuditPopulation(fe, population)) continue
        const category = auditScopeKeyFor(fe, population)
        if (!category) continue
        if (groupFilter && category !== groupFilter) continue

        totalRegistered += 1
        if (!categoryMap.has(category)) categoryMap.set(category, emptyGroupAcc())
        const acc = categoryMap.get(category)!
        acc.total += 1

        const expirationStatus = computeFireExtinguisherStatus(fe.expirationDate, fe.manufacturingYear, fe.hydraulicTestExpirationDate)
        addScore(acc.controlPoints.expiration, EXPIRATION_SCORES[expirationStatus])
        if (expirationStatus === 'vencido') {
          acc.expiredExtinguishers.push({ cylinderNumber: fe.cylinderNumber ?? fe.code, location: fe.location })
        }

        const audit = latestAuditByExtinguisher.get(fe.id)
        if (!audit) continue

        totalAudited += 1
        acc.audited += 1
        accumulateAuditScores(acc.controlPoints, audit)
        if (audit.cleanliness !== CLEAN_CLEANLINESS_VALUE) {
          acc.needsCleaningExtinguishers.push({ cylinderNumber: fe.cylinderNumber ?? fe.code, location: fe.location })
        }
      }

      const groups = [...categoryMap.entries()]
        .map(([category, acc]) => {
          const controlPoints = toControlPointLevels(acc.controlPoints, population)
          const level = averageOfLevels(controlPoints.map((c) => c.level))
          return {
            category,
            total: acc.total,
            audited: acc.audited,
            level,
            levelLabel: classifyLevel(level),
            controlPoints,
            expiredExtinguishers: acc.expiredExtinguishers,
            needsCleaningExtinguishers: acc.needsCleaningExtinguishers,
          }
        })
        .sort((a, b) => a.category.localeCompare(b.category))

      const controlPoints = CONTROL_POINT_DEFS.map((def) => {
        const level = averageOfLevels(groups.map((g) => g.controlPoints.find((c) => c.key === def.key)!.level))
        return { key: def.key, label: controlPointLabel(def.key, population), level, levelLabel: classifyLevel(level) }
      })
      const overallLevel = averageOfLevels(groups.map((g) => g.level))

      return {
        period,
        category: groupFilter ?? null,
        categories: groupFilter ? null : [...categoryMap.keys()].sort((a, b) => a.localeCompare(b)),
        totalRegistered,
        totalAudited,
        overallLevel,
        overallLevelLabel: classifyLevel(overallLevel),
        controlPoints,
        groups,
      }
    },

    // Progreso por auditor: para cada usuario con el módulo "de auditar" de
    // esta población, cuántos matafuegos de SU alcance asignado
    // (UserAuditScope) ya tienen auditoría este período vs cuántos faltan. El
    // cruce con "quién auditó" se hace por email (auditedBy es un string, no
    // una FK a User — igual que en todo el resto del schema) — un enfoque
    // suficiente para un reporte de lectura, no para hacer cumplir una
    // restricción. Incluye auditores sin nada asignado todavía (assigned=0)
    // para que el admin note que falta configurarlos.
    async getAuditorProgress(period: string) {
      const config = POPULATION_CONFIG[population]
      const [auditors, extinguishers, auditRows] = await Promise.all([
        prisma.user.findMany({
          where: { isActive: true, accessProfile: { modules: { has: config.coverageModule } } },
          select: {
            id: true,
            name: true,
            email: true,
            auditScopes: { where: { area: config.scopeArea }, select: { scopeValue: true } },
          },
          orderBy: { name: 'asc' },
        }),
        prisma.fireExtinguisher.findMany({
          where: { isActive: true },
          select: { id: true, establishment: true, assetId: true, asset: { select: { assetType: true, fireExtinguisherAuditable: true } } },
        }),
        prisma.fireExtinguisherAudit.findMany({
          where: { auditPeriod: period },
          select: { fireExtinguisherId: true, auditedBy: true, auditDate: true },
          // Más reciente por createdAt, no por auditDate — ver latest-by-key.ts.
          orderBy: { createdAt: 'desc' },
        }),
      ])

      const eligible = extinguishers
        .filter((fe) => matchesAuditPopulation(fe, population))
        .map((fe) => ({ id: fe.id, scopeKey: auditScopeMatchValueFor(fe, population) }))
        .filter((fe): fe is { id: string; scopeKey: string } => fe.scopeKey != null)

      const latestAuditByExtinguisher = latestByKey(auditRows, (a) => a.fireExtinguisherId) // fireExtinguisherId -> última fila

      return {
        period,
        auditors: auditors.map((u) => {
          const scope = new Set(u.auditScopes.map((s) => s.scopeValue))
          const assignedExtinguishers = eligible.filter((fe) => scope.has(fe.scopeKey))
          const completed = assignedExtinguishers.filter((fe) => latestAuditByExtinguisher.get(fe.id)?.auditedBy === u.email).length
          const assigned = assignedExtinguishers.length
          const sortedScope = [...scope].sort((a, b) => a.localeCompare(b))
          const base = {
            userId: u.id,
            name: u.name,
            email: u.email,
            assigned,
            completed,
            pending: assigned - completed,
            completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : null,
          }
          return population === 'ESTABLISHMENT'
            ? { ...base, assignedEstablishments: sortedScope }
            : { ...base, assignedAssetIds: sortedScope }
        }),
      }
    },
  }
}

export const fireExtinguisherAuditDashboardService = buildFireExtinguisherAuditDashboardService('ESTABLISHMENT')
export const assetFireExtinguisherAuditDashboardService = buildFireExtinguisherAuditDashboardService('ASSET')
