import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { computePolicyStatus, buildPolicyStatusFilter } from '../../shared/utils/dates'
import { detectFileType, formatFileSize, isAllowedMimetype } from '../../shared/utils/files'
import type {
  CreatePolicyDTO,
  UpdatePolicyDTO,
  ListPoliciesQueryDTO,
  AddPolicyAttachmentDTO,
} from './policies.schemas'

const POLICY_LIST_INCLUDE = {
  insuranceType: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  producer: { select: { id: true, name: true } },
  _count: { select: { attachments: true, allocations: true } },
}

const POLICY_DETAIL_INCLUDE = {
  insuranceType: { include: { coverages: true } },
  company: true,
  producer: true,
  attachments: { orderBy: { uploadedAt: 'desc' as const } },
  _count: { select: { allocations: true } },
}

// Agrega el status computado a cada póliza
function withStatus<T extends { endDate: string }>(policy: T) {
  return { ...policy, status: computePolicyStatus(policy.endDate) }
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

    return buildPaginatedResponse(rawData.map(withStatus), total, { page, limit })
  },

  async findById(id: string) {
    const policy = await prisma.policy.findUnique({
      where: { id },
      include: POLICY_DETAIL_INCLUDE,
    })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    // Resuelve los coverageIds a objetos de cobertura
    const selectedCoverages = policy.insuranceType.coverages.filter((c) =>
      policy.coverageIds.includes(c.id),
    )

    return withStatus({ ...policy, selectedCoverages })
  },

  async create(data: CreatePolicyDTO) {
    // Verificar unicidad del número de póliza
    const exists = await prisma.policy.findUnique({ where: { policyNumber: data.policyNumber } })
    if (exists) throw new AppError(409, 'Ya existe una póliza con ese número', 'CONFLICT')

    // Verificar referencias
    const insuranceType = await prisma.insuranceType.findFirst({
      where: { id: data.insuranceTypeId, isActive: true },
      include: { coverages: true },
    })
    if (!insuranceType) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')

    const company = await prisma.company.findFirst({ where: { id: data.companyId, isActive: true } })
    if (!company) throw new AppError(400, 'Empresa no encontrada o inactiva', 'INVALID_REFERENCE')

    if (data.producerId) {
      const producer = await prisma.producer.findFirst({
        where: { id: data.producerId, isActive: true },
      })
      if (!producer) throw new AppError(400, 'Productor no encontrado o inactivo', 'INVALID_REFERENCE')
    }

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
    const policy = await prisma.policy.findUnique({ where: { id } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    // Re-validar referencias si cambian
    if (data.insuranceTypeId && data.insuranceTypeId !== policy.insuranceTypeId) {
      const insuranceType = await prisma.insuranceType.findFirst({
        where: { id: data.insuranceTypeId, isActive: true },
      })
      if (!insuranceType) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    if (data.companyId && data.companyId !== policy.companyId) {
      const company = await prisma.company.findFirst({ where: { id: data.companyId, isActive: true } })
      if (!company) throw new AppError(400, 'Empresa no encontrada o inactiva', 'INVALID_REFERENCE')
    }

    if (data.producerId) {
      const producer = await prisma.producer.findFirst({
        where: { id: data.producerId, isActive: true },
      })
      if (!producer) throw new AppError(400, 'Productor no encontrado o inactivo', 'INVALID_REFERENCE')
    }

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
    const policy = await prisma.policy.findUnique({ where: { id } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    return prisma.policy.update({ where: { id }, data: { isActive: false } })
  },

  // ── Attachments ──────────────────────────────────────────────────────────────

  async findAttachments(policyId: string) {
    const policy = await prisma.policy.findUnique({ where: { id: policyId } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    return prisma.policyAttachment.findMany({
      where: { policyId },
      orderBy: { uploadedAt: 'desc' },
    })
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
      throw new AppError(415, 'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel', 'UNSUPPORTED_MEDIA_TYPE')
    }

    return prisma.policyAttachment.create({
      data: {
        policyId,
        name: file.originalname,
        description: meta.description ?? null,
        fileType: detectFileType(file.mimetype),
        fileSize: formatFileSize(file.size),
        fileUrl: `pending://${file.originalname}`, // Phase 10: Cloudinary
        expirationDate: meta.expirationDate ?? null,
        notifyEmail: meta.notifyEmail || null,
        uploadedBy,
      },
    })
  },

  async deleteAttachment(policyId: string, attachmentId: string) {
    const attachment = await prisma.policyAttachment.findFirst({
      where: { id: attachmentId, policyId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    await prisma.policyAttachment.delete({ where: { id: attachmentId } })
  },
}
