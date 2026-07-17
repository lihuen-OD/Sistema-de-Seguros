import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { detectFileType, formatFileSize, sanitizeFileName } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import { todayDate, currentYearMonth, toDateStr } from '../../shared/utils/dates'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import type {
  CreateFireExtinguisherAuditDTO,
  AddFireExtinguisherAuditAttachmentDTO,
  ReviewFireExtinguisherAuditDTO,
  ListFireExtinguisherAuditsQueryDTO,
} from './fire-extinguisher-audits.schemas'

const MAX_ATTACHMENTS_PER_AUDIT = 10

// Chequeo de mimetype MÁS ESTRICTO que el `isAllowedMimetype` compartido — son
// fotos de inspección, no documentos. No se toca el helper compartido.
const ALLOWED_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

function isAllowedPhotoMimetype(mimetype: string): boolean {
  return ALLOWED_PHOTO_MIMETYPES.has(mimetype)
}

// Manejo local de la constraint única (fireExtinguisherId, auditPeriod) — no
// reutiliza el handleUniqueConstraint de fire-extinguishers.service.ts, que es
// privado del módulo y valida columnas distintas.
function handleDuplicateAudit(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(',') : String(e.meta?.target ?? '')
    if (target.includes('auditPeriod')) {
      throw new AppError(409, 'Ya existe una auditoría para este matafuego en el período actual', 'DUPLICATE_AUDIT_PERIOD')
    }
    throw new AppError(409, 'Registro duplicado', 'DUPLICATE')
  }
  throw e
}

function normalizeMasterValue(field: string, value: unknown): string {
  if (value == null) return ''
  if (field === 'expirationDate') return toDateStr(value as Date | string)
  return String(value)
}

function mapProposedChange(pc: Record<string, unknown>) {
  return {
    id: pc.id,
    fieldName: pc.fieldName,
    currentValue: pc.currentValue,
    proposedValue: pc.proposedValue,
    reason: pc.reason ?? null,
    status: pc.status,
  }
}

function mapAttachment(a: Record<string, unknown>) {
  return {
    id: a.id,
    fireExtinguisherId: a.fireExtinguisherId,
    auditId: a.auditId ?? null,
    name: a.name,
    fileType: a.fileType,
    fileSize: a.fileSize,
    fileUrl: a.fileUrl,
    uploadedAt: a.uploadedAt,
    uploadedBy: a.uploadedBy,
  }
}

function mapAudit(audit: Record<string, unknown>) {
  return {
    id: audit.id,
    fireExtinguisherId: audit.fireExtinguisherId,
    status: audit.status,
    auditDate: toDateStr(audit.auditDate as Date | string),
    auditPeriod: audit.auditPeriod,
    auditedBy: audit.auditedBy,
    locationConfirmed: audit.locationConfirmed,
    locationChangeRequested: audit.locationChangeRequested,
    proposedLocation: audit.proposedLocation ?? null,
    locationChangeReason: audit.locationChangeReason ?? null,
    checklist: {
      cleanliness: audit.cleanliness,
      chargeFillStatus: audit.chargeFillStatus,
      beaconPlateCondition: audit.beaconPlateCondition,
      sealStatus: audit.sealStatus,
      ringStatus: audit.ringStatus,
      hoseNozzleCondition: audit.hoseNozzleCondition,
      chargeExpirationDateObserved: audit.chargeExpirationDateObserved
        ? toDateStr(audit.chargeExpirationDateObserved as Date | string)
        : null,
      comments: audit.comments ?? null,
    },
    proposedChanges: Array.isArray(audit.proposedChanges)
      ? (audit.proposedChanges as Record<string, unknown>[]).map(mapProposedChange)
      : [],
    attachments: Array.isArray(audit.attachments) ? (audit.attachments as Record<string, unknown>[]).map(mapAttachment) : [],
    reviewedBy: audit.reviewedBy ?? null,
    reviewedAt: audit.reviewedAt ?? null,
    reviewNotes: audit.reviewNotes ?? null,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  }
}

function mapAuditListItem(row: Record<string, unknown>) {
  const fe = row.extinguisher as Record<string, unknown> | null | undefined
  const count = row._count as Record<string, unknown> | undefined
  return {
    id: row.id,
    status: row.status,
    auditDate: toDateStr(row.auditDate as Date | string),
    auditPeriod: row.auditPeriod,
    auditedBy: row.auditedBy,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewNotes: row.reviewNotes ?? null,
    proposedChangesCount: (count?.proposedChanges as number | undefined) ?? 0,
    extinguisher: fe
      ? {
          id: fe.id,
          code: fe.code,
          cylinderNumber: fe.cylinderNumber ?? null,
          type: fe.type,
          establishment: fe.establishment ?? null,
          associatedLocationType: fe.locationType,
          location: fe.location ?? null,
        }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// Exige que `decisions` cubra EXACTAMENTE los proposedChanges PENDING de la
// auditoría — sin faltantes, sin duplicados, sin IDs ajenos.
function assertDecisionsCoverPending(
  pendingIds: string[],
  decisions: { proposedChangeId: string; decision: string }[],
): void {
  const decisionIds = decisions.map((d) => d.proposedChangeId)
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new AppError(422, 'decisions contiene proposedChangeId duplicados', 'DUPLICATE_DECISION')
  }

  const decisionSet = new Set(decisionIds)
  const pendingSet = new Set(pendingIds)
  const missing = pendingIds.filter((id) => !decisionSet.has(id))
  const extra = decisionIds.filter((id) => !pendingSet.has(id))

  if (missing.length > 0 || extra.length > 0) {
    throw new AppError(
      422,
      'decisions debe cubrir exactamente los cambios propuestos pendientes de esta auditoría, sin faltantes ni IDs ajenos',
      'DECISIONS_MISMATCH',
    )
  }
}

export const fireExtinguisherAuditsService = {
  async create(data: CreateFireExtinguisherAuditDTO, performedBy: string) {
    const fe = await prisma.fireExtinguisher.findUnique({ where: { id: data.fireExtinguisherId } })
    if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')
    if (!fe.isActive) throw new AppError(400, 'El matafuego está dado de baja', 'INACTIVE_FIRE_EXTINGUISHER')

    const auditDate = todayDate()
    const auditPeriod = currentYearMonth()

    type ChangeRow = { fireExtinguisherId: string; fieldName: string; currentValue: string; proposedValue: string; reason: string | null }
    const changes: ChangeRow[] = []

    for (const review of data.masterDataReview) {
      if (review.action === 'MODIFICAR') {
        changes.push({
          fireExtinguisherId: fe.id,
          fieldName: review.field,
          currentValue: normalizeMasterValue(review.field, (fe as unknown as Record<string, unknown>)[review.field]),
          proposedValue: review.newValue,
          reason: review.reason ?? null,
        })
      }
    }

    const locationChangeRequested = data.locationReview.action === 'MODIFICAR'
    if (data.locationReview.action === 'MODIFICAR') {
      changes.push({
        fireExtinguisherId: fe.id,
        fieldName: 'location',
        currentValue: fe.location ?? '',
        proposedValue: data.locationReview.proposedLocation,
        reason: data.locationReview.reason ?? null,
      })
    }

    const auditId = await prisma
      .$transaction(async (tx) => {
        const created = await tx.fireExtinguisherAudit.create({
          data: {
            fireExtinguisherId: fe.id,
            auditDate,
            auditPeriod,
            auditedBy: performedBy,
            locationConfirmed: data.locationReview.action === 'OK',
            locationChangeRequested,
            proposedLocation: data.locationReview.action === 'MODIFICAR' ? data.locationReview.proposedLocation : null,
            locationChangeReason: data.locationReview.action === 'MODIFICAR' ? data.locationReview.reason ?? null : null,
            cleanliness: data.checklist.cleanliness,
            chargeFillStatus: data.checklist.chargeFillStatus,
            beaconPlateCondition: data.checklist.beaconPlateCondition,
            sealStatus: data.checklist.sealStatus,
            ringStatus: data.checklist.ringStatus,
            hoseNozzleCondition: data.checklist.hoseNozzleCondition,
            chargeExpirationDateObserved: data.checklist.chargeExpirationDateObserved,
            comments: data.checklist.comments ?? null,
          },
        })

        await Promise.all(
          changes.map((c) =>
            tx.fireExtinguisherAuditProposedChange.create({
              data: { ...c, auditId: created.id },
            }),
          ),
        )

        return created.id
      })
      .catch(handleDuplicateAudit)

    // La transacción solo ejecuta writes. La lectura con include se hace fuera
    // para no agotar el timeout de 5s de la transacción interactiva (mismo
    // patrón que assets.service.ts's create()).
    const audit = await prisma.fireExtinguisherAudit.findUniqueOrThrow({
      where: { id: auditId },
      include: { proposedChanges: true, attachments: true },
    })

    return mapAudit(audit as unknown as Record<string, unknown>)
  },

  async findById(id: string) {
    const audit = await prisma.fireExtinguisherAudit.findUnique({
      where: { id },
      include: { proposedChanges: true, attachments: true },
    })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    return mapAudit(audit as unknown as Record<string, unknown>)
  },

  async addAttachment(
    auditId: string,
    file: Express.Multer.File,
    meta: AddFireExtinguisherAuditAttachmentDTO,
    uploadedBy: string,
  ) {
    const audit = await prisma.fireExtinguisherAudit.findUnique({ where: { id: auditId } })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')

    const count = await prisma.fireExtinguisherAttachment.count({ where: { auditId } })
    if (count >= MAX_ATTACHMENTS_PER_AUDIT) {
      throw new AppError(400, `No se pueden adjuntar más de ${MAX_ATTACHMENTS_PER_AUDIT} fotos por auditoría`, 'MAX_ATTACHMENTS_EXCEEDED')
    }

    if (!isAllowedPhotoMimetype(file.mimetype)) {
      throw new AppError(415, 'Tipo de archivo no permitido. Solo se aceptan fotos (JPG, PNG, WebP)', 'UNSUPPORTED_MEDIA_TYPE')
    }

    let fileUrl = `local://${file.originalname}`
    let cloudinaryPublicId: string | null = null

    if (isCloudinaryConfigured()) {
      const result = await uploadToCloudinary(file.buffer, 'fire-extinguisher-audits', file.mimetype)
      fileUrl = result.secure_url
      cloudinaryPublicId = result.public_id
    }

    try {
      const attachment = await prisma.fireExtinguisherAttachment.create({
        data: {
          fireExtinguisherId: audit.fireExtinguisherId,
          auditId,
          name: sanitizeFileName(file.originalname),
          description: meta.description ?? null,
          fileType: detectFileType(file.mimetype),
          fileSize: formatFileSize(file.size),
          fileUrl,
          cloudinaryPublicId,
          uploadedBy,
        },
      })
      return mapAttachment(attachment as unknown as Record<string, unknown>)
    } catch (err) {
      if (cloudinaryPublicId) await deleteFromCloudinary(cloudinaryPublicId).catch(() => undefined)
      throw err
    }
  },

  async findAll(query: ListFireExtinguisherAuditsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Prisma.FireExtinguisherAuditWhereInput = {}
    if (query.status && query.status.length > 0) where.status = { in: query.status }

    const [rows, total] = await Promise.all([
      prisma.fireExtinguisherAudit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          extinguisher: {
            select: {
              id: true,
              code: true,
              cylinderNumber: true,
              type: true,
              establishment: true,
              locationType: true,
              location: true,
            },
          },
          _count: { select: { proposedChanges: true } },
        },
      }),
      prisma.fireExtinguisherAudit.count({ where }),
    ])

    return buildPaginatedResponse(
      rows.map((r) => mapAuditListItem(r as unknown as Record<string, unknown>)),
      total,
      { page, limit },
    )
  },

  // Cobertura de auditoría: todos los matafuegos activos, marcados con la
  // auditoría más reciente (si existe) que tengan en el período dado, sin
  // contar las rechazadas — mismo criterio que `auditedThisPeriod` en
  // fire-extinguishers-dashboard.service.ts.
  async getCoverage(period: string) {
    const [extinguishers, audits] = await Promise.all([
      prisma.fireExtinguisher.findMany({
        where: { isActive: true },
        select: {
          id: true,
          code: true,
          cylinderNumber: true,
          type: true,
          establishment: true,
          locationType: true,
          location: true,
        },
        orderBy: [{ establishment: 'asc' }, { code: 'asc' }],
      }),
      prisma.fireExtinguisherAudit.findMany({
        where: { auditPeriod: period, status: { not: 'REJECTED' } },
        select: { fireExtinguisherId: true, status: true, auditDate: true },
        orderBy: { auditDate: 'desc' },
      }),
    ])

    const latestAuditByExtinguisher = new Map<string, { status: string; auditDate: Date }>()
    for (const a of audits) {
      if (!latestAuditByExtinguisher.has(a.fireExtinguisherId)) {
        latestAuditByExtinguisher.set(a.fireExtinguisherId, { status: a.status, auditDate: a.auditDate })
      }
    }

    return extinguishers.map((fe) => {
      const audit = latestAuditByExtinguisher.get(fe.id)
      return {
        id: fe.id,
        code: fe.code,
        cylinderNumber: fe.cylinderNumber ?? null,
        type: fe.type,
        establishment: fe.establishment ?? null,
        associatedLocationType: fe.locationType,
        location: fe.location ?? null,
        audited: audit !== undefined,
        auditStatus: audit?.status ?? null,
        auditDate: audit ? toDateStr(audit.auditDate) : null,
      }
    })
  },

  async review(id: string, data: ReviewFireExtinguisherAuditDTO, reviewedBy: string) {
    const audit = await prisma.fireExtinguisherAudit.findUnique({
      where: { id },
      include: { proposedChanges: true },
    })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (audit.status !== 'SUBMITTED') {
      throw new AppError(409, 'Esta auditoría ya fue revisada', 'ALREADY_REVIEWED')
    }

    const pending = audit.proposedChanges.filter((pc) => pc.status === 'PENDING')
    const reviewedAt = new Date()

    if (data.auditDecision === 'APPROVED') {
      assertDecisionsCoverPending(pending.map((pc) => pc.id), data.decisions)

      const decisionById = new Map(data.decisions.map((d) => [d.proposedChangeId, d.decision]))
      const approved = pending.filter((pc) => decisionById.get(pc.id) === 'APPROVED')
      const rejected = pending.filter((pc) => decisionById.get(pc.id) === 'REJECTED')

      const previousData: Record<string, unknown> = {}
      const newData: Record<string, unknown> = {}
      const masterUpdateData: Record<string, unknown> = {}

      if (approved.length > 0) {
        // Se lee el valor VIVO del maestro (no el currentValue congelado al
        // crear la auditoría) para que el diff de historial refleje el estado
        // real si el maestro cambió por otra vía entre el submit y la revisión.
        const fe = await prisma.fireExtinguisher.findUnique({ where: { id: audit.fireExtinguisherId } })
        if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')

        for (const pc of approved) {
          previousData[pc.fieldName] = normalizeMasterValue(pc.fieldName, (fe as unknown as Record<string, unknown>)[pc.fieldName])
          newData[pc.fieldName] = pc.proposedValue
          masterUpdateData[pc.fieldName] =
            pc.fieldName === 'expirationDate' ? new Date(pc.proposedValue + 'T00:00:00.000Z') : pc.proposedValue
        }
      }

      await prisma.$transaction([
        ...(approved.length > 0
          ? [
              prisma.fireExtinguisher.update({ where: { id: audit.fireExtinguisherId }, data: masterUpdateData }),
              prisma.fireExtinguisherHistory.create({
                data: {
                  fireExtinguisherId: audit.fireExtinguisherId,
                  action: 'Auditoría',
                  date: todayDate(),
                  performedBy: reviewedBy,
                  description: `Cambios aplicados por revisión de auditoría del período ${audit.auditPeriod}`,
                  previousData: previousData as Prisma.InputJsonValue,
                  newData: newData as Prisma.InputJsonValue,
                },
              }),
              prisma.fireExtinguisherAuditProposedChange.updateMany({
                where: { id: { in: approved.map((c) => c.id) } },
                data: { status: 'APPLIED' },
              }),
            ]
          : []),
        ...(rejected.length > 0
          ? [
              prisma.fireExtinguisherAuditProposedChange.updateMany({
                where: { id: { in: rejected.map((c) => c.id) } },
                data: { status: 'REJECTED' },
              }),
            ]
          : []),
        prisma.fireExtinguisherAudit.update({
          where: { id },
          data: { status: 'APPROVED', reviewedBy, reviewedAt, reviewNotes: data.reviewNotes ?? null },
        }),
      ])
    } else {
      // REJECTED | NEEDS_CORRECTION: nada se aplica al maestro sin importar lo
      // que digan las decisiones individuales — todos los PENDING pasan a REJECTED.
      await prisma.$transaction([
        ...(pending.length > 0
          ? [
              prisma.fireExtinguisherAuditProposedChange.updateMany({
                where: { id: { in: pending.map((c) => c.id) } },
                data: { status: 'REJECTED' },
              }),
            ]
          : []),
        prisma.fireExtinguisherAudit.update({
          where: { id },
          data: { status: data.auditDecision, reviewedBy, reviewedAt, reviewNotes: data.reviewNotes ?? null },
        }),
      ])
    }

    // Lectura final fuera de la transacción, mismo criterio que create().
    return this.findById(id)
  },
}
