import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { toDateStr } from '../../shared/utils/dates'
import type {
  CreateClaimDTO,
  UpdateClaimDTO,
  ListClaimsQueryDTO,
  AddEventDTO,
} from './claims.schemas'

// ── Includes ──────────────────────────────────────────────────────────────────

const CLAIM_LIST_INCLUDE = {
  asset: { select: { id: true, name: true } },
  policy: { select: { id: true, policyNumber: true } },
  _count: { select: { events: true } },
}

const CLAIM_DETAIL_INCLUDE = {
  asset: { select: { id: true, name: true, assetType: true } },
  policy: { select: { id: true, policyNumber: true, insuredName: true } },
  events: { orderBy: { date: 'desc' as const } },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapEvent(e: Record<string, unknown>) {
  return {
    id: e.id,
    claimId: e.claimId,
    type: e.type,
    description: e.description,
    date: toDateStr(e.date as Date | string),
    previousStatus: e.previousStatus ?? null,
    newStatus: e.newStatus ?? null,
    amountLabel: e.amountLabel ?? null,
    previousAmount: e.previousAmount ?? null,
    newAmount: e.newAmount ?? null,
    author: e.createdBy ?? null,
    createdAt: e.createdAt,
  }
}

async function generateClaimNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const result = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('claim_number_seq')`
  const seq = String(Number(result[0].nextval)).padStart(5, '0')
  return `SIN-${year}-${seq}`
}

// ── Service ───────────────────────────────────────────────────────────────────

export const claimsService = {
  async findAll(query: ListClaimsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Record<string, unknown> = {}
    if (query.isActive !== undefined) where.isActive = query.isActive
    if (query.status) where.status = query.status
    if (query.claimType) where.claimType = query.claimType
    if (query.policyId) where.policyId = query.policyId
    if (query.assetId) where.assetId = query.assetId
    if (query.year) {
      const y = String(query.year)
      where.occurrenceDate = { gte: `${y}-01-01`, lte: `${y}-12-31` }
    }
    if (query.search) {
      where.OR = [
        { claimNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { insuranceCompany: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [rawData, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: CLAIM_LIST_INCLUDE,
      }),
      prisma.claim.count({ where }),
    ])

    return buildPaginatedResponse(rawData, total, { page, limit })
  },

  async findById(id: string) {
    const claim = await prisma.claim.findUnique({
      where: { id },
      include: CLAIM_DETAIL_INCLUDE,
    })
    if (!claim) throw new AppError(404, 'Siniestro no encontrado', 'NOT_FOUND')

    return {
      ...claim,
      events: claim.events.map((e) => mapEvent(e as unknown as Record<string, unknown>)),
    }
  },

  async create(data: CreateClaimDTO, createdBy?: string) {
    if (data.assetId) {
      const asset = await prisma.asset.findFirst({ where: { id: data.assetId, isActive: true } })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    if (data.policyId) {
      const policy = await prisma.policy.findFirst({ where: { id: data.policyId, isActive: true } })
      if (!policy) throw new AppError(400, 'Póliza no encontrada o inactiva', 'INVALID_REFERENCE')
    }

    const claimNumber = await generateClaimNumber()

    const claim = await prisma.claim.create({
      data: {
        claimNumber,
        assetId: data.assetId ?? null,
        policyId: data.policyId ?? null,
        claimType: data.claimType,
        occurrenceDate: data.occurrenceDate,
        reportDate: data.reportDate,
        description: data.description,
        insuranceCompany: data.insuranceCompany ?? null,
        status: data.status,
        claimedAmountArs: data.claimedAmountArs,
        realAmountArs: data.realAmountArs ?? null,
        settledAmountArs: data.settledAmountArs ?? null,
        deductibleArs: data.deductibleArs ?? null,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        observations: data.observations ?? null,
        // Auto-generate initial event
        events: {
          create: {
            type: 'siniestro_creado',
            description: 'Siniestro registrado en el sistema',
            date: new Date(),
            createdBy: createdBy ?? 'Sistema',
          },
        },
      },
      include: CLAIM_DETAIL_INCLUDE,
    })

    return {
      ...claim,
      events: claim.events.map((e) => mapEvent(e as unknown as Record<string, unknown>)),
    }
  },

  async update(id: string, data: UpdateClaimDTO) {
    await this.assertExists(id)

    if (data.assetId) {
      const asset = await prisma.asset.findFirst({ where: { id: data.assetId, isActive: true } })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    if (data.policyId) {
      const policy = await prisma.policy.findFirst({ where: { id: data.policyId, isActive: true } })
      if (!policy) throw new AppError(400, 'Póliza no encontrada o inactiva', 'INVALID_REFERENCE')
    }

    const updated = await prisma.claim.update({
      where: { id },
      data: {
        ...(data.claimType && { claimType: data.claimType }),
        ...(data.occurrenceDate && { occurrenceDate: data.occurrenceDate }),
        ...(data.reportDate && { reportDate: data.reportDate }),
        ...(data.description && { description: data.description }),
        ...(data.insuranceCompany !== undefined && { insuranceCompany: data.insuranceCompany }),
        ...(data.status && { status: data.status }),
        ...(data.claimedAmountArs !== undefined && { claimedAmountArs: data.claimedAmountArs }),
        ...(data.realAmountArs !== undefined && { realAmountArs: data.realAmountArs }),
        ...(data.settledAmountArs !== undefined && { settledAmountArs: data.settledAmountArs }),
        ...(data.deductibleArs !== undefined && { deductibleArs: data.deductibleArs }),
        ...(data.currency && { currency: data.currency }),
        ...(data.exchangeRate !== undefined && { exchangeRate: data.exchangeRate }),
        ...(data.observations !== undefined && { observations: data.observations }),
        ...(data.assetId !== undefined && { assetId: data.assetId }),
        ...(data.policyId !== undefined && { policyId: data.policyId }),
      },
      include: CLAIM_DETAIL_INCLUDE,
    })

    return {
      ...updated,
      events: updated.events.map((e) => mapEvent(e as unknown as Record<string, unknown>)),
    }
  },

  async softDelete(id: string) {
    await this.assertExists(id)
    await prisma.claim.update({ where: { id }, data: { isActive: false } })
  },

  // ── Events ────────────────────────────────────────────────────────────────────

  async findEvents(claimId: string) {
    await this.assertExists(claimId)
    const events = await prisma.claimEvent.findMany({
      where: { claimId },
      orderBy: { date: 'desc' },
    })
    return events.map((e) => mapEvent(e as unknown as Record<string, unknown>))
  },

  async addEvent(claimId: string, data: AddEventDTO) {
    await this.assertExists(claimId)

    const event = await prisma.claimEvent.create({
      data: {
        claimId,
        type: data.type,
        description: data.description,
        date: data.date,
        previousStatus: data.previousStatus ?? null,
        newStatus: data.newStatus ?? null,
        amountLabel: data.amountLabel ?? null,
        previousAmount: data.previousAmount ?? null,
        newAmount: data.newAmount ?? null,
        createdBy: data.createdBy ?? null,
      },
    })

    return mapEvent(event as unknown as Record<string, unknown>)
  },

  async deleteEvent(claimId: string, eventId: string) {
    const event = await prisma.claimEvent.findFirst({ where: { id: eventId, claimId } })
    if (!event) throw new AppError(404, 'Evento no encontrado', 'NOT_FOUND')
    await prisma.claimEvent.delete({ where: { id: eventId } })
  },

  // ── Private ───────────────────────────────────────────────────────────────────

  async assertExists(id: string) {
    const claim = await prisma.claim.findUnique({ where: { id } })
    if (!claim) throw new AppError(404, 'Siniestro no encontrado', 'NOT_FOUND')
    return claim
  },
}
