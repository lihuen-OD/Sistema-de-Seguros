import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { detectFileType, formatFileSize, matchesDeclaredMimetype, sanitizeFileName } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import { todayDate, currentYearMonth, toDateStr } from '../../shared/utils/dates'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { isInScope, type AuditScopeContext } from '../../shared/services/audit-scope.service'
import { matchesAuditPopulation, auditScopeKeyFor, type FireExtAuditPopulation } from './fire-extinguisher-audits.population'
import type {
  CreateFireExtinguisherAuditDTO,
  UpdateFireExtinguisherAuditDTO,
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
      mountingCondition: audit.mountingCondition,
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
  const asset = fe?.asset as Record<string, unknown> | null | undefined
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
          asset: asset ? { id: asset.id, code: asset.code, name: asset.name, assetType: asset.assetType } : null,
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

// FireExtinguisherAudit sirve a dos poblaciones (ver
// fire-extinguisher-audits.population.ts): matafuegos de edificio
// (ESTABLISHMENT, "Auditoría de Matafuegos") y matafuegos montados en un
// vehículo/maquinaria (ASSET, "Auditoría de Activos"). Es la MISMA tabla y el
// MISMO motor para las dos — solo cambia qué subconjunto de matafuegos es
// elegible y contra qué dimensión de alcance se compara. `population` queda
// fijo por instancia (ver las dos exportaciones al final del archivo); los
// controllers de cada módulo llaman siempre a su propia instancia, nunca
// pasan `population` por request.
function buildFireExtinguisherAuditsService(population: FireExtAuditPopulation) {
  function throwWrongPopulationError(): never {
    throw population === 'ESTABLISHMENT'
      ? new AppError(
          400,
          'Este matafuego corresponde a un vehículo o maquinaria y no forma parte de la auditoría de matafuegos',
          'ASSET_EXCLUDED_FROM_FIRE_EXTINGUISHER_AUDIT',
        )
      : new AppError(
          400,
          'Este matafuego no está vinculado a un vehículo o maquinaria y no forma parte de la auditoría de activos',
          'FIRE_EXTINGUISHER_NOT_ASSET_LINKED',
        )
  }

  return {
    async create(data: CreateFireExtinguisherAuditDTO, performedBy: string, scope: AuditScopeContext) {
      const fe = await prisma.fireExtinguisher.findUnique({
        where: { id: data.fireExtinguisherId },
        include: { asset: { select: { assetType: true, auditable: true } } },
      })
      if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')
      // Fuera del alcance asignado = mismo 404 que "no existe" — no debe
      // filtrarse que el matafuego existe en otro establecimiento/categoría.
      if (!isInScope(scope, auditScopeKeyFor(fe, population))) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')
      if (!fe.isActive) throw new AppError(400, 'El matafuego está dado de baja', 'INACTIVE_FIRE_EXTINGUISHER')
      // Un matafuego de la población equivocada (edificio vs vehículo/maquinaria)
      // no forma parte de esta auditoría — ver AuditStep1Selection/getCoverage,
      // que ya no lo ofrecen; este chequeo es la defensa de último recurso si
      // alguien llega igual por la API.
      if (!matchesAuditPopulation(fe, population)) throwWrongPopulationError()

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
              mountingCondition: data.checklist.mountingCondition,
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

    // Edita una auditoría propia mientras está SUBMITTED — mismo cálculo de
    // cambios propuestos que create(), pero reemplazando los proposedChanges
    // existentes en vez de crear una auditoría nueva. Seguro porque, mientras
    // status === 'SUBMITTED', ningún proposedChange fue decidido todavía (recién
    // se deciden en review(), que es lo único que saca a la auditoría de
    // SUBMITTED) — no hay decisiones previas que este reemplazo pueda pisar.
    async update(id: string, data: UpdateFireExtinguisherAuditDTO, scope: AuditScopeContext) {
      const audit = await prisma.fireExtinguisherAudit.findUnique({ where: { id } })
      if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      if (audit.status !== 'SUBMITTED') {
        throw new AppError(409, 'Solo se puede editar una auditoría pendiente de revisión', 'AUDIT_NOT_EDITABLE')
      }

      const fe = await prisma.fireExtinguisher.findUnique({
        where: { id: audit.fireExtinguisherId },
        include: { asset: { select: { assetType: true, auditable: true } } },
      })
      if (!fe) throw new AppError(404, 'Matafuego no encontrado', 'NOT_FOUND')
      if (!matchesAuditPopulation(fe, population)) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      if (!isInScope(scope, auditScopeKeyFor(fe, population))) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')

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

      await prisma.$transaction(async (tx) => {
        await tx.fireExtinguisherAuditProposedChange.deleteMany({ where: { auditId: id } })

        await tx.fireExtinguisherAudit.update({
          where: { id },
          data: {
            locationConfirmed: data.locationReview.action === 'OK',
            locationChangeRequested,
            proposedLocation: data.locationReview.action === 'MODIFICAR' ? data.locationReview.proposedLocation : null,
            locationChangeReason: data.locationReview.action === 'MODIFICAR' ? data.locationReview.reason ?? null : null,
            cleanliness: data.checklist.cleanliness,
            chargeFillStatus: data.checklist.chargeFillStatus,
            mountingCondition: data.checklist.mountingCondition,
            sealStatus: data.checklist.sealStatus,
            ringStatus: data.checklist.ringStatus,
            hoseNozzleCondition: data.checklist.hoseNozzleCondition,
            chargeExpirationDateObserved: data.checklist.chargeExpirationDateObserved,
            comments: data.checklist.comments ?? null,
          },
        })

        if (changes.length > 0) {
          await Promise.all(changes.map((c) => tx.fireExtinguisherAuditProposedChange.create({ data: { ...c, auditId: id } })))
        }
      })

      return this.findById(id)
    },

    // `scope` es opcional: los callers internos (update/review, que ya validaron
    // autorización por su cuenta más arriba) llaman sin scope para no
    // re-filtrar; solo el controller de GET /:id pasa el scope del request.
    // El chequeo de POBLACIÓN, en cambio, se aplica siempre que `scope` está
    // presente, incluso para ADMIN/revisor sin restricción — es un límite
    // estructural entre las dos colas (Matafuegos/Activos), no una restricción
    // de scope por usuario.
    async findById(id: string, scope?: AuditScopeContext) {
      const audit = await prisma.fireExtinguisherAudit.findUnique({
        where: { id },
        include: {
          proposedChanges: true,
          attachments: true,
          extinguisher: { select: { establishment: true, assetId: true, asset: { select: { assetType: true, auditable: true } } } },
        },
      })
      if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      if (scope) {
        if (!audit.extinguisher || !matchesAuditPopulation(audit.extinguisher, population)) {
          throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
        }
        if (!isInScope(scope, auditScopeKeyFor(audit.extinguisher, population))) {
          throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
        }
      }
      return mapAudit(audit as unknown as Record<string, unknown>)
    },

    async addAttachment(
      auditId: string,
      file: Express.Multer.File,
      meta: AddFireExtinguisherAuditAttachmentDTO,
      uploadedBy: string,
      scope: AuditScopeContext,
    ) {
      const audit = await prisma.fireExtinguisherAudit.findUnique({
        where: { id: auditId },
        include: { extinguisher: { select: { establishment: true, assetId: true, asset: { select: { assetType: true, auditable: true } } } } },
      })
      if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      if (!audit.extinguisher || !matchesAuditPopulation(audit.extinguisher, population)) {
        throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      }
      if (!isInScope(scope, auditScopeKeyFor(audit.extinguisher, population))) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')

      const count = await prisma.fireExtinguisherAttachment.count({ where: { auditId } })
      if (count >= MAX_ATTACHMENTS_PER_AUDIT) {
        throw new AppError(400, `No se pueden adjuntar más de ${MAX_ATTACHMENTS_PER_AUDIT} fotos por auditoría`, 'MAX_ATTACHMENTS_EXCEEDED')
      }

      if (!isAllowedPhotoMimetype(file.mimetype)) {
        throw new AppError(415, 'Tipo de archivo no permitido. Solo se aceptan fotos (JPG, PNG, WebP)', 'UNSUPPORTED_MEDIA_TYPE')
      }

      if (!matchesDeclaredMimetype(file.buffer, file.mimetype)) {
        throw new AppError(415, 'El contenido del archivo no coincide con su tipo declarado', 'FILE_TYPE_MISMATCH')
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

    async deleteAttachment(auditId: string, attachmentId: string, scope: AuditScopeContext) {
      const attachment = await prisma.fireExtinguisherAttachment.findFirst({
        where: { id: attachmentId, auditId },
        include: { extinguisher: { select: { establishment: true, assetId: true, asset: { select: { assetType: true, auditable: true } } } } },
      })
      if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
      if (!attachment.extinguisher || !matchesAuditPopulation(attachment.extinguisher, population)) {
        throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
      }
      if (!isInScope(scope, auditScopeKeyFor(attachment.extinguisher, population))) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
      if (attachment.cloudinaryPublicId) {
        await deleteFromCloudinary(attachment.cloudinaryPublicId)
      }
      await prisma.fireExtinguisherAttachment.delete({ where: { id: attachmentId } })
    },

    async getAttachmentForDownload(auditId: string, attachmentId: string, scope: AuditScopeContext) {
      const attachment = await prisma.fireExtinguisherAttachment.findFirst({
        where: { id: attachmentId, auditId },
        include: { extinguisher: { select: { establishment: true, assetId: true, asset: { select: { assetType: true, auditable: true } } } } },
      })
      if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
      if (!attachment.extinguisher || !matchesAuditPopulation(attachment.extinguisher, population)) {
        throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
      }
      if (!isInScope(scope, auditScopeKeyFor(attachment.extinguisher, population))) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
      return attachment
    },

    async findAll(query: ListFireExtinguisherAuditsQueryDTO, scope: AuditScopeContext) {
      const { page, limit, skip } = getPaginationParams(query)

      // El filtro de POBLACIÓN se aplica siempre, incluso sin restricción de
      // alcance (ADMIN/revisor) — a diferencia del filtro de alcance por
      // usuario (solo si scope.restricted), las dos colas (Matafuegos/Activos)
      // comparten esta misma tabla pero deben quedar operativamente separadas
      // para cualquier caller, no solo para el auditor scope-restricted. Sin
      // esto, GET /fire-extinguisher-audits empezaría a devolver también
      // auditorías de matafuegos de vehículos (y viceversa en /asset-audits).
      const allExtinguishers = await prisma.fireExtinguisher.findMany({
        select: { id: true, establishment: true, assetId: true, asset: { select: { assetType: true, auditable: true } } },
      })
      let allowed = allExtinguishers.filter((fe) => matchesAuditPopulation(fe, population))
      if (scope.restricted) {
        allowed = allowed.filter((fe) => isInScope(scope, auditScopeKeyFor(fe, population)))
      }
      let fireExtinguisherIds = allowed.map((fe) => fe.id)
      if (query.fireExtinguisherId) {
        fireExtinguisherIds = fireExtinguisherIds.includes(query.fireExtinguisherId) ? [query.fireExtinguisherId] : []
      }

      const where: Prisma.FireExtinguisherAuditWhereInput = { fireExtinguisherId: { in: fireExtinguisherIds } }
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
                asset: { select: { id: true, code: true, name: true, assetType: true } },
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

    // Cobertura de auditoría: todos los matafuegos activos de esta población
    // (edificio o vehículo/maquinaria, según corresponda), marcados con la
    // auditoría más reciente (si existe) que tengan en el período dado, sin
    // contar las rechazadas — mismo criterio que `auditedThisPeriod` en
    // fire-extinguishers-dashboard.service.ts.
    async getCoverage(period: string, scope: AuditScopeContext) {
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
            assetId: true,
            asset: { select: { id: true, code: true, name: true, assetType: true, auditable: true } },
          },
          orderBy: [{ establishment: 'asc' }, { code: 'asc' }],
        }),
        prisma.fireExtinguisherAudit.findMany({
          where: { auditPeriod: period, status: { not: 'REJECTED' } },
          select: { id: true, fireExtinguisherId: true, status: true, auditDate: true },
          orderBy: { auditDate: 'desc' },
        }),
      ])

      const latestAuditByExtinguisher = new Map<string, { id: string; status: string; auditDate: Date }>()
      for (const a of audits) {
        if (!latestAuditByExtinguisher.has(a.fireExtinguisherId)) {
          latestAuditByExtinguisher.set(a.fireExtinguisherId, { id: a.id, status: a.status, auditDate: a.auditDate })
        }
      }

      const auditApplicable = extinguishers
        .filter((fe) => matchesAuditPopulation(fe, population))
        .filter((fe) => isInScope(scope, auditScopeKeyFor(fe, population)))

      return auditApplicable.map((fe) => {
        const audit = latestAuditByExtinguisher.get(fe.id)
        return {
          id: fe.id,
          code: fe.code,
          cylinderNumber: fe.cylinderNumber ?? null,
          type: fe.type,
          establishment: fe.establishment ?? null,
          associatedLocationType: fe.locationType,
          location: fe.location ?? null,
          asset: fe.asset ? { id: fe.asset.id, code: fe.asset.code, name: fe.asset.name, assetType: fe.asset.assetType } : null,
          category: fe.asset ? auditScopeKeyFor(fe, 'ASSET') : null,
          audited: audit !== undefined,
          auditId: audit?.id ?? null,
          auditStatus: audit?.status ?? null,
          auditDate: audit ? toDateStr(audit.auditDate) : null,
        }
      })
    },

    // `reviewerIsAdmin` exceptúa la restricción de autorevisión — un ADMIN
    // suele ser quien audita (desde Cobertura) Y revisa/aprueba en esta misma
    // cuenta, a diferencia de un auditor común (solo tiene el módulo de
    // cobertura, nunca llega a esta pantalla). Un usuario no-ADMIN con permiso
    // de revisión sigue sin poder autoaprobarse. El chequeo de POBLACIÓN se
    // aplica siempre, incluso para ADMIN — igual que en findById/findAll, para
    // que las dos colas queden operativamente separadas también al revisar.
    async review(id: string, data: ReviewFireExtinguisherAuditDTO, reviewedBy: string, reviewerIsAdmin = false) {
      const audit = await prisma.fireExtinguisherAudit.findUnique({
        where: { id },
        include: {
          proposedChanges: true,
          extinguisher: { select: { establishment: true, assetId: true, asset: { select: { assetType: true, auditable: true } } } },
        },
      })
      if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      if (!audit.extinguisher || !matchesAuditPopulation(audit.extinguisher, population)) {
        throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
      }
      if (audit.status !== 'SUBMITTED') {
        throw new AppError(409, 'Esta auditoría ya fue revisada', 'ALREADY_REVIEWED')
      }
      if (audit.auditedBy === reviewedBy && !reviewerIsAdmin) {
        throw new AppError(
          403,
          'No podés revisar/aprobar una auditoría que vos mismo auditaste',
          'SELF_REVIEW_FORBIDDEN',
        )
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

    // Aprueba varias auditorías SUBMITTED de una sola vez, aceptando también
    // todos sus cambios propuestos PENDING (ver BulkApproveFireExtinguisherAuditsSchema).
    // Reusa review() para no duplicar la lógica de aplicar cambios al maestro
    // y el historial (incluido el chequeo de población) — cada auditoría se
    // procesa de forma independiente: si una falla (población equivocada, ya
    // revisada, self-review, etc.) no aborta el resto del lote.
    async bulkApprove(ids: string[], reviewedBy: string, reviewerIsAdmin = false, reviewNotes?: string | null) {
      const audits = await prisma.fireExtinguisherAudit.findMany({
        where: { id: { in: ids } },
        include: { proposedChanges: true, extinguisher: { select: { code: true } } },
      })
      const auditById = new Map(audits.map((a) => [a.id, a]))

      const approved: string[] = []
      const failed: { id: string; code: string | null; message: string }[] = []

      for (const id of ids) {
        const audit = auditById.get(id)
        if (!audit) {
          failed.push({ id, code: null, message: 'Auditoría no encontrada' })
          continue
        }
        try {
          const pending = audit.proposedChanges.filter((pc) => pc.status === 'PENDING')
          const decisions = pending.map((pc) => ({ proposedChangeId: pc.id, decision: 'APPROVED' as const }))
          await this.review(id, { decisions, auditDecision: 'APPROVED', reviewNotes: reviewNotes ?? undefined }, reviewedBy, reviewerIsAdmin)
          approved.push(id)
        } catch (err) {
          failed.push({ id, code: audit.extinguisher.code, message: err instanceof AppError ? err.message : 'Error al aprobar' })
        }
      }

      return { approved, failed }
    },
  }
}

export const fireExtinguisherAuditsService = buildFireExtinguisherAuditsService('ESTABLISHMENT')
export const assetFireExtinguisherAuditsService = buildFireExtinguisherAuditsService('ASSET')
