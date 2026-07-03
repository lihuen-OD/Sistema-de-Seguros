import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { detectFileType, formatFileSize, isAllowedMimetype } from '../../shared/utils/files'
import { toDateStr } from '../../shared/utils/dates'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import {
  DOCUMENT_TYPES,
  ADJUSTMENT_REASONS,
  ENDORSEMENT_TYPES,
  ECONOMIC_IMPACT_TYPES,
  ENDORSEMENT_ALLOWED_LINKED_TYPES,
  getDocumentTypeDef,
  isValidAdjustmentReason,
  isValidEndorsementType,
  isValidEconomicImpactType,
  type DocumentTypeDef,
} from './document-types'
import { computeTotalAmount } from './document-amounts'
import { documentsBalanceService } from './documents-balance.service'
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

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIALLY_PAID: 'Parcialmente Pagada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  NOT_APPLICABLE: 'No Aplica',
}

const DOCUMENT_LIST_INCLUDE = {
  _count: { select: { installments: true, allocations: true, attachments: true } },
  allocations: { select: { policyId: true } },
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

// Include para análisis financiero: incluye installments y allocations en lista
const DOCUMENT_FINANCIAL_INCLUDE = {
  installments: {
    select: {
      id: true, accountingDocumentId: true, installmentNumber: true,
      dueDate: true, amount: true, currency: true, paymentStatus: true, paymentDate: true,
    },
    orderBy: { installmentNumber: 'asc' as const },
  },
  allocations: {
    select: {
      id: true, accountingDocumentId: true, policyId: true,
      allocatedAmount: true, allocationPercentage: true,
    },
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function withTotalAmount<T extends { netAmount: number; vatAmount: number; otherTaxesAmount: number }>(
  doc: T,
) {
  return {
    ...doc,
    totalAmount: computeTotalAmount(doc),
  }
}

// Maps paymentDate → paidAt y normaliza fechas a YYYY-MM-DD
function mapInstallment(inst: Record<string, unknown>) {
  const { paymentDate, dueDate, ...rest } = inst
  return {
    ...rest,
    dueDate: toDateStr(dueDate as Date | string),
    paidAt: paymentDate ? toDateStr(paymentDate as Date | string) : null,
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const documentsService = {
  getTypes() {
    return {
      types: Object.values(DOCUMENT_TYPES),
      adjustmentReasons: Object.entries(ADJUSTMENT_REASONS).map(([key, label]) => ({ key, label })),
      endorsementTypes: Object.entries(ENDORSEMENT_TYPES).map(([key, label]) => ({ key, label })),
      economicImpactTypes: Object.entries(ECONOMIC_IMPACT_TYPES).map(([key, label]) => ({ key, label })),
    }
  },

  async findAll(query: ListDocumentsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Record<string, unknown> = {}
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus
    if (query.documentType) where.documentType = query.documentType
    if (query.currency) where.currency = query.currency
    if (query.year) {
      const y = String(query.year)
      where.issueDate = {
        gte: new Date(`${y}-01-01T00:00:00.000Z`),
        lte: new Date(`${y}-12-31T00:00:00.000Z`),
      }
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

  async findAllForFinancial(params?: { from?: string; to?: string }) {
    // Excluye documentos anulados — este endpoint solo lo consumen Análisis
    // Financiero y Análisis Económico, y un documento CANCELLED nunca debe
    // impactar esos reportes.
    const where: Record<string, unknown> = { documentStatus: { not: 'CANCELLED' } }
    if (params?.from || params?.to) {
      where.issueDate = {
        ...(params.from && { gte: new Date(`${params.from}-01T00:00:00.000Z`) }),
        ...(params.to && { lte: new Date(`${params.to}-31T23:59:59.999Z`) }),
      }
    }
    const docs = await prisma.accountingDocument.findMany({
      where,
      orderBy: { issueDate: 'asc' },
      include: DOCUMENT_FINANCIAL_INCLUDE,
      take: 2000,
    })
    return docs.map((doc) => ({
      ...withTotalAmount(doc),
      installments: doc.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }))
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

  async create(data: CreateDocumentDTO, performedBy?: string) {
    const { installments, allocations, ...docData } = data

    if (allocations.length > 0) {
      await this.validatePolicyRefs(allocations.map((a) => a.policyId))
    }

    const typeDef = getDocumentTypeDef(docData.documentType)
    if (!typeDef) throw new AppError(400, 'Tipo de documento inválido', 'BAD_REQUEST')

    await this.validateTypeConstraints(typeDef, docData)

    // El estado inicial y la relación con el documento vinculado los define
    // el tipo, no el cliente — evita que se puedan crear documentos que
    // arrancan ya APPLIED/CANCELLED o con un relationType inconsistente.
    const doc = await prisma.accountingDocument.create({
      data: {
        ...docData,
        documentStatus: 'ISSUED',
        relationType: typeDef.relationType ?? null,
        paymentStatus: typeDef.hasPaymentStatus ? 'PENDING' : 'NOT_APPLICABLE',
        ...(installments.length > 0 && typeDef.hasInstallments && {
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

    await this.recordAudit(doc.id, {
      action: 'CREATE',
      description: `${typeDef.label} creada`,
      newData: {
        documentType: doc.documentType,
        documentStatus: doc.documentStatus,
        paymentStatus: doc.paymentStatus,
        netAmount: doc.netAmount,
        vatAmount: doc.vatAmount,
        otherTaxesAmount: doc.otherTaxesAmount,
        currency: doc.currency,
        linkedDocumentId: doc.linkedDocumentId,
      },
      performedBy,
    })

    return {
      ...withTotalAmount(doc),
      installments: doc.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }
  },

  async update(id: string, data: UpdateDocumentDTO, performedBy?: string) {
    const { installments: _i, allocations: _a, ...docData } = data

    const existing = await this.assertDocumentExists(id)

    if (existing.documentStatus === 'APPLIED') {
      throw new AppError(
        400,
        'No se puede editar un documento aplicado. Cancelalo primero si necesitás corregirlo.',
        'BAD_REQUEST',
      )
    }

    const effectiveType = docData.documentType ?? existing.documentType
    const typeDef = getDocumentTypeDef(effectiveType)
    if (!typeDef) throw new AppError(400, 'Tipo de documento inválido', 'BAD_REQUEST')

    const effectiveLinkedId =
      docData.linkedDocumentId !== undefined ? docData.linkedDocumentId : existing.linkedDocumentId
    const effectiveAdjustmentReason =
      docData.adjustmentReason !== undefined ? docData.adjustmentReason : existing.adjustmentReason
    const effectiveAdjustmentSign =
      docData.adjustmentSign !== undefined ? docData.adjustmentSign : existing.adjustmentSign
    const effectivePolicyId =
      docData.policyId !== undefined ? docData.policyId : existing.policyId
    const effectiveEconomicImpactType =
      docData.economicImpactType !== undefined ? docData.economicImpactType : existing.economicImpactType
    const effectiveEndorsementType =
      docData.endorsementType !== undefined ? docData.endorsementType : existing.endorsementType
    const effectiveNetAmount = docData.netAmount !== undefined ? docData.netAmount : existing.netAmount
    const effectiveVatAmount = docData.vatAmount !== undefined ? docData.vatAmount : existing.vatAmount
    const effectiveOtherTaxesAmount =
      docData.otherTaxesAmount !== undefined ? docData.otherTaxesAmount : existing.otherTaxesAmount

    await this.validateTypeConstraints(
      typeDef,
      {
        linkedDocumentId: effectiveLinkedId,
        adjustmentReason: effectiveAdjustmentReason,
        adjustmentSign: effectiveAdjustmentSign,
        policyId: effectivePolicyId,
        economicImpactType: effectiveEconomicImpactType,
        endorsementType: effectiveEndorsementType,
        netAmount: effectiveNetAmount,
        vatAmount: effectiveVatAmount,
        otherTaxesAmount: effectiveOtherTaxesAmount,
      },
      id,
    )

    const documentStatus = docData.documentStatus ?? existing.documentStatus
    if (!typeDef.documentStatusOptions.includes(documentStatus as (typeof typeDef.documentStatusOptions)[number])) {
      throw new AppError(400, 'Estado de documento inválido para este tipo', 'BAD_REQUEST')
    }

    const updated = await prisma.accountingDocument.update({
      where: { id },
      data: {
        ...docData,
        relationType: typeDef.relationType ?? null,
        ...(!typeDef.hasPaymentStatus && { paymentStatus: 'NOT_APPLICABLE' }),
      },
      include: DOCUMENT_DETAIL_INCLUDE,
    })

    await this.recordAudit(id, {
      action: 'UPDATE',
      description: 'Documento actualizado',
      previousData: {
        documentType: existing.documentType,
        linkedDocumentId: existing.linkedDocumentId,
        netAmount: existing.netAmount,
        vatAmount: existing.vatAmount,
        otherTaxesAmount: existing.otherTaxesAmount,
      },
      newData: {
        documentType: updated.documentType,
        linkedDocumentId: updated.linkedDocumentId,
        netAmount: updated.netAmount,
        vatAmount: updated.vatAmount,
        otherTaxesAmount: updated.otherTaxesAmount,
      },
      performedBy,
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

  // ── Ciclo de aplicación (Fase 2) ─────────────────────────────────────────────

  async apply(id: string, performedBy?: string) {
    const doc = await this.assertDocumentExists(id)
    const typeDef = getDocumentTypeDef(doc.documentType)
    if (!typeDef) throw new AppError(400, 'Tipo de documento inválido', 'BAD_REQUEST')

    if (!typeDef.documentStatusOptions.includes('APPLIED')) {
      throw new AppError(400, 'Este tipo de documento no admite ser aplicado', 'BAD_REQUEST')
    }
    if (doc.documentStatus === 'APPLIED') {
      throw new AppError(409, 'El documento ya está aplicado', 'CONFLICT')
    }
    if (doc.documentStatus === 'CANCELLED') {
      throw new AppError(400, 'No se puede aplicar un documento anulado', 'BAD_REQUEST')
    }

    let negativeAllocations: { policyId: string; allocatedAmount: number; allocationPercentage: number }[] = []

    if (doc.documentType === 'CREDIT_NOTE' && doc.linkedDocumentId) {
      const balance = await documentsBalanceService.getBalance(doc.linkedDocumentId)
      const creditAmount = Math.abs(computeTotalAmount(doc))
      if (creditAmount > balance.effectiveAmount) {
        throw new AppError(400, 'La Nota de Crédito supera el saldo disponible de la factura', 'BAD_REQUEST')
      }

      // Genera asignaciones negativas proporcionales a la distribución de la
      // factura vinculada, para que los reportes por póliza reflejen el neto.
      // Si la factura no tiene asignaciones, se aplica igual sin crear ninguna
      // (queda pendiente de distribución manual — limitación conocida de Fase 3).
      const invoiceAllocations = await prisma.documentPolicyAllocation.findMany({
        where: { accountingDocumentId: doc.linkedDocumentId },
      })
      negativeAllocations = invoiceAllocations.map((a) => ({
        policyId: a.policyId,
        allocatedAmount: -(creditAmount * (a.allocationPercentage / 100)),
        allocationPercentage: a.allocationPercentage,
      }))
    }

    if (doc.documentType === 'CREDIT_NOTE') {
      await prisma.$transaction([
        prisma.documentPolicyAllocation.deleteMany({ where: { accountingDocumentId: id } }),
        ...(negativeAllocations.length > 0
          ? [
              prisma.documentPolicyAllocation.createMany({
                data: negativeAllocations.map((a) => ({ ...a, accountingDocumentId: id })),
              }),
            ]
          : []),
      ])
    }

    const updated = await prisma.accountingDocument.update({
      where: { id },
      data: { documentStatus: 'APPLIED' },
      include: DOCUMENT_DETAIL_INCLUDE,
    })

    await this.recordAudit(id, {
      action: 'APPLY',
      description: `${typeDef.label} aplicada`,
      previousData: { documentStatus: 'ISSUED' },
      newData: { documentStatus: 'APPLIED' },
      performedBy,
    })

    return {
      ...withTotalAmount(updated),
      installments: updated.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }
  },

  async cancel(id: string, performedBy?: string, reason?: string) {
    const doc = await this.assertDocumentExists(id)

    if (doc.documentStatus === 'CANCELLED') {
      throw new AppError(409, 'El documento ya está anulado', 'CONFLICT')
    }

    const updated = await prisma.accountingDocument.update({
      where: { id },
      data: { documentStatus: 'CANCELLED' },
      include: DOCUMENT_DETAIL_INCLUDE,
    })

    await this.recordAudit(id, {
      action: 'CANCEL',
      description: reason ? `Documento anulado: ${reason}` : 'Documento anulado',
      previousData: { documentStatus: doc.documentStatus },
      newData: { documentStatus: 'CANCELLED' },
      performedBy,
      reason,
    })

    return {
      ...withTotalAmount(updated),
      installments: updated.installments.map((i) => mapInstallment(i as Record<string, unknown>)),
    }
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

  async findInstallmentsBulk(documentIds: string[]) {
    const installments = await prisma.documentInstallment.findMany({
      where: { accountingDocumentId: { in: documentIds } },
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

    // When all installments are replaced, reset document to pending
    await prisma.accountingDocument.update({
      where: { id: documentId },
      data: { paymentStatus: 'PENDING' },
    })

    const installments = await prisma.documentInstallment.findMany({
      where: { accountingDocumentId: documentId },
      orderBy: { installmentNumber: 'asc' },
    })
    return installments.map((i) => mapInstallment(i as Record<string, unknown>))
  },

  async updateInstallment(documentId: string, installmentId: string, data: UpdateInstallmentDTO, performedBy?: string) {
    const installment = await prisma.documentInstallment.findFirst({
      where: { id: installmentId, accountingDocumentId: documentId },
    })
    if (!installment) throw new AppError(404, 'Cuota no encontrada', 'NOT_FOUND')

    const updated = await prisma.documentInstallment.update({
      where: { id: installmentId },
      data,
    })

    await this.recalculateDocumentStatus(documentId)

    if (data.paymentStatus && data.paymentStatus !== installment.paymentStatus) {
      await this.recordAudit(documentId, {
        action: 'PAYMENT_CHANGE',
        description: `Cuota ${installment.installmentNumber} marcada como ${PAYMENT_STATUS_LABELS[data.paymentStatus] ?? data.paymentStatus}`,
        previousData: { paymentStatus: installment.paymentStatus },
        newData: { paymentStatus: data.paymentStatus },
        performedBy,
      })
    }

    return mapInstallment(updated as Record<string, unknown>)
  },

  async recalculateDocumentStatus(documentId: string) {
    const installments = await prisma.documentInstallment.findMany({
      where: { accountingDocumentId: documentId },
      select: { paymentStatus: true },
    })

    if (installments.length === 0) return

    const paid = installments.filter((i) => i.paymentStatus === 'PAID').length
    const paymentStatus =
      paid === 0 ? 'PENDING' : paid === installments.length ? 'PAID' : 'PARTIALLY_PAID'

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

  async findAllocationsBulk(documentIds: string[]) {
    return prisma.documentPolicyAllocation.findMany({
      where: { accountingDocumentId: { in: documentIds } },
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

    return prisma.documentPolicyAllocation.findMany({
      where: { accountingDocumentId: documentId },
      include: {
        policy: { select: { id: true, policyNumber: true, insuredName: true } },
      },
      orderBy: { allocationPercentage: 'desc' },
    })
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

    let fileUrl = `local://${file.originalname}`
    let cloudinaryPublicId: string | null = null

    if (isCloudinaryConfigured()) {
      const result = await uploadToCloudinary(file.buffer, 'documents')
      fileUrl = result.secure_url
      cloudinaryPublicId = result.public_id
    }

    try {
      return await prisma.documentAttachment.create({
        data: {
          accountingDocumentId: documentId,
          name: file.originalname,
          description: meta.description ?? null,
          fileType: detectFileType(file.mimetype),
          fileSize: formatFileSize(file.size),
          fileUrl,
          cloudinaryPublicId,
          uploadedBy,
        },
      })
    } catch (err) {
      if (cloudinaryPublicId) await deleteFromCloudinary(cloudinaryPublicId).catch(() => undefined)
      throw err
    }
  },

  async deleteAttachment(documentId: string, attachmentId: string) {
    const attachment = await prisma.documentAttachment.findFirst({
      where: { id: attachmentId, accountingDocumentId: documentId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (attachment.cloudinaryPublicId) {
      await deleteFromCloudinary(attachment.cloudinaryPublicId)
    }
    await prisma.documentAttachment.delete({ where: { id: attachmentId } })
  },

  // ── Auditoría (Fase 4) ────────────────────────────────────────────────────────

  async getAuditLog(documentId: string) {
    await this.assertDocumentExists(documentId)
    return prisma.documentAuditLog.findMany({
      where: { accountingDocumentId: documentId },
      orderBy: { createdAt: 'desc' },
    })
  },

  async recordAudit(
    accountingDocumentId: string,
    entry: {
      action: string
      description: string
      previousData?: Record<string, unknown>
      newData?: Record<string, unknown>
      performedBy?: string
      reason?: string
    },
  ) {
    await prisma.documentAuditLog.create({
      data: {
        accountingDocumentId,
        action: entry.action,
        description: entry.description,
        previousData: entry.previousData as Prisma.InputJsonValue | undefined,
        newData: entry.newData as Prisma.InputJsonValue | undefined,
        performedBy: entry.performedBy ?? null,
        reason: entry.reason ?? null,
      },
    })
  },

  // ── Private ───────────────────────────────────────────────────────────────────

  async assertDocumentExists(id: string) {
    const doc = await prisma.accountingDocument.findUnique({
      where: { id },
      select: {
        id: true,
        documentNumber: true,
        currency: true,
        documentType: true,
        documentStatus: true,
        linkedDocumentId: true,
        adjustmentReason: true,
        adjustmentSign: true,
        netAmount: true,
        vatAmount: true,
        otherTaxesAmount: true,
        policyId: true,
        economicImpactType: true,
        endorsementType: true,
      },
    })
    if (!doc) throw new AppError(404, 'Documento no encontrado', 'NOT_FOUND')
    return doc
  },

  async validateTypeConstraints(
    typeDef: DocumentTypeDef,
    input: {
      linkedDocumentId?: string | null
      adjustmentReason?: string | null
      adjustmentSign?: string | null
      policyId?: string | null
      economicImpactType?: string | null
      endorsementType?: string | null
      netAmount?: number
      vatAmount?: number
      otherTaxesAmount?: number
    },
    selfId?: string,
  ) {
    if (typeDef.requiresLinkedDocument && !input.linkedDocumentId) {
      throw new AppError(
        400,
        `${typeDef.linkedDocumentLabel ?? 'El documento vinculado'} es requerido para este tipo de documento`,
        'BAD_REQUEST',
      )
    }

    if (input.linkedDocumentId) {
      if (selfId && input.linkedDocumentId === selfId) {
        throw new AppError(400, 'Un documento no puede vincularse a sí mismo', 'BAD_REQUEST')
      }
      const linked = await this.assertDocumentExists(input.linkedDocumentId)
      if (linked.documentStatus === 'CANCELLED') {
        throw new AppError(400, 'El documento vinculado está anulado', 'BAD_REQUEST')
      }
      if (typeDef.linkedDocumentType && linked.documentType !== typeDef.linkedDocumentType) {
        const expectedLabel = DOCUMENT_TYPES[typeDef.linkedDocumentType]?.label ?? typeDef.linkedDocumentType
        throw new AppError(400, `El documento vinculado debe ser de tipo ${expectedLabel}`, 'BAD_REQUEST')
      }
      // Excepción deliberada para Endoso: el tipo admitido del documento
      // asociado depende del impacto económico elegido (aumenta → Factura/ND,
      // reduce → NC), no de un linkedDocumentType fijo como el resto de tipos.
      if (typeDef.key === 'ENDORSEMENT' && input.economicImpactType) {
        const allowed = ENDORSEMENT_ALLOWED_LINKED_TYPES[input.economicImpactType]
        if (allowed && !allowed.includes(linked.documentType)) {
          const labels = allowed.map((t) => DOCUMENT_TYPES[t]?.label ?? t).join(' o ')
          throw new AppError(400, `El documento asociado debe ser ${labels}`, 'BAD_REQUEST')
        }
      }
    }

    if (typeDef.requiresAdjustmentReason) {
      if (!input.adjustmentReason || !isValidAdjustmentReason(input.adjustmentReason)) {
        throw new AppError(400, 'El motivo de ajuste es requerido y debe ser válido', 'BAD_REQUEST')
      }
    }

    if (typeDef.requiresAdjustmentSign) {
      if (input.adjustmentSign !== 'POSITIVE' && input.adjustmentSign !== 'NEGATIVE') {
        throw new AppError(400, 'El signo de ajuste es requerido para este tipo de documento', 'BAD_REQUEST')
      }
    }

    if (typeDef.requiresPolicy && !input.policyId) {
      throw new AppError(400, 'La póliza asociada es requerida para este tipo de documento', 'BAD_REQUEST')
    }
    if (input.policyId) {
      await this.validatePolicyRefs([input.policyId])
    }

    if (typeDef.requiresEconomicImpactType && !isValidEconomicImpactType(input.economicImpactType ?? '')) {
      throw new AppError(400, 'El impacto económico es requerido y debe ser válido', 'BAD_REQUEST')
    }

    if (input.endorsementType && !isValidEndorsementType(input.endorsementType)) {
      throw new AppError(400, 'Tipo de endoso inválido', 'BAD_REQUEST')
    }

    if (
      !typeDef.hasOwnAmounts &&
      ((input.netAmount ?? 0) !== 0 || (input.vatAmount ?? 0) !== 0 || (input.otherTaxesAmount ?? 0) !== 0)
    ) {
      throw new AppError(400, 'Este tipo de documento no admite importes propios', 'BAD_REQUEST')
    }
  },

  async checkDocumentNumber(documentNumber: string) {
    const existing = await prisma.accountingDocument.findFirst({
      where: { documentNumber },
      select: { id: true },
    })
    return { exists: !!existing }
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
