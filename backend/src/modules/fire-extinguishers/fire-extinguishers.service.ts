import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { toDateStr, todayDate, computeExpirationStatus } from '../../shared/utils/dates'
import {
  computeFireExtinguisherStatus,
  computeManufacturingLifeStatus,
  buildFireExtinguisherStatusFilter,
  manufacturingExpirationYear,
} from './fire-extinguishers.expiration'
import type {
  CreateFireExtinguisherDTO,
  UpdateFireExtinguisherDTO,
  ListFireExtinguishersQueryDTO,
  RechargeDTO,
  AddHistoryDTO,
} from './fire-extinguishers.schemas'

// ── History / audit trail ────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  code: 'Código',
  internalNumber: 'Número interno',
  type: 'Tipo',
  capacity: 'Capacidad',
  expirationDate: 'Vencimiento de carga',
  lastRechargeDate: 'Fecha de recarga',
  assetId: 'Activo asociado',
  locationType: 'Tipo de ubicación',
  location: 'Ubicación',
  establishment: 'Establecimiento',
  brand: 'Marca',
  cylinderNumber: 'Número de cilindro',
  manufacturingYear: 'Año de fabricación',
  observations: 'Observaciones',
  isActive: 'Estado',
}

type HistoryClient = typeof prisma | Prisma.TransactionClient

/**
 * Escribe una fila de FireExtinguisherHistory con el diff genérico
 * (previousData/newData), usado por create/update/softDelete.
 * IMPORTANTE: no declarar esta función `async` — debe devolver directamente
 * el PrismaPromise de `.create(...)` para poder usarse como elemento de un
 * `$transaction([...])` en forma de array (recharge() ya usa ese patrón).
 * Envolverla en async/await rompería el batching de la transacción sin
 * arrojar ningún error de compilación.
 */
function recordHistoryEntry(
  client: HistoryClient,
  fireExtinguisherId: string,
  entry: {
    action: string
    description?: string
    previousData?: Record<string, unknown>
    newData?: Record<string, unknown>
    performedBy?: string | null
  },
) {
  return client.fireExtinguisherHistory.create({
    data: {
      fireExtinguisherId,
      action: entry.action,
      date: todayDate(),
      performedBy: entry.performedBy ?? null,
      description: entry.description ?? null,
      previousData: entry.previousData as Prisma.InputJsonValue | undefined,
      newData: entry.newData as Prisma.InputJsonValue | undefined,
    },
  })
}

function buildChanges(
  previousData: unknown,
  newData: unknown,
): { field: string; label: string; previousValue: unknown; newValue: unknown }[] | null {
  const prev = (previousData as Record<string, unknown> | null) ?? null
  const next = (newData as Record<string, unknown> | null) ?? null
  if (!prev && !next) return null
  const keys = Array.from(new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]))
  if (keys.length === 0) return null
  return keys.map((field) => ({
    field,
    label: FIELD_LABELS[field] ?? field,
    previousValue: prev ? prev[field] ?? null : null,
    newValue: next ? next[field] ?? null : null,
  }))
}

function normalizeForDiff(value: unknown): unknown {
  if (value instanceof Date) return toDateStr(value)
  return value ?? null
}

// Mapea cada campo "importante" (con valor de auditoría) del DTO de update
// a su columna real en la base. `observations` queda deliberadamente afuera:
// es texto libre editado con mucha frecuencia y de bajo valor de auditoría.
const IMPORTANT_FIELD_MAP: { dbKey: string; dtoKey: keyof UpdateFireExtinguisherDTO }[] = [
  { dbKey: 'type', dtoKey: 'type' },
  { dbKey: 'capacity', dtoKey: 'capacity' },
  { dbKey: 'expirationDate', dtoKey: 'expirationDate' },
  { dbKey: 'lastRechargeDate', dtoKey: 'chargeDate' },
  { dbKey: 'assetId', dtoKey: 'associatedAssetId' },
  { dbKey: 'locationType', dtoKey: 'associatedLocationType' },
  { dbKey: 'location', dtoKey: 'location' },
  { dbKey: 'internalNumber', dtoKey: 'internalNumber' },
  { dbKey: 'establishment', dtoKey: 'establishment' },
  { dbKey: 'brand', dtoKey: 'brand' },
  { dbKey: 'cylinderNumber', dtoKey: 'cylinderNumber' },
  { dbKey: 'manufacturingYear', dtoKey: 'manufacturingYear' },
]

function buildUpdateDiff(before: Record<string, unknown>, data: UpdateFireExtinguisherDTO) {
  const previousData: Record<string, unknown> = {}
  const newData: Record<string, unknown> = {}

  for (const { dbKey, dtoKey } of IMPORTANT_FIELD_MAP) {
    if (data[dtoKey] === undefined) continue
    const beforeValue = normalizeForDiff(before[dbKey])
    const afterValue = normalizeForDiff(data[dtoKey])
    if (beforeValue !== afterValue) {
      previousData[dbKey] = beforeValue
      newData[dbKey] = afterValue
    }
  }

  return { previousData, newData, hasChanges: Object.keys(newData).length > 0 }
}

// ── Error handling ──────────────────────────────────────────────────────────

function handleUniqueConstraint(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(',') : String(e.meta?.target ?? '')
    if (target.includes('internalNumber')) {
      throw new AppError(409, 'Ya existe un matafuego con ese número interno', 'DUPLICATE_INTERNAL_NUMBER')
    }
    if (target.includes('code')) {
      throw new AppError(409, 'Ya existe un matafuego con ese código', 'DUPLICATE_CODE')
    }
    throw new AppError(409, 'Registro duplicado', 'DUPLICATE')
  }
  throw e
}

// ── Response mappers ──────────────────────────────────────────────────────────

function mapFireExt(fe: Record<string, unknown>) {
  const manufacturingYear = (fe.manufacturingYear as number | null) ?? null
  return {
    id: fe.id,
    code: fe.code,
    internalNumber: fe.internalNumber ?? null,
    type: fe.type,
    capacity: fe.capacity,
    chargeDate: fe.lastRechargeDate ? toDateStr(fe.lastRechargeDate as Date | string) : null,
    expirationDate: toDateStr(fe.expirationDate as Date | string),
    associatedAssetId: fe.assetId ?? null,
    associatedLocationType: fe.locationType,
    location: fe.location ?? null,
    establishment: fe.establishment ?? null,
    status: computeFireExtinguisherStatus(fe.expirationDate as Date | string, manufacturingYear),
    chargeStatus: computeExpirationStatus(fe.expirationDate as Date | string),
    manufacturingLifeStatus: computeManufacturingLifeStatus(manufacturingYear),
    manufacturingYear,
    manufacturingExpirationYear: manufacturingExpirationYear(manufacturingYear),
    observations: fe.observations ?? '',
    brand: fe.brand ?? null,
    cylinderNumber: fe.cylinderNumber ?? null,
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
    description: (h.description as string) ?? null,
    changes: buildChanges(h.previousData, h.newData),
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

/**
 * Quita acentos y normaliza a minúsculas para poder buscar en PREFIX_MAP
 * sin depender de que el valor llegue con el mismo casing/acentuación
 * exacto que las claves del mapa. `associatedLocationType` llega tal cual
 * desde el catálogo `fire_ext_location_type` (p. ej. "Vehículo"), y las
 * claves del mapa son minúsculas sin acentos — sin esta normalización el
 * lookup nunca matchea y todo alta cae al prefijo genérico GEN.
 */
const DIACRITICS_REGEX = new RegExp('[\\u0300-\\u036f]', 'g')

function normalizeKey(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_REGEX, '').trim().toLowerCase()
}

// Función pura (sin acceso a Prisma), exportada para poder testear la
// resolución de prefijo de forma aislada — ver fire-extinguishers.code-generation.test.ts.
export function resolveCodePrefix(locationType: string): string {
  return PREFIX_MAP[normalizeKey(locationType)] ?? 'GEN'
}

async function generateCode(locationType: string): Promise<string> {
  const prefix = resolveCodePrefix(locationType)
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
    if (query.establishment) where.establishment = query.establishment
    if (query.unassigned) where.assetId = null
    else if (query.assetId) where.assetId = query.assetId
    if (query.status) Object.assign(where, buildFireExtinguisherStatusFilter(query.status))
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { internalNumber: { contains: query.search, mode: 'insensitive' } },
        { type: { contains: query.search, mode: 'insensitive' } },
        { observations: { contains: query.search, mode: 'insensitive' } },
        { cylinderNumber: { contains: query.search, mode: 'insensitive' } },
        { location: { contains: query.search, mode: 'insensitive' } },
        { brand: { contains: query.search, mode: 'insensitive' } },
        { establishment: { contains: query.search, mode: 'insensitive' } },
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

  async create(data: CreateFireExtinguisherDTO, performedBy?: string | null) {
    if (data.associatedAssetId) {
      const asset = await prisma.asset.findFirst({
        where: { id: data.associatedAssetId, isActive: true },
      })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    const code = await generateCode(data.associatedLocationType)

    const fe = await prisma
      .$transaction(async (tx) => {
        const created = await tx.fireExtinguisher.create({
          data: {
            code,
            internalNumber: data.internalNumber,
            type: data.type,
            capacity: data.capacity,
            expirationDate: data.expirationDate,
            lastRechargeDate: data.chargeDate ?? null,
            assetId: data.associatedAssetId ?? null,
            locationType: data.associatedLocationType,
            location: data.location ?? null,
            establishment: data.establishment,
            brand: data.brand ?? null,
            cylinderNumber: data.cylinderNumber,
            manufacturingYear: data.manufacturingYear,
            observations: data.observations ?? null,
          },
          include: { asset: { select: { id: true, name: true } } },
        })

        await recordHistoryEntry(tx, created.id, {
          action: 'Alta',
          description: 'Matafuego dado de alta',
          newData: {
            code: created.code,
            internalNumber: created.internalNumber,
            type: created.type,
            capacity: created.capacity,
            expirationDate: toDateStr(created.expirationDate),
            lastRechargeDate: created.lastRechargeDate ? toDateStr(created.lastRechargeDate) : null,
            assetId: created.assetId,
            locationType: created.locationType,
            location: created.location,
            establishment: created.establishment,
            brand: created.brand,
            cylinderNumber: created.cylinderNumber,
            manufacturingYear: created.manufacturingYear,
            observations: created.observations,
          },
          performedBy,
        })

        return created
      })
      .catch(handleUniqueConstraint)

    return mapFireExt(fe as unknown as Record<string, unknown>)
  },

  async update(id: string, data: UpdateFireExtinguisherDTO, performedBy?: string | null) {
    const before = await this.assertExists(id)

    if (data.associatedAssetId) {
      const asset = await prisma.asset.findFirst({
        where: { id: data.associatedAssetId, isActive: true },
      })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    const { previousData, newData, hasChanges } = buildUpdateDiff(before as unknown as Record<string, unknown>, data)

    const [fe] = await prisma
      .$transaction([
        prisma.fireExtinguisher.update({
          where: { id },
          data: {
            ...(data.type && { type: data.type }),
            ...(data.capacity && { capacity: data.capacity }),
            ...(data.expirationDate && { expirationDate: data.expirationDate }),
            ...(data.chargeDate !== undefined && { lastRechargeDate: data.chargeDate }),
            ...(data.associatedAssetId !== undefined && { assetId: data.associatedAssetId }),
            ...(data.associatedLocationType && { locationType: data.associatedLocationType }),
            ...(data.location !== undefined && { location: data.location }),
            ...(data.internalNumber !== undefined && { internalNumber: data.internalNumber }),
            ...(data.establishment !== undefined && { establishment: data.establishment }),
            ...(data.brand !== undefined && { brand: data.brand }),
            ...(data.cylinderNumber !== undefined && { cylinderNumber: data.cylinderNumber }),
            ...(data.manufacturingYear !== undefined && { manufacturingYear: data.manufacturingYear }),
            ...(data.observations !== undefined && { observations: data.observations }),
          },
          include: { asset: { select: { id: true, name: true } } },
        }),
        ...(hasChanges
          ? [
              recordHistoryEntry(prisma, id, {
                action: 'Actualización',
                description: 'Datos actualizados',
                previousData,
                newData,
                performedBy,
              }),
            ]
          : []),
      ])
      .catch(handleUniqueConstraint)

    return mapFireExt(fe as unknown as Record<string, unknown>)
  },

  async softDelete(id: string, performedBy?: string | null) {
    await this.assertExists(id)
    await prisma.$transaction([
      prisma.fireExtinguisher.update({ where: { id }, data: { isActive: false } }),
      recordHistoryEntry(prisma, id, {
        action: 'Baja',
        description: 'Matafuego dado de baja',
        previousData: { isActive: true },
        newData: { isActive: false },
        performedBy,
      }),
    ])
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

  // Recarga en bloque ATÓMICA — transacción interactiva (no array-form) porque cada
  // matafuego necesita su propio previousExpirationDate leído antes de escribir su
  // historial: son N pares de operaciones heterogéneas, no un updateMany homogéneo.
  // Si cualquier id no existe, la transacción entera hace rollback — ninguno de los
  // N matafuegos queda parcialmente recargado (a diferencia del Promise.all de N
  // llamados HTTP independientes que usaba el frontend antes de esta fase).
  async bulkRecharge(ids: string[], data: RechargeDTO) {
    const updated = await prisma.$transaction(async (tx) => {
      const results = []
      for (const id of ids) {
        const fe = await tx.fireExtinguisher.findUnique({ where: { id } })
        if (!fe) throw new AppError(404, `Matafuego ${id} no encontrado`, 'NOT_FOUND')

        const fe2 = await tx.fireExtinguisher.update({
          where: { id },
          data: {
            lastRechargeDate: data.chargeDate,
            expirationDate: data.expirationDate,
            isActive: true,
          },
        })
        await tx.fireExtinguisherHistory.create({
          data: {
            fireExtinguisherId: id,
            action: 'Recarga',
            date: data.chargeDate,
            performedBy: data.technician ?? null,
            notes: data.observations ?? null,
            previousExpirationDate: fe.expirationDate,
            nextDueDate: data.expirationDate,
          },
        })
        results.push(fe2)
      }
      return results
    })

    return updated.map((fe) => mapFireExt(fe as unknown as Record<string, unknown>))
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
    const fe = await prisma.fireExtinguisher.findUnique({ where: { id } })
    if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')
    return fe
  },
}
