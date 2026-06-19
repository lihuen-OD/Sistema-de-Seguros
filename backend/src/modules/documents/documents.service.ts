import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { detectFileType, formatFileSize, isAllowedMimetype } from '../../shared/utils/files'
import type {
  CreateDocumentDTO,
  UpdateDocumentDTO,
  ListDocumentsQueryDTO,
  UpdateInstallmentDTO,
  ReplaceInstallmentsDTO,
  ReplaceAllocationsDTO,
  AddDocumentAttachmentDTO,
} from './documents.schemas'

// ── Include shapes ────────────────────────────────────────────────────────────

const DOCUMENT_LIST_INCLUDE = {
  _count: { select: { installments: true, allocations: true, attachments: true } },
}

const DOCUMENT_DETAIL_INCLUDE = {
  installments: { orderBy: { installmentNumber: 'asc' as const } },
  allocations: {
    include: {
      policy: { select: { id: true, policyNumber: true, insuredName: true } },
    },
    orderBy: { allocationPercentage: 'desc' as const },
  },
  attachments: { orderBy: { uploadedAt: 'desc' as const } },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTotalAmount<T extends { netAmount: number; vatAmount: number; otherTaxesAmount: number }>(
  doc: T,
) {
  return {
    ...doc,
    totalAmount: +(doc.netAmount + doc.vatAmount + doc.otherTaxesAmount).toFixed(2),
  }
}

// Maps paymentDate → paidAt to match the frontend Installment type
function mapInstallment(inst: Record<string, unknown>) {
  const { paymentDate, ...rest } = inst
  return { ...rest, paidAt: paymentDate ?? null }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const documentsService = {
  async findAll(query: ListDocumentsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Record<string, unknown> = {}
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus
    if (query.documentType) where.documentType = query.documentType
    if (query.currency) where.currency = query.currency
    if (query.year) {
      const y = String(query.year)
      where.issueDate = { gte: `${y}-01-01`, lte: `${y}-12-31` }
    }
    if (query.search) {
      where.OR = [
        { documentNumber: { contains: query.search, mode: 'insensitive' } },
        { insuranceCompany: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [rawData, total] = await Promise.all([
      prisma.accountingDocument.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: DOCUMENT_LIST_INCLUDE,
      }),
      prisma.accountingDocument.count({ where }),
    ])

    return buildPaginatedResponse(rawData.map(withTotalAmount), total, { page, limit })
  },

  async findById(id: string) {
    const doc = await prisma.accountingDocument.findUnique({
      where: { id },
      include: DOCUMENT_DETAIL_INCLUDE,
    })
    if (!doc) throw new AppError(404, 'Documento no encontrado', 'NOT_FOUND')

    return {
      ...withTotalAmount(doc),
      installments: doc.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }
  },

  async create(data: CreateDocumentDTO) {
    const { installments, allocations, ...docData } = data

    const exists = await prisma.accountingDocument.findUnique({
      where: { documentNumber: docData.documentNumber },
    })
    if (exists) throw new AppError(409, 'Ya existe un documento con ese número', 'CONFLICT')

    if (allocations.length > 0) {
      await this.validatePolicyRefs(allocations.map((a) => a.policyId))
    }

    if (docData.linkedDocumentId) {
      await this.assertDocumentExists(docData.linkedDocumentId)
    }

    const doc = await prisma.accountingDocument.create({
      data: {
        ...docData,
        ...(installments.length > 0 && {
          installments: {
            create: installments.map((inst) => ({
              installmentNumber: inst.installmentNumber,
              dueDate: inst.dueDate,
              amount: inst.amount,
              currency: docData.currency,
            })),
          },
        }),
        ...(allocations.length > 0 && {
          allocations: {
            create: allocations.map((alloc) => ({
              policyId: alloc.policyId,
              allocatedAmount: alloc.allocatedAmount,
              allocationPercentage: alloc.allocationPercentage,
            })),
          },
        }),
      },
      include: DOCUMENT_DETAIL_INCLUDE,
    })

    return {
      ...withTotalAmount(doc),
      installments: doc.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }
  },

  async update(id: string, data: UpdateDocumentDTO) {
    const { installments: _i, allocations: _a, ...docData } = data

    await this.assertDocumentExists(id)

    if (docData.linkedDocumentId) {
      if (docData.linkedDocumentId === id) {
        throw new AppError(400, 'Un documento no puede vincularse a sí mismo', 'BAD_REQUEST')
      }
      await this.assertDocumentExists(docData.linkedDocumentId)
    }

    const updated = await prisma.accountingDocument.update({
      where: { id },
      data: docData,
      include: DOCUMENT_DETAIL_INCLUDE,
    })

    return {
      ...withTotalAmount(updated),
      installments: updated.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }
  },

  async delete(id: string) {
    await this.assertDocumentExists(id)
    // Cascade handled by Prisma (onDelete: Cascade on installments, allocations, attachments)
    await prisma.accountingDocument.delete({ where: { id } })
  },

  // ── Installments ──────────────────────────────────────────────────────────────

  async findInstallments(documentId: string) {
    await this.assertDocumentExists(documentId)
    const installments = await prisma.documentInstallment.findMany({
      where: { accountingDocumentId: documentId },
      orderBy: { installmentNumber: 'asc' },
    })
    return installments.map((i) => mapInstallment(i as Record<string, unknown>))
  },

  async replaceInstallments(documentId: string, data: ReplaceInstallmentsDTO) {
    const doc = await this.assertDocumentExists(documentId)

    await prisma.$transaction([
      prisma.documentInstallment.deleteMany({ where: { accountingDocumentId: documentId } }),
      ...(data.installments.length > 0
        ? [
            prisma.documentInstallment.createMany({
              data: data.installments.map((inst) => ({
                accountingDocumentId: documentId,
                installmentNumber: inst.installmentNumber,
                dueDate: inst.dueDate,
                amount: inst.amount,
                currency: doc.currency,
              })),
            }),
          ]
        : []),
    ])

    // When all installments are replaced, reset document to pendiente
    await prisma.accountingDocument.update({
      where: { id: documentId },
      data: { paymentStatus: 'pendiente' },
    })

    return this.findInstallments(documentId)
  },

  async updateInstallment(documentId: string, installmentId: string, data: UpdateInstallmentDTO) {
    const installment = await prisma.documentInstallment.findFirst({
      where: { id: installmentId, accountingDocumentId: documentId },
    })
    if (!installment) throw new AppError(404, 'Cuota no encontrada', 'NOT_FOUND')

    const updated = await prisma.documentInstallment.update({
      where: { id: installmentId },
      data,
    })

    await this.recalculateDocumentStatus(documentId)

    return mapInstallment(updated as Record<string, unknown>)
  },

  async recalculateDocumentStatus(documentId: string) {
    const installments = await prisma.documentInstallment.findMany({
      where: { accountingDocumentId: documentId },
      select: { paymentStatus: true },
    })

    if (installments.length === 0) return

    const paid = installments.filter((i) => i.paymentStatus === 'pagado').length
    const paymentStatus =
      paid === 0 ? 'pendiente' : paid === installments.length ? 'pagado' : 'parcial'

    await prisma.accountingDocument.update({
      where: { id: documentId },
      data: { paymentStatus },
    })
  },

  // ── Allocations ───────────────────────────────────────────────────────────────

  async findAllocations(documentId: string) {
    await this.assertDocumentExists(documentId)
    return prisma.documentPolicyAllocation.findMany({
      where: { accountingDocumentId: documentId },
      include: {
        policy: { select: { id: true, policyNumber: true, insuredName: true } },
      },
      orderBy: { allocationPercentage: 'desc' },
    })
  },

  async replaceAllocations(documentId: string, data: ReplaceAllocationsDTO) {
    await this.assertDocumentExists(documentId)

    if (data.allocations.length > 0) {
      await this.validatePolicyRefs(data.allocations.map((a) => a.policyId))
    }

    await prisma.$transaction([
      prisma.documentPolicyAllocation.deleteMany({ where: { accountingDocumentId: documentId } }),
      ...(data.allocations.length > 0
        ? [
            prisma.documentPolicyAllocation.createMany({
              data: data.allocations.map((a) => ({
                accountingDocumentId: documentId,
                policyId: a.policyId,
                allocatedAmount: a.allocatedAmount,
                allocationPercentage: a.allocationPercentage,
              })),
            }),
          ]
        : []),
    ])

    return this.findAllocations(documentId)
  },

  // ── Attachments ───────────────────────────────────────────────────────────────

  async findAttachments(documentId: string) {
    await this.assertDocumentExists(documentId)
    return prisma.documentAttachment.findMany({
      where: { accountingDocumentId: documentId },
      orderBy: { uploadedAt: 'desc' },
    })
  },

  async addAttachment(
    documentId: string,
    file: Express.Multer.File,
    meta: AddDocumentAttachmentDTO,
    uploadedBy: string,
  ) {
    await this.assertDocumentExists(documentId)

    if (!isAllowedMimetype(file.mimetype)) {
      throw new AppError(
        415,
        'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel',
        'UNSUPPORTED_MEDIA_TYPE',
      )
    }

    return prisma.documentAttachment.create({
      data: {
        accountingDocumentId: documentId,
        name: file.originalname,
        description: meta.description ?? null,
        fileType: detectFileType(file.mimetype),
        fileSize: formatFileSize(file.size),
        fileUrl: `pending://${file.originalname}`, // Phase 10: replaced by Cloudinary URL
        uploadedBy,
      },
    })
  },

  async deleteAttachment(documentId: string, attachmentId: string) {
    const attachment = await prisma.documentAttachment.findFirst({
      where: { id: attachmentId, accountingDocumentId: documentId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    await prisma.documentAttachment.delete({ where: { id: attachmentId } })
  },

  // ── Private ───────────────────────────────────────────────────────────────────

  async assertDocumentExists(id: string) {
    const doc = await prisma.accountingDocument.findUnique({ where: { id } })
    if (!doc) throw new AppError(404, 'Documento no encontrado', 'NOT_FOUND')
    return doc
  },

  async validatePolicyRefs(policyIds: string[]) {
    const found = await prisma.policy.findMany({
      where: { id: { in: policyIds }, isActive: true },
      select: { id: true },
    })
    if (found.length !== policyIds.length) {
      throw new AppError(
        400,
        'Una o más pólizas referenciadas no existen o están inactivas',
        'INVALID_REFERENCE',
      )
    }
  },
}
