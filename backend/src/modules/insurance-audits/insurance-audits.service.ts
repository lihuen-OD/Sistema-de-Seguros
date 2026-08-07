import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { detectFileType, formatFileSize, matchesDeclaredMimetype, sanitizeFileName } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import { todayDate, currentYearMonth, toDateStr } from '../../shared/utils/dates'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { isInScope, type AuditScopeContext } from '../../shared/services/audit-scope.service'
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

function mapAudit(audit: Record<string, unknown>) {
  const asset = audit.asset as Record<string, unknown> | null | undefined
  return {
    id: audit.id,
    assetId: audit.assetId,
    status: audit.status,
    auditDate: toDateStr(audit.auditDate as Date | string),
    auditPeriod: audit.auditPeriod,
    auditedBy: audit.auditedBy,
    checklist: {
      policyActiveConfirmed: audit.policyActiveConfirmed,
      insuranceCardPresent: audit.insuranceCardPresent,
      dataMatchesInsuredAsset: audit.dataMatchesInsuredAsset,
      physicalConditionOk: audit.physicalConditionOk,
      odometerOrHoursObserved: audit.odometerOrHoursObserved ?? null,
      comments: audit.comments ?? null,
    },
    attachments: Array.isArray(audit.attachments) ? (audit.attachments as Record<string, unknown>[]).map(mapAttachment) : [],
    // Stub liviano para que el detalle de la auditoría muestre nombre/tipo/código
    // sin depender de GET /assets/:id (que requiere el módulo `assets`, que un
    // auditor/revisor con solo el módulo de auditoría no tiene por qué tener).
    asset: asset ? { id: asset.id, code: asset.code, name: asset.name, assetType: asset.assetType } : null,
    reviewedBy: audit.reviewedBy ?? null,
    reviewedAt: audit.reviewedAt ?? null,
    reviewNotes: audit.reviewNotes ?? null,
    createdAt: audit.createdAt,
    updatedAt: audit.updatedAt,
  }
}

function mapAuditListItem(row: Record<string, unknown>) {
  const asset = row.asset as Record<string, unknown> | null | undefined
  return {
    id: row.id,
    status: row.status,
    auditDate: toDateStr(row.auditDate as Date | string),
    auditPeriod: row.auditPeriod,
    auditedBy: row.auditedBy,
    reviewedBy: row.reviewedBy ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewNotes: row.reviewNotes ?? null,
    asset: asset
      ? { id: asset.id, code: asset.code, name: asset.name, assetType: asset.assetType }
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// Mismo criterio de elegibilidad que asset-audits.service.ts (isEligibleAsset)
// — activo, marcado auditable, categoría dentro de las 9 auditables. Los
// activos elegibles para Auditoría de Seguros son exactamente los mismos que
// para Auditoría de Activos (mismas categorías); si en el futuro se necesita
// distinguirlos, este es el único lugar a tocar.
function isEligibleAsset(asset: { isActive: boolean; auditable: boolean; assetType: string }): boolean {
  return asset.isActive && asset.auditable && classifyAuditableAssetCategory(asset.assetType) !== null
}

export const insuranceAuditsService = {
  async create(data: CreateInsuranceAuditDTO, performedBy: string, scope: AuditScopeContext) {
    const asset = await prisma.asset.findUnique({ where: { id: data.assetId } })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    if (!isEligibleAsset(asset)) {
      throw new AppError(400, 'Este activo no está habilitado para auditoría de seguros', 'ASSET_NOT_AUDITABLE')
    }
    const category = classifyAuditableAssetCategory(asset.assetType)!
    // Fuera del alcance asignado = mismo 404 que "no existe" — no debe
    // filtrarse que el activo existe en otra categoría.
    if (!isInScope(scope, category)) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')

    const created = await prisma.insuranceAudit
      .create({
        data: {
          assetId: asset.id,
          auditDate: todayDate(),
          auditPeriod: currentYearMonth(),
          auditedBy: performedBy,
          policyActiveConfirmed: data.checklist.policyActiveConfirmed,
          insuranceCardPresent: data.checklist.insuranceCardPresent,
          dataMatchesInsuredAsset: data.checklist.dataMatchesInsuredAsset,
          physicalConditionOk: data.checklist.physicalConditionOk,
          odometerOrHoursObserved: data.checklist.odometerOrHoursObserved ?? null,
          comments: data.checklist.comments ?? null,
        },
      })
      .catch(handleDuplicateAudit)

    return mapAudit({ ...created, attachments: [] } as unknown as Record<string, unknown>)
  },

  async update(id: string, data: UpdateInsuranceAuditDTO, scope: AuditScopeContext) {
    const audit = await prisma.insuranceAudit.findUnique({ where: { id }, include: { asset: { select: { assetType: true } } } })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (audit.status !== 'SUBMITTED') {
      throw new AppError(409, 'Solo se puede editar una auditoría pendiente de revisión', 'AUDIT_NOT_EDITABLE')
    }
    const category = classifyAuditableAssetCategory(audit.asset.assetType)
    if (!isInScope(scope, category)) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')

    await prisma.insuranceAudit.update({
      where: { id },
      data: {
        policyActiveConfirmed: data.checklist.policyActiveConfirmed,
        insuranceCardPresent: data.checklist.insuranceCardPresent,
        dataMatchesInsuredAsset: data.checklist.dataMatchesInsuredAsset,
        physicalConditionOk: data.checklist.physicalConditionOk,
        odometerOrHoursObserved: data.checklist.odometerOrHoursObserved ?? null,
        comments: data.checklist.comments ?? null,
      },
    })

    return this.findById(id)
  },

  // `scope` es opcional: los callers internos (update/review, que ya
  // validaron autorización más arriba) llaman sin scope para no re-filtrar;
  // solo el controller de GET /:id pasa el scope del request.
  async findById(id: string, scope?: AuditScopeContext) {
    const audit = await prisma.insuranceAudit.findUnique({
      where: { id },
      include: { attachments: true, asset: { select: { id: true, code: true, name: true, assetType: true } } },
    })
    if (!audit) throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    if (scope && !isInScope(scope, classifyAuditableAssetCategory(audit.asset.assetType))) {
      throw new AppError(404, 'Auditoría no encontrada', 'NOT_FOUND')
    }
    return mapAudit(audit as unknown as Record<string, unknown>)
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
    if (!isInScope(scope, classifyAuditableAssetCategory(audit.asset.assetType))) {
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
      include: { audit: { include: { asset: { select: { assetType: true } } } } },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, classifyAuditableAssetCategory(attachment.audit.asset.assetType))) {
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
      include: { audit: { include: { asset: { select: { assetType: true } } } } },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (!isInScope(scope, classifyAuditableAssetCategory(attachment.audit.asset.assetType))) {
      throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    }
    return attachment
  },

  async findAll(query: ListInsuranceAuditsQueryDTO, scope: AuditScopeContext) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Prisma.InsuranceAuditWhereInput = {}
    if (query.status && query.status.length > 0) where.status = { in: query.status }

    // Ver el comentario equivalente en asset-audits.service.ts#findAll: la
    // categoría no es una columna real, así que el scope se resuelve primero
    // a un set de assetIds permitidos y se filtra por `assetId IN (...)` —
    // un WHERE real, para que paginación y `total` queden correctos.
    if (scope.restricted) {
      const eligibleAssets = await prisma.asset.findMany({
        where: { isActive: true, auditable: true },
        select: { id: true, assetType: true },
      })
      let allowedAssetIds = eligibleAssets
        .filter((a) => isInScope(scope, classifyAuditableAssetCategory(a.assetType)))
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
        include: { asset: { select: { id: true, code: true, name: true, assetType: true } } },
      }),
      prisma.insuranceAudit.count({ where }),
    ])

    return buildPaginatedResponse(rows.map((r) => mapAuditListItem(r as unknown as Record<string, unknown>)), total, { page, limit })
  },

  // Cobertura de auditoría: todos los activos activos, marcados auditable, en
  // una categoría auditable y dentro del alcance del usuario, con la
  // auditoría de seguros más reciente (si existe) de este período, sin
  // contar las rechazadas — mismo criterio que asset-audits.service.ts.
  async getCoverage(period: string, scope: AuditScopeContext) {
    const [assets, audits] = await Promise.all([
      prisma.asset.findMany({
        where: { isActive: true, auditable: true },
        select: { id: true, code: true, name: true, assetType: true },
        orderBy: [{ assetType: 'asc' }, { name: 'asc' }],
      }),
      prisma.insuranceAudit.findMany({
        where: { auditPeriod: period, status: { not: 'REJECTED' } },
        select: { id: true, assetId: true, status: true, auditDate: true },
        orderBy: { auditDate: 'desc' },
      }),
    ])

    const latestAuditByAsset = new Map<string, { id: string; status: string; auditDate: Date }>()
    for (const a of audits) {
      if (!latestAuditByAsset.has(a.assetId)) {
        latestAuditByAsset.set(a.assetId, { id: a.id, status: a.status, auditDate: a.auditDate })
      }
    }

    return assets
      .map((asset) => ({ asset, category: classifyAuditableAssetCategory(asset.assetType) }))
      .filter((x): x is { asset: typeof assets[number]; category: NonNullable<typeof x.category> } => x.category !== null)
      .filter((x) => isInScope(scope, x.category))
      .map(({ asset, category }) => {
        const audit = latestAuditByAsset.get(asset.id)
        return {
          id: asset.id,
          code: asset.code,
          name: asset.name,
          assetType: asset.assetType,
          category,
          audited: audit !== undefined,
          auditId: audit?.id ?? null,
          auditStatus: audit?.status ?? null,
          auditDate: audit ? toDateStr(audit.auditDate) : null,
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

    await prisma.insuranceAudit.update({
      where: { id },
      data: { status: data.auditDecision, reviewedBy, reviewedAt: new Date(), reviewNotes: data.reviewNotes ?? null },
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
}
