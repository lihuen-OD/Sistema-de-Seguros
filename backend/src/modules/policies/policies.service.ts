import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { computePolicyStatus, buildPolicyStatusFilter, toDateStr } from '../../shared/utils/dates'
import { detectFileType, formatFileSize, isAllowedMimetype, matchesDeclaredMimetype, sanitizeFileName } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import { assetsService } from '../assets/assets.service'
import type {
  CreatePolicyDTO,
  UpdatePolicyDTO,
  ListPoliciesQueryDTO,
  AddPolicyAttachmentDTO,
} from './policies.schemas'

const POLICY_LIST_INCLUDE = {
  insuranceType: { include: { coverages: { select: { id: true, name: true } } } },
  company: { select: { id: true, name: true } },
  producer: { select: { id: true, name: true } },
  _count: { select: { attachments: true, allocations: true } },
}

const POLICY_DETAIL_INCLUDE = {
  insuranceType: { include: { coverages: true } },
  company: true,
  producer: true,
  attachments: { orderBy: { uploadedAt: 'desc' as const }, take: 50 },
  _count: { select: { allocations: true, attachments: true } },
}

// expirationDate es @db.Date — normalizarlo a YYYY-MM-DD antes de exponerlo.
function mapAttachment<T extends { expirationDate: Date | string | null }>(att: T) {
  return { ...att, expirationDate: att.expirationDate ? toDateStr(att.expirationDate) : null }
}

// Normaliza las fechas a YYYY-MM-DD y agrega el status computado
function withStatus<T extends {
  startDate: Date | string
  endDate: Date | string
  attachments?: Array<{ expirationDate: Date | string | null }>
}>(policy: T) {
  return {
    ...policy,
    startDate: toDateStr(policy.startDate),
    endDate: toDateStr(policy.endDate),
    status: computePolicyStatus(policy.endDate),
    ...(policy.attachments ? { attachments: policy.attachments.map(mapAttachment) } : {}),
  }
}

export const policiesService = {
  async findAll(query: ListPoliciesQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.status && buildPolicyStatusFilter(query.status)),
      ...(query.insuranceTypeId && { insuranceTypeId: query.insuranceTypeId }),
      ...(query.companyId && { companyId: query.companyId }),
      ...(query.producerId && { producerId: query.producerId }),
      ...(query.assetId && { assetIds: { has: query.assetId } }),
      ...(query.search && {
        OR: [
          { policyNumber: { contains: query.search, mode: 'insensitive' as const } },
          { insuredName: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [rawData, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: POLICY_LIST_INCLUDE,
      }),
      prisma.policy.count({ where }),
    ])

    return buildPaginatedResponse(
      rawData.map((p) => {
        const selectedCoverages = p.insuranceType.coverages.filter((c) =>
          p.coverageIds.includes(c.id),
        )
        return withStatus({ ...p, selectedCoverages })
      }),
      total,
      { page, limit },
    )
  },

  async findById(id: string) {
    const policy = await prisma.policy.findUnique({
      where: { id },
      include: POLICY_DETAIL_INCLUDE,
    })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    const selectedCoverages = policy.insuranceType.coverages.filter((c) =>
      policy.coverageIds.includes(c.id),
    )

    const selectedAssets = await assetsService.resolveAssetsSummary(policy.assetIds)

    return withStatus({ ...policy, selectedCoverages, selectedAssets })
  },

  async create(data: CreatePolicyDTO) {
    // Verificar unicidad + referencias en paralelo
    const [exists, insuranceType, company, producer] = await Promise.all([
      prisma.policy.findUnique({ where: { policyNumber: data.policyNumber }, select: { id: true } }),
      prisma.insuranceType.findFirst({
        where: { id: data.insuranceTypeId, isActive: true },
        include: { coverages: true },
      }),
      prisma.company.findFirst({ where: { id: data.companyId, isActive: true }, select: { id: true } }),
      data.producerId
        ? prisma.producer.findFirst({ where: { id: data.producerId, isActive: true }, select: { id: true } })
        : Promise.resolve(null),
    ])

    if (exists) throw new AppError(409, 'Ya existe una póliza con ese número', 'CONFLICT')
    if (!insuranceType) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')
    if (!company) throw new AppError(400, 'Empresa no encontrada o inactiva', 'INVALID_REFERENCE')
    if (data.producerId && !producer) throw new AppError(400, 'Productor no encontrado o inactivo', 'INVALID_REFERENCE')

    // Verificar que las coverageIds pertenecen al tipo de seguro
    if (data.coverageIds.length > 0) {
      const validIds = new Set(insuranceType.coverages.map((c) => c.id))
      const invalid = data.coverageIds.filter((id) => !validIds.has(id))
      if (invalid.length > 0) {
        throw new AppError(
          400,
          'Una o más coberturas no pertenecen al tipo de seguro seleccionado',
          'INVALID_REFERENCE',
        )
      }
    }

    const policy = await prisma.policy.create({
      data,
      include: POLICY_DETAIL_INCLUDE,
    })

    const selectedCoverages = policy.insuranceType.coverages.filter((c) =>
      policy.coverageIds.includes(c.id),
    )

    return withStatus({ ...policy, selectedCoverages })
  },

  async update(id: string, data: UpdatePolicyDTO) {
    const policy = await prisma.policy.findUnique({ where: { id }, select: { id: true, insuranceTypeId: true, companyId: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    // Re-validar referencias que cambian — en paralelo
    const [insuranceTypeCheck, companyCheck, producerCheck] = await Promise.all([
      data.insuranceTypeId && data.insuranceTypeId !== policy.insuranceTypeId
        ? prisma.insuranceType.findFirst({ where: { id: data.insuranceTypeId, isActive: true }, select: { id: true } })
        : Promise.resolve(true),
      data.companyId && data.companyId !== policy.companyId
        ? prisma.company.findFirst({ where: { id: data.companyId, isActive: true }, select: { id: true } })
        : Promise.resolve(true),
      data.producerId
        ? prisma.producer.findFirst({ where: { id: data.producerId, isActive: true }, select: { id: true } })
        : Promise.resolve(true),
    ])

    if (!insuranceTypeCheck) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')
    if (!companyCheck) throw new AppError(400, 'Empresa no encontrada o inactiva', 'INVALID_REFERENCE')
    if (!producerCheck) throw new AppError(400, 'Productor no encontrado o inactivo', 'INVALID_REFERENCE')

    const updated = await prisma.policy.update({
      where: { id },
      data,
      include: POLICY_DETAIL_INCLUDE,
    })

    const selectedCoverages = updated.insuranceType.coverages.filter((c) =>
      updated.coverageIds.includes(c.id),
    )

    return withStatus({ ...updated, selectedCoverages })
  },

  async softDelete(id: string) {
    const policy = await prisma.policy.findUnique({ where: { id }, select: { id: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    return prisma.policy.update({ where: { id }, data: { isActive: false } })
  },

  // ── Attachments ──────────────────────────────────────────────────────────────

  async findAttachments(policyId: string) {
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    const attachments = await prisma.policyAttachment.findMany({
      where: { policyId },
      orderBy: { uploadedAt: 'desc' },
    })
    return attachments.map(mapAttachment)
  },

  async addAttachment(
    policyId: string,
    file: Express.Multer.File,
    meta: AddPolicyAttachmentDTO,
    uploadedBy: string,
  ) {
    const policy = await prisma.policy.findUnique({ where: { id: policyId } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    if (!isAllowedMimetype(file.mimetype)) {
      throw new AppError(415, 'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel, Word, video', 'UNSUPPORTED_MEDIA_TYPE')
    }

    if (!matchesDeclaredMimetype(file.buffer, file.mimetype)) {
      throw new AppError(415, 'El contenido del archivo no coincide con su tipo declarado', 'FILE_TYPE_MISMATCH')
    }

    let fileUrl = `local://${file.originalname}`
    let cloudinaryPublicId: string | null = null

    if (isCloudinaryConfigured()) {
      const result = await uploadToCloudinary(file.buffer, 'policies', file.mimetype)
      fileUrl = result.secure_url
      cloudinaryPublicId = result.public_id
    }

    try {
      const created = await prisma.policyAttachment.create({
        data: {
          policyId,
          name: sanitizeFileName(file.originalname),
          description: meta.description ?? null,
          fileType: detectFileType(file.mimetype),
          fileSize: formatFileSize(file.size),
          fileUrl,
          cloudinaryPublicId,
          expirationDate: meta.expirationDate ?? null,
          uploadedBy,
        },
      })
      return mapAttachment(created)
    } catch (err) {
      if (cloudinaryPublicId) await deleteFromCloudinary(cloudinaryPublicId).catch(() => undefined)
      throw err
    }
  },

  async deleteAttachment(policyId: string, attachmentId: string) {
    const attachment = await prisma.policyAttachment.findFirst({
      where: { id: attachmentId, policyId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (attachment.cloudinaryPublicId) {
      await deleteFromCloudinary(attachment.cloudinaryPublicId)
    }
    await prisma.policyAttachment.delete({ where: { id: attachmentId } })
  },

  async getAttachmentForDownload(policyId: string, attachmentId: string) {
    const attachment = await prisma.policyAttachment.findFirst({
      where: { id: attachmentId, policyId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    return attachment
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────

  async findTasks(policyId: string) {
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { id: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    return prisma.producerTask.findMany({
      where: { policyId },
      include: {
        producer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    })
  },
}
