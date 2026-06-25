import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { toISODate, toDateStr, dateOffset, todayDate } from '../../shared/utils/dates'
import type {
  CreateFireExtinguisherDTO,
  UpdateFireExtinguisherDTO,
  ListFireExtinguishersQueryDTO,
  RechargeDTO,
  AddHistoryDTO,
} from './fire-extinguishers.schemas'

// ── Status helpers ────────────────────────────────────────────────────────────

type FireExtStatus = 'vigente' | 'proximo_vencer' | 'vencido'

function computeStatus(expirationDate: Date | string): FireExtStatus {
  const exp = toDateStr(expirationDate)
  const today = toISODate()
  const in30Days = toISODate(new Date(Date.now() + 30 * 86400000))
  if (exp < today) return 'vencido'
  if (exp <= in30Days) return 'proximo_vencer'
  return 'vigente'
}

function buildStatusFilter(status: string): Record<string, unknown> {
  const today = todayDate()
  const in30Days = dateOffset(30)
  if (status === 'vigente') return { expirationDate: { gt: in30Days } }
  if (status === 'proximo_vencer') return { expirationDate: { gte: today, lte: in30Days } }
  if (status === 'vencido') return { expirationDate: { lt: today } }
  return {}
}

// ── Response mappers ──────────────────────────────────────────────────────────

function mapFireExt(fe: Record<string, unknown>) {
  return {
    id: fe.id,
    code: fe.code,
    type: fe.type,
    capacity: fe.capacity,
    chargeDate: fe.lastRechargeDate ? toDateStr(fe.lastRechargeDate as Date | string) : null,
    expirationDate: toDateStr(fe.expirationDate as Date | string),
    associatedAssetId: fe.assetId ?? null,
    associatedLocationType: fe.locationType,
    status: computeStatus(fe.expirationDate as Date | string),
    observations: fe.observations ?? '',
    brand: fe.brand ?? null,
    serialNumber: fe.serialNumber ?? null,
    isActive: fe.isActive,
    createdAt: fe.createdAt,
    updatedAt: fe.updatedAt,
  }
}

function mapHistory(h: Record<string, unknown>) {
  return {
    id: h.id,
    fireExtinguisherId: h.fireExtinguisherId,
    eventType: h.action,
    eventDate: toDateStr(h.date as Date | string),
    previousValue: h.previousExpirationDate ? toDateStr(h.previousExpirationDate as Date | string) : '',
    newValue: h.nextDueDate ? toDateStr(h.nextDueDate as Date | string) : '',
    observations: (h.notes as string) ?? '',
    createdBy: (h.performedBy as string) ?? 'Sistema',
    createdAt: h.createdAt,
  }
}

// ── Code generation ───────────────────────────────────────────────────────────

const PREFIX_MAP: Record<string, string> = {
  vehiculo: 'VEH',
  maquinaria: 'MAQ',
  establecimiento: 'EST',
  edificio: 'EDI',
  infraestructura: 'INF',
}

async function generateCode(locationType: string): Promise<string> {
  const prefix = PREFIX_MAP[locationType] ?? 'GEN'
  const result = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('fire_ext_code_seq')`
  const seq = String(Number(result[0].nextval)).padStart(3, '0')
  return `MAT-${prefix}${seq}-A`
}

// ── Service ───────────────────────────────────────────────────────────────────

export const fireExtinguishersService = {
  async findAll(query: ListFireExtinguishersQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Record<string, unknown> = {}
    if (query.isActive !== undefined) where.isActive = query.isActive
    if (query.locationType) where.locationType = query.locationType
    if (query.assetId) where.assetId = query.assetId
    if (query.status) Object.assign(where, buildStatusFilter(query.status))
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { type: { contains: query.search, mode: 'insensitive' } },
        { observations: { contains: query.search, mode: 'insensitive' } },
        { serialNumber: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [rawData, total] = await Promise.all([
      prisma.fireExtinguisher.findMany({
        where,
        skip,
        take: limit,
        orderBy: { expirationDate: 'asc' },
        include: { asset: { select: { id: true, name: true } } },
      }),
      prisma.fireExtinguisher.count({ where }),
    ])

    return buildPaginatedResponse(
      rawData.map((fe) => mapFireExt(fe as unknown as Record<string, unknown>)),
      total,
      { page, limit },
    )
  },

  async findById(id: string) {
    const fe = await prisma.fireExtinguisher.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true } },
        history: { orderBy: { date: 'desc' }, take: 100 },
      },
    })
    if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')

    return {
      ...mapFireExt(fe as unknown as Record<string, unknown>),
      asset: fe.asset ?? null,
      history: fe.history.map((h) => mapHistory(h as unknown as Record<string, unknown>)),
    }
  },

  async findByAsset(assetId: string) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')

    const items = await prisma.fireExtinguisher.findMany({
      where: { assetId, isActive: true },
      orderBy: { expirationDate: 'asc' },
    })
    return items.map((fe) => mapFireExt(fe as unknown as Record<string, unknown>))
  },

  async create(data: CreateFireExtinguisherDTO) {
    if (data.associatedAssetId) {
      const asset = await prisma.asset.findFirst({
        where: { id: data.associatedAssetId, isActive: true },
      })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    const code = await generateCode(data.associatedLocationType)

    const fe = await prisma.fireExtinguisher.create({
      data: {
        code,
        type: data.type,
        capacity: data.capacity,
        expirationDate: data.expirationDate,
        lastRechargeDate: data.chargeDate ?? null,
        assetId: data.associatedAssetId ?? null,
        locationType: data.associatedLocationType,
        brand: data.brand ?? null,
        serialNumber: data.serialNumber ?? null,
        observations: data.observations ?? null,
      },
      include: { asset: { select: { id: true, name: true } } },
    })

    return mapFireExt(fe as unknown as Record<string, unknown>)
  },

  async update(id: string, data: UpdateFireExtinguisherDTO) {
    await this.assertExists(id)

    if (data.associatedAssetId) {
      const asset = await prisma.asset.findFirst({
        where: { id: data.associatedAssetId, isActive: true },
      })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    const fe = await prisma.fireExtinguisher.update({
      where: { id },
      data: {
        ...(data.type && { type: data.type }),
        ...(data.capacity && { capacity: data.capacity }),
        ...(data.expirationDate && { expirationDate: data.expirationDate }),
        ...(data.chargeDate !== undefined && { lastRechargeDate: data.chargeDate }),
        ...(data.associatedAssetId !== undefined && { assetId: data.associatedAssetId }),
        ...(data.associatedLocationType && { locationType: data.associatedLocationType }),
        ...(data.brand !== undefined && { brand: data.brand }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
        ...(data.observations !== undefined && { observations: data.observations }),
      },
      include: { asset: { select: { id: true, name: true } } },
    })

    return mapFireExt(fe as unknown as Record<string, unknown>)
  },

  async softDelete(id: string) {
    await this.assertExists(id)
    await prisma.fireExtinguisher.update({ where: { id }, data: { isActive: false } })
  },

  // ── Recharge ──────────────────────────────────────────────────────────────────

  async recharge(id: string, data: RechargeDTO) {
    const fe = await this.assertExists(id)

    const [updated] = await prisma.$transaction([
      prisma.fireExtinguisher.update({
        where: { id },
        data: {
          lastRechargeDate: data.chargeDate,
          expirationDate: data.expirationDate,
          isActive: true,
        },
      }),
      prisma.fireExtinguisherHistory.create({
        data: {
          fireExtinguisherId: id,
          action: 'Recarga',
          date: data.chargeDate,
          performedBy: data.technician ?? null,
          notes: data.observations ?? null,
          previousExpirationDate: fe.expirationDate,
          nextDueDate: data.expirationDate,
        },
      }),
    ])

    return mapFireExt(updated as unknown as Record<string, unknown>)
  },

  // ── History ───────────────────────────────────────────────────────────────────

  async findHistory(fireExtinguisherId: string) {
    await this.assertExists(fireExtinguisherId)
    const history = await prisma.fireExtinguisherHistory.findMany({
      where: { fireExtinguisherId },
      orderBy: { date: 'desc' },
    })
    return history.map((h) => mapHistory(h as unknown as Record<string, unknown>))
  },

  async addHistory(fireExtinguisherId: string, data: AddHistoryDTO) {
    await this.assertExists(fireExtinguisherId)

    const entry = await prisma.fireExtinguisherHistory.create({
      data: {
        fireExtinguisherId,
        action: data.action,
        date: data.date,
        performedBy: data.performedBy ?? null,
        notes: data.notes ?? null,
        nextDueDate: data.nextDueDate ?? null,
      },
    })

    return mapHistory(entry as unknown as Record<string, unknown>)
  },

  // ── Private ───────────────────────────────────────────────────────────────────

  async assertExists(id: string) {
    const fe = await prisma.fireExtinguisher.findUnique({ where: { id }, select: { id: true, expirationDate: true } })
    if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')
    return fe
  },
}
