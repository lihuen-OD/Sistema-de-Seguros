import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { currentYearMonth, toDateStr } from '../../shared/utils/dates'
import { isInScope, type AuditScopeContext } from '../../shared/services/audit-scope.service'
import { classifyAssetType } from '../fire-extinguishers/asset-type-classification'
import { createFireExtinguisherWithClient } from '../fire-extinguishers/fire-extinguishers.service'
import type {
  CreateFireExtinguisherCreationRequestDTO,
  ListFireExtinguisherCreationRequestsQueryDTO,
  ReviewFireExtinguisherCreationRequestDTO,
} from './fire-extinguisher-audits.schemas'

type DbClient = typeof prisma | Prisma.TransactionClient

export function normalizeCylinderNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, '')
}

async function lockCylinder(tx: Prisma.TransactionClient, normalized: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${normalized}, 0))`
}

async function assertNoInventoryDuplicate(client: DbClient, normalized: string): Promise<void> {
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "fire_extinguishers"
    WHERE "cylinderNumber" IS NOT NULL
      AND regexp_replace(upper(trim("cylinderNumber")), '[[:space:]-]+', '', 'g') = ${normalized}
    LIMIT 1
  `
  if (rows.length > 0) {
    throw new AppError(409, 'Ya existe un matafuego con ese número de cilindro', 'DUPLICATE_CYLINDER')
  }
}

async function assertCurrentReferences(
  client: DbClient,
  data: CreateFireExtinguisherCreationRequestDTO,
): Promise<{ code: string | null; name: string; assetType: string } | null> {
  const requiredCatalogs = [
    ['fire_ext_type', data.type],
    ['fire_ext_capacity', data.capacity],
    ['fire_ext_location_type', data.associatedLocationType],
    ['fire_ext_establishment', data.establishment],
  ] as const
  const valid = await client.catalogItem.findMany({
    where: {
      isActive: true,
      OR: requiredCatalogs.map(([category, label]) => ({ category, label })),
    },
    select: { category: true, label: true },
  })
  const validKeys = new Set(valid.map((item) => `${item.category}:${item.label}`))
  const missing = requiredCatalogs.find(([category, label]) => !validKeys.has(`${category}:${label}`))
  if (missing) throw new AppError(409, 'Un dato de catálogo dejó de estar disponible; revisá la solicitud', 'STALE_REFERENCE')

  if (data.associatedAssetId) {
    const asset = await client.asset.findFirst({
      where: { id: data.associatedAssetId, isActive: true, status: 'activo' },
      select: { code: true, name: true, assetType: true },
    })
    if (!asset) throw new AppError(409, 'El activo asociado dejó de estar disponible', 'STALE_REFERENCE')
    if (classifyAssetType(asset.assetType) !== null) {
      throw new AppError(409, 'El activo pertenece a la auditoría de rodados y no a la cobertura por establecimiento', 'INVALID_POPULATION')
    }
    return asset
  }
  return null
}

async function assertRequesterStillAuthorized(
  tx: Prisma.TransactionClient,
  requestedBy: string,
  establishment: string,
): Promise<void> {
  const user = await tx.user.findUnique({
    where: { email: requestedBy },
    select: { id: true, role: true, isActive: true, accessProfile: { select: { modules: true } } },
  })
  if (!user?.isActive) throw new AppError(409, 'El solicitante ya no es un usuario activo', 'STALE_REQUESTER')
  if (user.role === 'ADMIN') return
  if (!user.accessProfile?.modules.includes('fire_extinguisher_audit_coverage')) {
    throw new AppError(409, 'El solicitante ya no tiene permiso para auditar matafuegos', 'STALE_REQUESTER_PERMISSION')
  }
  const scope = await tx.userAuditScope.findFirst({
    where: { userId: user.id, area: 'FIRE_EXTINGUISHER_AUDIT', scopeValue: establishment },
    select: { id: true },
  })
  if (!scope) throw new AppError(409, 'El establecimiento ya no está dentro del alcance del solicitante', 'STALE_REQUESTER_SCOPE')
}

function requestToCreateInput(request: Record<string, unknown>): CreateFireExtinguisherCreationRequestDTO {
  return {
    type: request.type as string,
    capacity: request.capacity as string,
    expirationDate: (request.expirationDate as Date | null) ?? null,
    chargeDate: (request.chargeDate as Date | null) ?? null,
    hydraulicTestExpirationDate: (request.hydraulicTestExpirationDate as Date | null) ?? null,
    associatedAssetId: (request.associatedAssetId as string | null) ?? null,
    associatedLocationType: request.associatedLocationType as string,
    location: (request.location as string | null) ?? null,
    establishment: request.establishment as string,
    brand: (request.brand as string | null) ?? null,
    cylinderNumber: request.cylinderNumber as string,
    iramCertificateNumber: (request.iramCertificateNumber as string | null) ?? null,
    manufacturingYear: request.manufacturingYear as number,
    observations: (request.observations as string | null) ?? null,
  }
}

function mapRequest(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    expirationDate: row.expirationDate ? toDateStr(row.expirationDate as Date) : null,
    chargeDate: row.chargeDate ? toDateStr(row.chargeDate as Date) : null,
    hydraulicTestExpirationDate: row.hydraulicTestExpirationDate ? toDateStr(row.hydraulicTestExpirationDate as Date) : null,
  }
}

function handleRequestConflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError(409, 'Ya existe una solicitud pendiente para ese número de cilindro', 'DUPLICATE_PENDING_REQUEST')
  }
  throw error
}

export const fireExtinguisherCreationRequestsService = {
  async create(data: CreateFireExtinguisherCreationRequestDTO, requestedBy: string, scope: AuditScopeContext) {
    if (data.associatedAssetId) {
      throw new AppError(
        400,
        'Las solicitudes desde Auditoría de Matafuegos corresponden a establecimientos y no admiten un activo asociado',
        'ASSET_NOT_ALLOWED_FOR_ESTABLISHMENT_REQUEST',
      )
    }
    if (!isInScope(scope, data.establishment)) {
      throw new AppError(404, 'Establecimiento no encontrado', 'NOT_FOUND')
    }
    const normalized = normalizeCylinderNumber(data.cylinderNumber)
    const created = await prisma.$transaction(async (tx) => {
      await lockCylinder(tx, normalized)
      const associatedAsset = await assertCurrentReferences(tx, data)
      await assertNoInventoryDuplicate(tx, normalized)
      return tx.fireExtinguisherCreationRequest.create({
        data: {
          status: 'PENDING',
          auditPeriod: currentYearMonth(),
          type: data.type,
          capacity: data.capacity,
          expirationDate: data.expirationDate,
          chargeDate: data.chargeDate,
          hydraulicTestExpirationDate: data.hydraulicTestExpirationDate,
          associatedAssetId: data.associatedAssetId ?? null,
          associatedAssetCode: associatedAsset?.code ?? null,
          associatedAssetName: associatedAsset?.name ?? null,
          associatedAssetType: associatedAsset?.assetType ?? null,
          associatedLocationType: data.associatedLocationType,
          location: data.location ?? null,
          establishment: data.establishment,
          brand: data.brand ?? null,
          cylinderNumber: data.cylinderNumber,
          cylinderNumberNormalized: normalized,
          iramCertificateNumber: data.iramCertificateNumber ?? null,
          manufacturingYear: data.manufacturingYear,
          observations: data.observations ?? null,
          requestedBy,
        },
      })
    }).catch(handleRequestConflict)
    return mapRequest(created as unknown as Record<string, unknown>)
  },

  async list(query: ListFireExtinguisherCreationRequestsQueryDTO, requester: string, canReview: boolean) {
    const rows = await prisma.fireExtinguisherCreationRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(canReview ? {} : { requestedBy: requester }),
      },
      include: {
        associatedAsset: { select: { id: true, code: true, name: true, assetType: true } },
        createdFireExtinguisher: { select: { id: true, code: true } },
      },
      orderBy: { requestedAt: 'desc' },
    })
    return rows.map((row) => mapRequest(row as unknown as Record<string, unknown>))
  },

  async findById(id: string, requester: string, canReview: boolean) {
    const row = await prisma.fireExtinguisherCreationRequest.findFirst({
      where: { id, ...(canReview ? {} : { requestedBy: requester }) },
      include: {
        associatedAsset: { select: { id: true, code: true, name: true, assetType: true } },
        createdFireExtinguisher: { select: { id: true, code: true } },
      },
    })
    if (!row) throw new AppError(404, 'Solicitud no encontrada', 'NOT_FOUND')
    return mapRequest(row as unknown as Record<string, unknown>)
  },

  async review(id: string, data: ReviewFireExtinguisherCreationRequestDTO, reviewedBy: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "fire_extinguisher_creation_requests" WHERE "id" = ${id} FOR UPDATE`
      const request = await tx.fireExtinguisherCreationRequest.findUnique({ where: { id } })
      if (!request) throw new AppError(404, 'Solicitud no encontrada', 'NOT_FOUND')
      if (request.status !== 'PENDING') throw new AppError(409, 'La solicitud ya fue resuelta', 'REQUEST_ALREADY_REVIEWED')
      if (request.requestedBy.toLowerCase() === reviewedBy.toLowerCase()) {
        throw new AppError(403, 'No podés aprobar ni rechazar tu propia solicitud', 'SELF_REVIEW_FORBIDDEN')
      }

      if (data.decision === 'REJECT') {
        const rejected = await tx.fireExtinguisherCreationRequest.update({
          where: { id },
          data: { status: 'REJECTED', reviewedBy, reviewedAt: new Date(), rejectionReason: data.reason },
        })
        return mapRequest(rejected as unknown as Record<string, unknown>)
      }

      await lockCylinder(tx, request.cylinderNumberNormalized)
      const createInput = requestToCreateInput(request as unknown as Record<string, unknown>)
      if (createInput.associatedAssetId) {
        throw new AppError(
          409,
          'La solicitud contiene un activo asociado que no corresponde a la auditoría por establecimiento',
          'INVALID_REQUEST_POPULATION',
        )
      }
      await assertRequesterStillAuthorized(tx, request.requestedBy, request.establishment)
      await assertCurrentReferences(tx, createInput)
      await assertNoInventoryDuplicate(tx, request.cylinderNumberNormalized)
      const extinguisher = await createFireExtinguisherWithClient(tx, createInput, reviewedBy)
      const approved = await tx.fireExtinguisherCreationRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          reviewedBy,
          reviewedAt: new Date(),
          createdFireExtinguisherId: extinguisher.id,
        },
      })
      return mapRequest(approved as unknown as Record<string, unknown>)
    }).catch(handleRequestConflict)
  },
}
