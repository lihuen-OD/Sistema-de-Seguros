import type { Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { detectFileType, formatFileSize, matchesDeclaredMimetype, sanitizeFileName } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import { sendAttachmentDownload } from '../../shared/utils/attachment-download'
import { todayDate, currentYearMonth, toDateStr } from '../../shared/utils/dates'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { latestByKey } from '../../shared/utils/latest-by-key'
import { isInScope, replaceUserAuditScope, type AuditScopeContext } from '../../shared/services/audit-scope.service'
import { listAuditComments, createManualComment, recordAuditorNote, recordReviewDecision, markAuditCommentSeen } from '../../shared/services/audit-comments.service'
import { classifyAuditableAssetCategory } from '../asset-audits/asset-audit-category-classification'
import type {
  CreateInsuranceAuditDTO,
  UpdateInsuranceAuditDTO,
  AddInsuranceAuditAttachmentDTO,
  ReviewInsuranceAuditDTO,
  ListInsuranceAuditsQueryDTO,
} from './insurance-audits.schemas'

const MAX_ATTACHMENTS_PER_AUDIT = 10

const ALLOWED_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

function isAllowedPhotoMimetype(mimetype: string): boolean {
  return ALLOWED_PHOTO_MIMETYPES.has(mimetype)
}

function handleDuplicateAudit(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(',') : String(e.meta?.target ?? '')
    if (target.includes('auditPeriod')) {
      throw new AppError(409, 'Ya existe una auditoría de seguros para este activo en el período actual', 'DUPLICATE_AUDIT_PERIOD')
    }
    throw new AppError(409, 'Registro duplicado', 'DUPLICATE')
  }
  throw e
}

function mapAttachment(a: Record<string, unknown>) {
  return {
    id: a.id,
    auditId: a.auditId,
    name: a.name,
    fileType: a.fileType,
    fileSize: a.fileSize,
    fileUrl: a.fileUrl,
    uploadedAt: a.uploadedAt,
    uploadedBy: a.uploadedBy,
  }
}

// Patente/chasis/motor no son columnas propias del Activo — viven en
// `Asset.metadata` (JSON), cargados hoy desde el alta/edición de Activos.
// Único lugar donde este módulo los extrae, para no repetir el parseo en
// cada mapper.
function extractVehicleMeta(metadata: unknown): { plate: string | null; chassisNumber: string | null; engineNumber: string | null } {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  return {
    plate: asString(meta.plate),
    chassisNumber: asString(meta.chassisNumber),
    engineNumber: asString(meta.engineNumber),
  }
}

interface CirculationCardRef {
  id: string
  fileUrl: string
  name: string
}

// Superset interno de CirculationCardRef — agrega cloudinaryPublicId, que
// sendAttachmentDownload necesita para pedir el link de descarga firmado.
// Nunca se expone al cliente (getCirculationCardReferences lo filtra).
interface CirculationCardFile extends CirculationCardRef {
  cloudinaryPublicId: string | null
}

// La tarjeta de circulación archivada en el sistema cuelga de la línea de
// cobertura de una póliza (PolicyAssetCoverage → PolicyAttachment con
// isCirculationCard=true), no del Activo — no hay ningún lookup existente
// por assetId (ver policies.service.ts, que solo resuelve por policyId). Un
// activo puede tener más de una cobertura vigente en paralelo (caso raro);
// se toma la tarjeta subida más recientemente entre todas. Recibe varios
// assetIds a la vez (usado por getCoverage) para no hacer N+1 queries.
async function getCirculationCardFiles(assetIds: string[]): Promise<Map<string, CirculationCardFile | null>> {
  const result = new Map<string, CirculationCardFile | null>(assetIds.map((id) => [id, null]))
  if (assetIds.length === 0) return result

  const coverages = await prisma.policyAssetCoverage.findMany({
    where: { assetId: { in: assetIds } },
    select: {
      assetId: true,
      attachments: {
        where: { isCirculationCard: true },
        select: { id: true, fileUrl: true, name: true, cloudinaryPublicId: true, uploadedAt: true },
        orderBy: { uploadedAt: 'desc' },
        take: 1,
      },
    },
  })

  const latestByAsset = new Map<
    string,
    { id: string; fileUrl: string; name: string; cloudinaryPublicId: string | null; uploadedAt: Date }
  >()
  for (const coverage of coverages) {
    if (!coverage.assetId) continue
    const [card] = coverage.attachments
    if (!card) continue
    const existing = latestByAsset.get(coverage.assetId)
    if (!existing || card.uploadedAt > existing.uploadedAt) {
      latestByAsset.set(coverage.assetId, card)
    }
  }

  for (const [assetId, card] of latestByAsset) {
    result.set(assetId, { id: card.id, fileUrl: card.fileUrl, name: card.name, cloudinaryPublicId: card.cloudinaryPublicId })
  }
  return result
}

async function getCirculationCardFile(assetId: string): Promise<CirculationCardFile | null> {
  const files = await getCirculationCardFiles([assetId])
  return files.get(assetId) ?? null
}

// Forma pública ({id, fileUrl, name}, sin cloudinaryPublicId) — la usan
// create()/findById()/getCoverage() para mostrar la referencia al auditor.
// La descarga real (downloadCirculationCard) usa getCirculationCardFile.
async function getCirculationCardReferences(assetIds: string[]): Promise<Map<string, CirculationCardRef | null>> {
  const files = await getCirculationCardFiles(assetIds)
  const result = new Map<string, CirculationCardRef | null>()
  for (const [assetId, file] of files) {
    result.set(assetId, file ? { id: file.id, fileUrl: file.fileUrl, name: file.name } : null)
  }
  return result
}

async function getCirculationCardReference(assetId: string): Promise<CirculationCardRef | null> {
  const refs = await getCirculationCardReferences([assetId])
  return refs.get(assetId) ?? null
}

function mapAudit(audit: Record<string, unknown>, referenceCirculationCard: CirculationCardRef | null = null) {
  const asset = audit.asset as Record<string, unknown> | null | undefined
  const vehicleMeta = asset ? extractVehicleMeta(asset.metadata) : { plate: null, chassisNumber: null, engineNumber: null }
  return {
    id: audit.id,
    assetId: audit.assetId,
    status: audit.status,
    auditDate: toDateStr(audit.auditDate as Date | string),
    auditPeriod: audit.auditPeriod,
    auditedBy: audit.auditedBy,
    checklist: {
      hasCirculationCard: audit.hasCirculationCard,
      comments: audit.comments ?? null,
    },
    attachments: Array.isArray(audit.attachments) ? (audit.attachments as Record<string, unknown>[]).map(mapAttachment) : [],
    // Stub liviano para que el detalle de la auditoría muestre nombre/tipo/código
    // sin depender de GET /assets/:id (que requiere el módulo `assets`, que un
    // auditor/revisor con solo el módulo de auditoría no tiene por qué tener).
    asset: asset ? { id: asset.id, code: asset.code, name: asset.name, assetType: asset.assetType, ...vehicleMeta } : null,
    referenceCirculationCard,
    cardUpdateRequested: audit.cardUpdateRequested ?? false,
    cardUpdateRequestedAt: audit.cardUpdateRequestedAt ? toDateStr(audit.cardUpdateRequestedAt as Date | string) : null,
    cardUpdateRequestedBy: audit.cardUpdateRequestedBy ?? null,
    reviewedBy: audit.reviewedBy ?? null,
    reviewedAt: audit.reviewedAt ?? null,
    reviewNotes: audit.reviewNotes ?? null,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  }
}

function mapAuditListItem(row: Record<string, unknown>) {
  const asset = row.asset as Record<string, unknown> | null | undefined
  const vehicleMeta = asset ? extractVehicleMeta(asset.metadata) : { plate: null, chassisNumber: null, engineNumber: null }
  return {
    id: row.id,
    status: row.status,
    auditDate: toDateStr(row.auditDate as Date | string),
    auditPeriod: row.auditPeriod,
    auditedBy: row.auditedBy,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewNotes: row.reviewNotes ?? null,
    cardUpdateRequested: row.cardUpdateRequested ?? false,
    asset: asset
      ? { id: asset.id, code: asset.code, name: asset.name, assetType: asset.assetType, ...vehicleMeta }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// Elegibilidad para Auditoría de Seguros: activo, marcado insuranceAuditable
// (flag independiente del de Auditoría de Rodados — ver
// fire-extinguisher-audits.population.ts), categoría dentro de las 9
// auditables.
function isEligibleAsset(asset: { isActive: boolean; insuranceAuditable: boolean; assetType: string }): boolean {
  return asset.isActive && asset.insuranceAuditable && classifyAuditableAssetCategory(asset.assetType) !== null
}

export const insuranceAuditsService = {
  async create(data: CreateInsuranceAuditDTO, performedBy: string, scope: AuditScopeContext) {
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    if (!isEligibleAsset(asset)) {
      throw new AppError(400, 'Este activo no está habilitado para auditoría de seguros', 'ASSET_NOT_AUDITABLE')
    }
    // Fuera del alcance asignado (activo individual, no categoría) = mismo
    // 404 que "no existe" — no debe filtrarse que el activo existe.
    if (!isInScope(scope, asset.id)) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')

    const auditPeriod = currentYearMonth()

    const created = await prisma
      .$transaction(async (tx) => {
        const row = await tx.insuranceAudit.create({
          data: {
            assetId: asset.id,
            auditDate: todayDate(),
            auditPeriod,
            auditedBy: performedBy,
            hasCirculationCard: data.checklist.hasCirculationCard,
            comments: data.checklist.comments ?? null,
          },
        })
        await recordAuditorNote(tx, 'ASSET', asset.id, auditPeriod, row.id, performedBy, data.checklist.comments ?? null)
        return row
      })
      .catch(handleDuplicateAudit)

    const referenceCirculationCard = await getCirculationCardReference(asset.id)
    return mapAudit({ ...created, attachments: [] } as unknown as Record<string, unknown>, referenceCirculationCard)
  },

  async update(id: string, data: UpdateInsuranceAuditDTO, scope: AuditScopeContext) {
    const audit = await prisma.insuranceAudit.findUnique({ where: { id }, include: { asset: { select: { assetType: true } } } })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (audit.status !== 'SUBMITTED') {
      throw new AppError(409, 'Solo se puede editar una auditoría pendiente de revisión', 'AUDIT_NOT_EDITABLE')
    }
    if (!isInScope(scope, audit.assetId)) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')

    await prisma.$transaction(async (tx) => {
      await tx.insuranceAudit.update({
        where: { id },
        data: {
          hasCirculationCard: data.checklist.hasCirculationCard,
          comments: data.checklist.comments ?? null,
        },
      })
      // authorEmail = el auditor original (auditedBy), no quien guarda el
      // edit — el comentario queda atribuido a quien hizo la auditoría.
      await recordAuditorNote(tx, 'ASSET', audit.assetId, audit.auditPeriod, id, audit.auditedBy, data.checklist.comments ?? null)
    })

    return this.findById(id)
  },

  // `scope` es opcional: los callers internos (update/review, que ya
  // validaron autorización más arriba) llaman sin scope para no re-filtrar;
  // solo el controller de GET /:id pasa el scope del request.
  async findById(id: string, scope?: AuditScopeContext) {
    const audit = await prisma.insuranceAudit.findUnique({
      where: { id },
      include: {
        attachments: true,
        asset: { select: { id: true, code: true, name: true, assetType: true, metadata: true } },
      },
    })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (scope && !isInScope(scope, audit.assetId)) {
      throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    }
    const referenceCirculationCard = await getCirculationCardReference(audit.assetId)
    return mapAudit(audit as unknown as Record<string, unknown>, referenceCirculationCard)
  },

  async addAttachment(
    auditId: string,
    file: Express.Multer.File,
    meta: AddInsuranceAuditAttachmentDTO,
    uploadedBy: string,
    scope: AuditScopeContext,
  ) {
    const audit = await prisma.insuranceAudit.findUnique({
      where: { id: auditId },
      include: { asset: { select: { assetType: true } } },
    })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (!isInScope(scope, audit.assetId)) {
      throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    }

    const count = await prisma.insuranceAuditAttachment.count({ where: { auditId } })
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
      const result = await uploadToCloudinary(file.buffer, 'insurance-audits', file.mimetype)
      fileUrl = result.secure_url
      cloudinaryPublicId = result.public_id
    }

    try {
      const attachment = await prisma.insuranceAuditAttachment.create({
        data: {
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
    const attachment = await prisma.insuranceAuditAttachment.findFirst({
      where: { id: attachmentId, auditId },
      include: { audit: true },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, attachment.audit.assetId)) {
      throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    }
    if (attachment.cloudinaryPublicId) {
      await deleteFromCloudinary(attachment.cloudinaryPublicId)
    }
    await prisma.insuranceAuditAttachment.delete({ where: { id: attachmentId } })
  },

  async getAttachmentForDownload(auditId: string, attachmentId: string, scope: AuditScopeContext) {
    const attachment = await prisma.insuranceAuditAttachment.findFirst({
      where: { id: attachmentId, auditId },
      include: { audit: true },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, attachment.audit.assetId)) {
      throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    }
    return attachment
  },

  async findAll(query: ListInsuranceAuditsQueryDTO, scope: AuditScopeContext) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Prisma.InsuranceAuditWhereInput = {}
    if (query.status && query.status.length > 0) where.status = { in: query.status }

    // El alcance es por activo individual (UserAuditScope.scopeValue =
    // assetId) — se resuelve primero a un set de assetIds permitidos y se
    // filtra por `assetId IN (...)`, un WHERE real, para que paginación y
    // `total` queden correctos.
    if (scope.restricted) {
      const eligibleAssets = await prisma.asset.findMany({
        where: { isActive: true, insuranceAuditable: true },
        select: { id: true, assetType: true },
      })
      let allowedAssetIds = eligibleAssets
        .filter((a) => isInScope(scope, a.id))
        .map((a) => a.id)
      if (query.assetId) allowedAssetIds = allowedAssetIds.includes(query.assetId) ? [query.assetId] : []
      where.assetId = { in: allowedAssetIds }
    } else if (query.assetId) {
      where.assetId = query.assetId
    }

    const [rows, total] = await Promise.all([
      prisma.insuranceAudit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { asset: { select: { id: true, code: true, name: true, assetType: true, metadata: true } } },
      }),
      prisma.insuranceAudit.count({ where }),
    ])

    return buildPaginatedResponse(rows.map((r) => mapAuditListItem(r as unknown as Record<string, unknown>)), total, { page, limit })
  },

  // Cobertura de auditoría: todos los activos activos, marcados
  // insuranceAuditable, en una categoría auditable y dentro del alcance del
  // usuario, con la auditoría de seguros MÁS RECIENTE (si existe) de este
  // período — cualquier estado, incluso REJECTED, para que Cobertura siempre
  // refleje el resultado real de la última recorrección. "Más reciente" se
  // define por `createdAt`, no por `auditDate` (fecha calendario "hoy" —
  // empataría entre una auditoría y su recorrección hecha el mismo día). Ver
  // latest-by-key.ts.
  async getCoverage(period: string, scope: AuditScopeContext) {
    const [assets, audits] = await Promise.all([
      prisma.asset.findMany({
        where: { isActive: true, insuranceAuditable: true },
        select: { id: true, code: true, name: true, assetType: true, metadata: true },
        orderBy: [{ assetType: 'asc' }, { name: 'asc' }],
      }),
      prisma.insuranceAudit.findMany({
        where: { auditPeriod: period },
        select: { id: true, assetId: true, status: true, auditDate: true, hasCirculationCard: true, cardUpdateRequested: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    const latestAuditByAsset = latestByKey(audits, (a) => a.assetId)

    const eligible = assets
      .map((asset) => ({ asset, category: classifyAuditableAssetCategory(asset.assetType) }))
      .filter((x): x is { asset: typeof assets[number]; category: NonNullable<typeof x.category> } => x.category !== null)
      .filter((x) => isInScope(scope, x.asset.id))

    const cardRefs = await getCirculationCardReferences(eligible.map((x) => x.asset.id))

    return eligible.map(({ asset, category }) => {
      const audit = latestAuditByAsset.get(asset.id)
      return {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        assetType: asset.assetType,
        ...extractVehicleMeta(asset.metadata),
        category,
        audited: audit !== undefined,
        auditId: audit?.id ?? null,
        auditStatus: audit?.status ?? null,
        auditDate: audit ? toDateStr(audit.auditDate) : null,
        hasCirculationCard: audit?.hasCirculationCard ?? null,
        cardUpdateRequested: audit?.cardUpdateRequested ?? false,
        referenceCirculationCard: cardRefs.get(asset.id) ?? null,
      }
    })
  },

  // `reviewerIsAdmin` exceptúa la restricción de autorevisión — mismo
  // criterio que fire-extinguisher-audits.service.ts#review.
  async review(id: string, data: ReviewInsuranceAuditDTO, reviewedBy: string, reviewerIsAdmin = false) {
    const audit = await prisma.insuranceAudit.findUnique({ where: { id } })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (audit.status !== 'SUBMITTED') {
      throw new AppError(409, 'Esta auditoría ya fue revisada', 'ALREADY_REVIEWED')
    }
    if (audit.auditedBy === reviewedBy && !reviewerIsAdmin) {
      throw new AppError(403, 'No podés revisar/aprobar una auditoría que vos mismo auditaste', 'SELF_REVIEW_FORBIDDEN')
    }

    await prisma.$transaction(async (tx) => {
      await tx.insuranceAudit.update({
        where: { id },
        data: { status: data.auditDecision, reviewedBy, reviewedAt: new Date(), reviewNotes: data.reviewNotes ?? null },
      })
      await recordReviewDecision(tx, 'ASSET', audit.assetId, audit.auditPeriod, id, reviewedBy, data.auditDecision, data.reviewNotes ?? null)
    })

    return this.findById(id)
  },

  async bulkApprove(ids: string[], reviewedBy: string, reviewerIsAdmin = false, reviewNotes?: string | null) {
    const audits = await prisma.insuranceAudit.findMany({
      where: { id: { in: ids } },
      include: { asset: { select: { code: true, name: true } } },
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
        await this.review(id, { auditDecision: 'APPROVED', reviewNotes: reviewNotes ?? undefined }, reviewedBy, reviewerIsAdmin)
        approved.push(id)
      } catch (err) {
        failed.push({ id, code: audit.asset.code ?? audit.asset.name, message: err instanceof AppError ? err.message : 'Error al aprobar' })
      }
    }

    return { approved, failed }
  },

  // Seguimiento de tarjeta de circulación (ver comentario en el modelo
  // InsuranceAudit): el auditor "avisa" que ya colocó la tarjeta impresa en
  // un vehículo que había quedado marcado sin ella. No cambia
  // `hasCirculationCard` todavía — eso lo hace el revisor en confirmCardPlaced.
  async requestCardUpdate(id: string, requestedBy: string, scope: AuditScopeContext) {
    const audit = await prisma.insuranceAudit.findUnique({ where: { id } })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (!isInScope(scope, audit.assetId)) {
      throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    }
    if (audit.hasCirculationCard) {
      throw new AppError(409, 'Esta auditoría ya indica que el activo tiene la tarjeta de circulación', 'CARD_ALREADY_PRESENT')
    }

    await prisma.insuranceAudit.update({
      where: { id },
      data: { cardUpdateRequested: true, cardUpdateRequestedAt: new Date(), cardUpdateRequestedBy: requestedBy },
    })

    return this.findById(id)
  },

  // Acción exclusiva del revisor — a propósito no exige `status === 'SUBMITTED'`:
  // el aviso del auditor típicamente llega después de que la auditoría ya
  // fue aprobada (imprimir y colocar la tarjeta lleva más tiempo que la
  // revisión). No reabre el resto de la revisión ni cambia `status`/
  // `reviewedBy` — solo el campo puntual que el aviso pedía corregir. Sin
  // `scope`: un revisor nunca queda restringido (mismo criterio que review()).
  async confirmCardPlaced(id: string) {
    const audit = await prisma.insuranceAudit.findUnique({ where: { id } })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (!audit.cardUpdateRequested) {
      throw new AppError(409, 'No hay ningún aviso pendiente de confirmar para esta auditoría', 'NO_PENDING_CARD_REQUEST')
    }

    await prisma.insuranceAudit.update({
      where: { id },
      data: { hasCirculationCard: true, cardUpdateRequested: false },
    })

    return this.findById(id)
  },

  // Feed de comentarios de Cobertura — reemplaza al viejo (basado en el
  // campo comments/commentSeen* de la propia auditoría) por el servicio
  // compartido audit-comments.service.ts. Mismo criterio de scope que
  // getCoverage (activo individual vía UserAuditScope).
  async getComments(period: string, scope: AuditScopeContext) {
    const [assets, comments] = await Promise.all([
      prisma.asset.findMany({
        where: { isActive: true, insuranceAuditable: true },
        select: { id: true, code: true, name: true, assetType: true, metadata: true },
      }),
      listAuditComments('ASSET', period),
    ])

    const assetById = new Map(assets.map((a) => [a.id, a]))

    return comments
      .map((c) => {
        const asset = assetById.get(c.targetId)
        if (!asset || !isInScope(scope, asset.id)) return null
        return {
          id: c.id,
          source: c.source,
          auditStatus: c.auditStatus,
          body: c.body,
          authorEmail: c.authorEmail,
          createdAt: c.createdAt.toISOString(),
          seenAt: c.seenAt ? c.seenAt.toISOString() : null,
          seenByEmail: c.seenByEmail,
          target: { id: asset.id, code: asset.code, name: asset.name, assetType: asset.assetType, ...extractVehicleMeta(asset.metadata) },
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
  },

  // Comentario suelto, sin auditoría de por medio (botón "Agregar
  // comentario") — mismo chequeo de elegibilidad/alcance que create().
  async addComment(assetId: string, body: string, authorEmail: string, scope: AuditScopeContext) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    if (!isEligibleAsset(asset)) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, asset.id)) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')

    return createManualComment('ASSET', assetId, currentYearMonth(), authorEmail, body)
  },

  // Valida que el comentario sea de Seguros y esté en el alcance de quien
  // marca ANTES de delegar en el servicio compartido — sin esto, alguien con
  // acceso a Matafuegos/Rodados podría marcar como visto un comentario de
  // Seguros y viceversa.
  async markCommentSeen(commentId: string, seenByEmail: string, scope: AuditScopeContext) {
    const comment = await prisma.auditComment.findUnique({ where: { id: commentId } })
    if (!comment || comment.targetType !== 'ASSET') throw new AppError(404, 'Comentario no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, comment.targetId)) throw new AppError(404, 'Comentario no encontrado', 'NOT_FOUND')

    return markAuditCommentSeen(commentId, seenByEmail)
  },

  // Baja los bytes reales de la tarjeta de circulación de un activo, para
  // que el frontend los consuma como blob (Ver/Descargar) — nunca la URL
  // pública de Cloudinary (`fileUrl`), que está sujeta a la restricción de
  // seguridad de PDF/ZIP y no es confiable (ver cloudinary.ts). Mismo
  // criterio de scope que getCoverage: por activo individual.
  async downloadCirculationCard(assetId: string, scope: AuditScopeContext, res: Response) {
    const asset = await prisma.asset.findUnique({ where: { id: assetId } })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, asset.id)) {
      throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    }

    const card = await getCirculationCardFile(assetId)
    if (!card) throw new AppError(404, 'No hay tarjeta de circulación cargada para este activo', 'NOT_FOUND')

    await sendAttachmentDownload(res, card)
  },

  // Asignación por activo individual (admin-only, ver
  // insurance-audits.router.ts) — reemplaza a la asignación por categoría:
  // dos auditores de la misma categoría (ej. "camioneta") pueden repartirse
  // vehículos puntuales en vez de ver todos los de la categoría.
  async getAssignments() {
    const [auditors, assets, scopes] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true, accessProfile: { modules: { has: 'insurance_audit_coverage' } } },
        select: { id: true, name: true, email: true },
        orderBy: { name: 'asc' },
      }),
      prisma.asset.findMany({
        where: { isActive: true, insuranceAuditable: true },
        select: { id: true, code: true, name: true, assetType: true, metadata: true },
        orderBy: [{ assetType: 'asc' }, { name: 'asc' }],
      }),
      prisma.userAuditScope.findMany({
        where: { area: 'INSURANCE_AUDIT' },
        select: { userId: true, scopeValue: true },
      }),
    ])

    const assetIdsByUser = new Map<string, string[]>()
    for (const s of scopes) {
      const list = assetIdsByUser.get(s.userId)
      if (list) list.push(s.scopeValue)
      else assetIdsByUser.set(s.userId, [s.scopeValue])
    }

    const eligibleAssets = assets
      .map((asset) => ({ asset, category: classifyAuditableAssetCategory(asset.assetType) }))
      .filter((x): x is { asset: typeof assets[number]; category: NonNullable<typeof x.category> } => x.category !== null)

    // Un activo puede haber quedado asignado antes de perder elegibilidad
    // (se le quitó el tilde insuranceAuditable, cambió de categoría, etc.) —
    // no mostrarlo como asignado, porque tampoco se puede desmarcar desde la
    // UI (ni aparece ahí). Se limpia solo la próxima vez que se guarde la
    // asignación de ese usuario (ver saveAssignment).
    const eligibleAssetIds = new Set(eligibleAssets.map((x) => x.asset.id))

    return {
      auditors: auditors.map((u) => ({
        userId: u.id,
        name: u.name,
        email: u.email,
        assetIds: (assetIdsByUser.get(u.id) ?? []).filter((id) => eligibleAssetIds.has(id)),
      })),
      assets: eligibleAssets.map(({ asset, category }) => ({
        id: asset.id,
        code: asset.code,
        name: asset.name,
        assetType: asset.assetType,
        category,
        ...extractVehicleMeta(asset.metadata),
      })),
    }
  },

  async saveAssignment(userId: string, assetIds: string[]) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')

    // Se descarta en silencio lo que ya no es elegible en vez de rechazar
    // todo el guardado — ver el comentario equivalente en
    // asset-audits-assignments.service.ts#saveAssignment.
    let validAssetIds = assetIds
    if (assetIds.length > 0) {
      const found = await prisma.asset.findMany({
        where: { id: { in: assetIds }, isActive: true, insuranceAuditable: true },
        select: { id: true, assetType: true },
      })
      const validIds = new Set(found.filter((a) => classifyAuditableAssetCategory(a.assetType) !== null).map((a) => a.id))
      validAssetIds = assetIds.filter((id) => validIds.has(id))
    }

    await replaceUserAuditScope(userId, 'INSURANCE_AUDIT', validAssetIds)
  },
}
