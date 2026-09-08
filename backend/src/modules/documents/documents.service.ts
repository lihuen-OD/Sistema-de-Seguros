import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { detectFileType, formatFileSize, sanitizeFileName } from '../../shared/utils/files'
import { toDateStr } from '../../shared/utils/dates'
import { deleteFromCloudinary } from '../../config/cloudinary'
import { validateAndUploadAttachment, withAttachmentRollback } from '../../shared/services/attachment-upload.service'
import {
  DOCUMENT_TYPES,
  ADJUSTMENT_REASONS,
  ENDORSEMENT_TYPES,
  ECONOMIC_IMPACT_TYPES,
  getDocumentTypeDef,
  isValidAdjustmentReason,
  isValidEndorsementType,
  isValidEconomicImpactType,
  type DocumentTypeDef,
} from './document-types'
import { computeTotalAmount } from './document-amounts'
import { computeDualAmounts } from '../../shared/utils/currency'
import { documentsBalanceService } from './documents-balance.service'
import { emailService } from '../email/email.service'
import { resolveEmailAttachments } from '../email/email-attachments'
import { assetsService } from '../assets/assets.service'
import type { EmailActor } from '../email/email.types'
import type { ManualDocumentEmailData, ManualDocumentCostCenterGroup } from '../email/email.templates'
import type {
  CreateDocumentDTO,
  UpdateDocumentDTO,
  ListDocumentsQueryDTO,
  UpdateInstallmentDTO,
  ReplaceInstallmentsDTO,
  ReplaceAllocationsDTO,
  AddDocumentAttachmentDTO,
  SendDocumentEmailDTO,
} from './documents.schemas'

// ── Include shapes ────────────────────────────────────────────────────────────

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendiente',
  PARTIALLY_PAID: 'Parcialmente Pagada',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  NOT_APPLICABLE: 'No Aplica',
}

// Tipos que hoy afectan el "saldo" calculado de una factura vinculada
// (documents-balance.service.ts) — al aplicarlos, además, se reparte su monto
// entre las cuotas no pagas de esa factura (ver apply()/cancel()). Ninguno de
// estos tiene cuotas propias (ver hasInstallments en document-types.ts) —
// solo la Factura las tiene.
const INSTALLMENT_ADJUSTING_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT_ENTRY', 'ENDORSEMENT']

// La asignación apunta a una línea de cobertura (policyAssetCoverageId), no
// directo a la póliza — policyId/assetId de acá abajo son un espejo
// denormalizado para no obligar a todos los consumidores (frontend incluido)
// a resolver el join ellos mismos. Ver mapAllocation().
const ALLOCATION_COVERAGE_SELECT = {
  policyId: true,
  assetId: true,
  policy: { select: { id: true, policyNumber: true, insuredName: true } },
  asset: {
    select: {
      id: true, name: true, code: true, assetType: true, fixedAssetCode: true,
      metadata: true, brand: true, model: true,
      fixedAsset: { select: { name: true } },
    },
  },
}

const DOCUMENT_LIST_INCLUDE = {
  _count: { select: { installments: true, allocations: true, attachments: true } },
  allocations: {
    select: {
      id: true, accountingDocumentId: true, policyAssetCoverageId: true,
      allocatedAmount: true, allocationPercentage: true,
      policyAssetCoverage: { select: { policyId: true, assetId: true } },
    },
  },
}

const DOCUMENT_DETAIL_INCLUDE = {
  installments: { orderBy: { installmentNumber: 'asc' as const } },
  allocations: {
    include: { policyAssetCoverage: { select: ALLOCATION_COVERAGE_SELECT } },
    orderBy: { allocationPercentage: 'desc' as const },
  },
  attachments: { orderBy: { uploadedAt: 'desc' as const } },
}

// Include para análisis financiero: incluye installments y allocations en lista
const DOCUMENT_FINANCIAL_INCLUDE = {
  installments: {
    select: {
      id: true, accountingDocumentId: true, installmentNumber: true,
      dueDate: true, amount: true, currency: true, amountArs: true, amountUsd: true,
      paymentStatus: true, paymentDate: true, paymentMethod: true,
    },
    orderBy: { installmentNumber: 'asc' as const },
  },
  allocations: {
    select: {
      id: true, accountingDocumentId: true, policyAssetCoverageId: true,
      allocatedAmount: true, allocationPercentage: true,
      policyAssetCoverage: { select: { policyId: true, assetId: true } },
    },
  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Permite pasar el cliente de una transacción (tx) a recordAudit/
// recalculateDocumentStatus para que la escritura financiera y su rastro de
// auditoría (o el recálculo de paymentStatus) sean atómicos.
type DocClient = typeof prisma | Prisma.TransactionClient

function withTotalAmount<T extends { netAmount: number; vatAmount: number; otherTaxesAmount: number }>(
  doc: T,
) {
  return {
    ...doc,
    totalAmount: computeTotalAmount(doc),
  }
}

// Aplana policyAssetCoverage.{policyId,assetId,policy,asset} al nivel de la
// asignación — así el frontend no tiene que resolver el join él mismo para
// saber a qué póliza/activo corresponde cada fila. El constraint lista todos
// los campos propios de la fila (no solo policyAssetCoverage) a propósito:
// así ReturnType<typeof mapAllocation> (usado en mapDocumentDetail) refleja
// la fila real completa, no solo lo mínimo que exige el constraint.
function mapAllocation<T extends {
  id: string
  accountingDocumentId: string
  policyAssetCoverageId: string
  allocatedAmount: number
  allocationPercentage: number
  policyAssetCoverage: {
    policyId: string
    assetId: string | null
    policy?: { id: string; policyNumber: string; insuredName: string }
    asset?: {
      id: string; name: string; code: string | null; assetType: string; fixedAssetCode: string | null
      metadata: unknown; brand: string | null; model: string | null
      fixedAsset: { name: string } | null
    } | null
  }
}>(allocation: T) {
  const { policyAssetCoverage, ...rest } = allocation
  return {
    ...rest,
    policyId: policyAssetCoverage.policyId,
    assetId: policyAssetCoverage.assetId,
    ...(policyAssetCoverage.policy && { policy: policyAssetCoverage.policy }),
    ...(policyAssetCoverage.asset !== undefined && { asset: policyAssetCoverage.asset }),
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

// Shape completo devuelto por find/create/update/apply/cancel (todos usan
// DOCUMENT_DETAIL_INCLUDE) — total, cuotas e imputaciones ya mapeadas.
function mapDocumentDetail<T extends {
  netAmount: number; vatAmount: number; otherTaxesAmount: number
  installments: Record<string, unknown>[]
  allocations: Parameters<typeof mapAllocation>[0][]
}>(doc: T): Omit<T, 'installments' | 'allocations'> & {
  totalAmount: number
  installments: ReturnType<typeof mapInstallment>[]
  allocations: ReturnType<typeof mapAllocation>[]
} {
  return {
    ...withTotalAmount(doc),
    installments: doc.installments.map((i) => mapInstallment(i)),
    allocations: doc.allocations.map((a) => mapAllocation(a)),
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

    return buildPaginatedResponse(
      rawData.map((doc) => ({
        ...withTotalAmount(doc),
        allocations: doc.allocations.map((a) => ({
          id: a.id,
          accountingDocumentId: a.accountingDocumentId,
          policyAssetCoverageId: a.policyAssetCoverageId,
          policyId: a.policyAssetCoverage.policyId,
          assetId: a.policyAssetCoverage.assetId,
          allocatedAmount: a.allocatedAmount,
          allocationPercentage: a.allocationPercentage,
        })),
      })),
      total,
      { page, limit },
    )
  },

  async findAllForFinancial(params?: { from?: string; to?: string }) {
    // Excluye documentos anulados — este endpoint solo lo consumen Análisis
    // Financiero y Análisis Económico, y un documento CANCELLED nunca debe
    // impactar esos reportes.
    const where: Record<string, unknown> = { documentStatus: { not: 'CANCELLED' } }
    if (params?.from || params?.to) {
      const range = {
        ...(params.from && { gte: new Date(`${params.from}-01T00:00:00.000Z`) }),
        ...(params.to && (() => {
          const [year, month] = params.to.split('-').map(Number)
          return { lt: new Date(Date.UTC(year, month, 1)) }
        })()),
      }
      // Siempre por fecha de vencimiento de la cuota, esté pagada o no — el
      // Análisis Financiero posiciona cada cuota por cuándo correspondía
      // vencer, nunca por cuándo se terminó pagando (ver
      // getInstallmentEffectiveDate en FinancialAnalysisPage.tsx).
      where.installments = { some: { dueDate: range } }
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
      allocations: doc.allocations.map((a) => ({
        id: a.id,
        accountingDocumentId: a.accountingDocumentId,
        policyAssetCoverageId: a.policyAssetCoverageId,
        policyId: a.policyAssetCoverage.policyId,
        assetId: a.policyAssetCoverage.assetId,
        allocatedAmount: a.allocatedAmount,
        allocationPercentage: a.allocationPercentage,
      })),
    }))
  },

  async findById(id: string) {
    const doc = await prisma.accountingDocument.findUnique({
      where: { id },
      include: DOCUMENT_DETAIL_INCLUDE,
    })
    if (!doc) throw new AppError(404, 'Documento no encontrado', 'NOT_FOUND')

    return mapDocumentDetail(doc)
  },

  async create(data: CreateDocumentDTO, performedBy?: string) {
    const { installments, allocations, ...docData } = data

    if (allocations.length > 0) {
      await this.validateCoverageRefs(allocations.map((a) => a.policyAssetCoverageId))
    }

    const typeDef = getDocumentTypeDef(docData.documentType)
    if (!typeDef) throw new AppError(400, 'Tipo de documento inválido', 'BAD_REQUEST')

    const inherited = await this.validateTypeConstraints(typeDef, docData)
    const effectivePaymentMethod =
      inherited.paymentMethod ?? (docData.paymentMethod?.trim() || null)
    const effectiveCurrency = (inherited.currency ?? docData.currency) as 'ARS' | 'USD'
    const effectiveExchangeRate = inherited.exchangeRate ?? docData.exchangeRate

    if (installments.length > 0 && typeDef.hasInstallments) {
      this.assertInstallmentsMatchTotal(installments, computeTotalAmount(docData))
    }

    // El duplicado real es la combinación tipo + compañía + número
    // (documentNumber es inmutable después del alta, así que este chequeo
    // solo aplica en create). Este pre-chequeo da un mensaje claro en el
    // caso común; el @@unique de schema.prisma (mismas 3 columnas) es la
    // garantía real ante dos altas concurrentes — el catch de P2002 más
    // abajo la traduce al mismo error 409 en vez de un 500 genérico.
    const duplicate = await prisma.accountingDocument.findFirst({
      where: {
        documentNumber: docData.documentNumber,
        documentType: docData.documentType,
        insuranceCompany: docData.insuranceCompany ?? null,
      },
      select: { id: true },
    })
    if (duplicate) {
      throw new AppError(
        409,
        'Ya existe un documento del mismo tipo y compañía con ese número',
        'CONFLICT',
      )
    }

    // El estado inicial y la relación con el documento vinculado los define
    // el tipo, no el cliente — evita que se puedan crear documentos que
    // arrancan ya APPLIED/CANCELLED o con un relationType inconsistente.
    // Create + audit log en una sola transacción: si el audit log fallara,
    // no debe quedar un documento creado sin su rastro de auditoría.
    // Cierre en ambas monedas al momento de guardar (ver computeDualAmounts) —
    // única fuente de verdad para Dashboard y Análisis Financiero/Económico,
    // que suman por columna (Ars/Usd) en vez de reconvertir al mostrar.
    const { amountArs: totalAmountArs, amountUsd: totalAmountUsd } = computeDualAmounts(
      computeTotalAmount(docData),
      effectiveCurrency,
      effectiveExchangeRate,
    )

    let doc
    try {
      doc = await prisma.$transaction(async (tx) => {
        const created = await tx.accountingDocument.create({
          data: {
            ...docData,
            currency: effectiveCurrency,
            exchangeRate: effectiveExchangeRate,
            paymentMethod: effectivePaymentMethod,
            documentStatus: 'ISSUED',
            relationType: typeDef.relationType ?? null,
            paymentStatus: typeDef.hasPaymentStatus ? 'PENDING' : 'NOT_APPLICABLE',
            totalAmountArs,
            totalAmountUsd,
            ...(installments.length > 0 && typeDef.hasInstallments && {
              installments: {
                create: installments.map((inst) => ({
                  installmentNumber: inst.installmentNumber,
                  dueDate: inst.dueDate,
                  amount: inst.amount,
                  currency: docData.currency,
                  paymentMethod: effectivePaymentMethod,
                  ...computeDualAmounts(inst.amount, docData.currency as 'ARS' | 'USD', docData.exchangeRate),
                })),
              },
            }),
            ...(allocations.length > 0 && {
              allocations: {
                create: allocations.map((alloc) => ({
                  policyAssetCoverageId: alloc.policyAssetCoverageId,
                  allocatedAmount: alloc.allocatedAmount,
                  allocationPercentage: alloc.allocationPercentage,
                })),
              },
            }),
          },
          include: DOCUMENT_DETAIL_INCLUDE,
        })

        await this.recordAudit(created.id, {
          action: 'CREATE',
          description: `${typeDef.label} creada`,
          newData: {
            documentType: created.documentType,
            documentStatus: created.documentStatus,
            paymentStatus: created.paymentStatus,
            paymentMethod: created.paymentMethod,
            netAmount: created.netAmount,
            vatAmount: created.vatAmount,
            otherTaxesAmount: created.otherTaxesAmount,
            currency: created.currency,
            linkedDocumentId: created.linkedDocumentId,
          },
          performedBy,
        }, tx)

        return created
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          409,
          'Ya existe un documento del mismo tipo y compañía con ese número',
          'CONFLICT',
        )
      }
      throw err
    }

    return mapDocumentDetail(doc)
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

    const effectiveDocumentNumber = docData.documentNumber ?? existing.documentNumber
    const effectiveInsuranceCompany =
      docData.insuranceCompany !== undefined ? docData.insuranceCompany : existing.insuranceCompany

    // Mismo pre-chequeo que create() (ver comentario ahí) — el número de
    // documento dejó de ser inmutable (puede corregirse un typo después del
    // alta), así que el duplicado tipo+compañía+número hay que revalidarlo
    // acá también. Excluye el propio id: comparar el documento contra sí
    // mismo con estos mismos valores nunca es un conflicto real.
    const duplicateOnUpdate = await prisma.accountingDocument.findFirst({
      where: {
        id: { not: id },
        documentNumber: effectiveDocumentNumber,
        documentType: effectiveType,
        insuranceCompany: effectiveInsuranceCompany ?? null,
      },
      select: { id: true },
    })
    if (duplicateOnUpdate) {
      throw new AppError(
        409,
        'Ya existe un documento del mismo tipo y compañía con ese número',
        'CONFLICT',
      )
    }

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
    const requestedCurrency = docData.currency ?? existing.currency
    const requestedExchangeRate = docData.exchangeRate ?? existing.exchangeRate

    const inherited = await this.validateTypeConstraints(
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
        currency: requestedCurrency,
      },
      id,
    )
    const effectivePaymentMethod = inherited.paymentMethod
      ?? (docData.paymentMethod !== undefined
        ? docData.paymentMethod?.trim() || null
        : existing.paymentMethod)
    const effectiveCurrency = (inherited.currency ?? requestedCurrency) as 'ARS' | 'USD'
    const effectiveExchangeRate = inherited.exchangeRate ?? requestedExchangeRate

    // documentStatus nunca viene del cliente (ver documents.schemas.ts) — esto
    // solo revalida que el estado actual siga siendo válido para el tipo
    // efectivo tras la edición (ej. si se cambia documentType en la edición).
    if (!typeDef.documentStatusOptions.includes(existing.documentStatus as (typeof typeDef.documentStatusOptions)[number])) {
      throw new AppError(400, 'Estado de documento inválido para este tipo', 'BAD_REQUEST')
    }

    const { amountArs: effectiveTotalAmountArs, amountUsd: effectiveTotalAmountUsd } = computeDualAmounts(
      computeTotalAmount({
        netAmount: effectiveNetAmount,
        vatAmount: effectiveVatAmount,
        otherTaxesAmount: effectiveOtherTaxesAmount,
      }),
      effectiveCurrency,
      effectiveExchangeRate,
    )

    let updated
    try {
      updated = await prisma.$transaction(async (tx) => {
        const doc = await tx.accountingDocument.update({
          where: { id },
          data: {
            ...docData,
            currency: effectiveCurrency,
            exchangeRate: effectiveExchangeRate,
            paymentMethod: effectivePaymentMethod,
            relationType: typeDef.relationType ?? null,
            ...(!typeDef.hasPaymentStatus && { paymentStatus: 'NOT_APPLICABLE' }),
            totalAmountArs: effectiveTotalAmountArs,
            totalAmountUsd: effectiveTotalAmountUsd,
          },
          include: DOCUMENT_DETAIL_INCLUDE,
        })

        await this.recordAudit(id, {
          action: 'UPDATE',
          description: 'Documento actualizado',
          previousData: {
            documentNumber: existing.documentNumber,
            documentType: existing.documentType,
            linkedDocumentId: existing.linkedDocumentId,
            paymentMethod: existing.paymentMethod,
            netAmount: existing.netAmount,
            vatAmount: existing.vatAmount,
            otherTaxesAmount: existing.otherTaxesAmount,
          },
          newData: {
            documentNumber: doc.documentNumber,
            documentType: doc.documentType,
            linkedDocumentId: doc.linkedDocumentId,
            paymentMethod: doc.paymentMethod,
            netAmount: doc.netAmount,
            vatAmount: doc.vatAmount,
            otherTaxesAmount: doc.otherTaxesAmount,
          },
          performedBy,
        }, tx)

        return doc
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(
          409,
          'Ya existe un documento del mismo tipo y compañía con ese número',
          'CONFLICT',
        )
      }
      throw err
    }

    return mapDocumentDetail(updated)
  },

  async delete(id: string) {
    const existing = await this.assertDocumentExists(id)

    if (existing.documentStatus === 'APPLIED') {
      throw new AppError(
        400,
        'No se puede eliminar un documento aplicado. Cancelalo primero si necesitás corregirlo.',
        'BAD_REQUEST',
      )
    }

    // linkedDocumentId no tiene FK real en el schema (permite números
    // compartidos entre compañías/tipos) — sin este chequeo, borrar una
    // factura dejaría notas de crédito/débito/ajuste con una referencia
    // colgante y su propio DocumentAuditLog cascadeado en silencio.
    const dependent = await prisma.accountingDocument.findFirst({
      where: { linkedDocumentId: id },
      select: { id: true, documentNumber: true, documentType: true },
    })
    if (dependent) {
      throw new AppError(
        409,
        `No se puede eliminar: el documento ${dependent.documentNumber} está vinculado a este`,
        'HAS_DEPENDENTS',
      )
    }

    // El cascade de Prisma borra las filas de DocumentAttachment, pero no los
    // archivos reales en Cloudinary — sin este paso quedarían huérfanos ahí
    // para siempre. Se borran antes del delete (best-effort: un fallo acá no
    // debe bloquear el borrado del documento).
    const attachments = await prisma.documentAttachment.findMany({
      where: { accountingDocumentId: id },
      select: { cloudinaryPublicId: true },
    })
    await Promise.all(
      attachments
        .filter((a) => a.cloudinaryPublicId)
        .map((a) => deleteFromCloudinary(a.cloudinaryPublicId!).catch(() => undefined)),
    )

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

    // El saldo se relee DENTRO de la transacción (con tx, no con el prisma
    // global) y la transacción corre con aislamiento serializable — sin
    // esto, dos Notas de Crédito aplicadas concurrentemente podrían, cada
    // una individualmente dentro de saldo al momento de leerlo, superarlo en
    // conjunto. Con serializable, Postgres aborta una de las dos (P2034) en
    // vez de dejar que ambas escriban un resultado inconsistente.
    let updated
    try {
      updated = await prisma.$transaction(
        async (tx) => {
          if (doc.documentType === 'CREDIT_NOTE' && doc.linkedDocumentId) {
            const balance = await documentsBalanceService.getBalance(doc.linkedDocumentId, tx)
            const creditAmount = Math.abs(computeTotalAmount(doc))
            if (creditAmount > balance.effectiveAmount) {
              throw new AppError(400, 'La Nota de Crédito supera el saldo disponible de la factura', 'BAD_REQUEST')
            }

            // Si el usuario ya distribuyó esta NC a mano (al crearla/editarla,
            // igual que en Factura), se respeta tal cual — no se pisa. Solo
            // si no tiene ninguna asignación propia todavía se genera
            // automáticamente, proporcional a la distribución de la factura
            // vinculada, para que los reportes por póliza reflejen el neto.
            // Si la factura tampoco tiene asignaciones, se aplica igual sin
            // crear ninguna (queda pendiente de distribución manual).
            const ownAllocationsCount = await tx.documentPolicyAllocation.count({
              where: { accountingDocumentId: id },
            })
            if (ownAllocationsCount === 0) {
              const invoiceAllocations = await tx.documentPolicyAllocation.findMany({
                where: { accountingDocumentId: doc.linkedDocumentId },
              })
              const negativeAllocations = invoiceAllocations.map((a) => ({
                policyAssetCoverageId: a.policyAssetCoverageId,
                allocatedAmount: -(creditAmount * (a.allocationPercentage / 100)),
                allocationPercentage: a.allocationPercentage,
              }))
              if (negativeAllocations.length > 0) {
                await tx.documentPolicyAllocation.createMany({
                  data: negativeAllocations.map((a) => ({ ...a, accountingDocumentId: id })),
                })
              }
            }
          }

          // Reparto en partes iguales entre las cuotas NO pagas de la factura
          // vinculada — así "Total Pendiente" (Dashboard/Documentos/Análisis
          // Financiero) refleja el efecto real de la NC/ND/Ajuste en vez de
          // quedar inmutado (antes solo se actualizaba el "saldo" calculado
          // on-the-fly, nunca las cuotas). Las cuotas ya PAID nunca se tocan.
          if (INSTALLMENT_ADJUSTING_TYPES.includes(doc.documentType) && doc.linkedDocumentId) {
            await this.redistributeAdjustmentAcrossInstallments(tx, doc, id)
          }

          const doc2 = await tx.accountingDocument.update({
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
          }, tx)

          return doc2
        },
        // El timeout default de Prisma (5s) no alcanza cuando hay que repartir
        // el monto entre varias cuotas — cada una implica un update + un
        // insert de rastreo, todos contra una DB remota (Neon). Sin este
        // timeout más generoso, una factura con varias cuotas elegibles podía
        // abortar la transacción con P2028 ("Transaction not found").
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 },
      )
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new AppError(
          409,
          'No se pudo aplicar el documento por otra operación simultánea sobre el mismo saldo. Reintentá de nuevo.',
          'CONCURRENT_UPDATE',
        )
      }
      throw err
    }

    return mapDocumentDetail(updated)
  },

  async cancel(id: string, performedBy?: string, reason?: string) {
    const doc = await this.assertDocumentExists(id)

    if (doc.documentStatus === 'CANCELLED') {
      throw new AppError(409, 'El documento ya está anulado', 'CONFLICT')
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Si este documento había repartido su monto entre cuotas de una
      // factura vinculada (ver redistributeAdjustmentAcrossInstallments), hay
      // que devolverlas a su monto original antes de anular — si no, la NC/ND/
      // Ajuste desaparece pero las cuotas quedan modificadas para siempre.
      // No-op si el documento nunca aplicó ningún reparto (ISSUED, u otro tipo).
      await this.reverseInstallmentAdjustments(tx, id)

      const doc2 = await tx.accountingDocument.update({
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
      }, tx)

      return doc2
    // Ver el mismo comentario en apply(): revertir el reparto entre varias
    // cuotas implica varios round-trips contra Neon, el timeout default (5s)
    // puede no alcanzar.
    }, { timeout: 20000 })

    return mapDocumentDetail(updated)
  },

  // ── Envío manual por email ────────────────────────────────────────────────────

  async sendEmail(id: string, payload: SendDocumentEmailDTO, actor: EmailActor) {
    const doc = await this.findById(id)
    const typeDef = getDocumentTypeDef(doc.documentType)

    const [ownPolicy, linkedDocument] = await Promise.all([
      doc.policyId
        ? prisma.policy.findUnique({ where: { id: doc.policyId }, select: { policyNumber: true } })
        : Promise.resolve(null),
      doc.linkedDocumentId
        ? prisma.accountingDocument.findUnique({ where: { id: doc.linkedDocumentId }, select: { documentNumber: true } })
        : Promise.resolve(null),
    ])

    // Bien de Uso + Centro de Costo de cada asignación — se resuelven acá
    // (no vienen en DOCUMENT_DETAIL_INCLUDE) porque están asociados al
    // Activo (o, en líneas "sin activo", directo a la línea de cobertura),
    // no al documento. El peso de cada fila es el real de su línea de
    // cobertura (allocatedAmount/allocationPercentage) — cada asignación ya
    // sabe a qué activo (o a ninguno) corresponde, no hace falta repartir en
    // partes iguales.
    const assetIds = [...new Set(doc.allocations.map((a) => a.assetId).filter((assetId): assetId is string => !!assetId))]
    const assetsSummary = await assetsService.resolveAssetsSummary(assetIds)
    const assetsById = new Map(assetsSummary.map((a) => [a.id, a]))

    // Las líneas "sin activo" imputan Centro de Costo directo en la línea de
    // cobertura (policyAssetCoverage.costCenterId) — sin activo no hay
    // AssetAllocation de dónde sacarlo (ver resolveAssetsSummary).
    const coverageIdsWithoutAsset = doc.allocations
      .filter((a) => !a.assetId)
      .map((a) => a.policyAssetCoverageId)
    const coveragesWithoutAsset = coverageIdsWithoutAsset.length > 0
      ? await prisma.policyAssetCoverage.findMany({
          where: { id: { in: coverageIdsWithoutAsset } },
          select: { id: true, costCenter: { select: { name: true, code: true } } },
        })
      : []
    const costCenterByCoverageId = new Map(coveragesWithoutAsset.map((c) => [c.id, c.costCenter]))

    // Se agrupa por Centro de Costo — cada uno lista sus propios Bienes de
    // Uso (uno o varios). Cuando una línea no tiene Bien de Uso asociado
    // (activo sin bien de uso, o línea "sin activo"), no se inventa una fila
    // con el nombre del activo: entra en un renglón en blanco propio del
    // Centro de Costo, sumando las demás líneas sin Bien de Uso que caigan
    // ahí — así el % de cada Centro de Costo (arriba, en negrita) sigue
    // siendo la suma exacta de sus renglones, y el total entre todos los
    // Centros de Costo sigue dando 100%.
    const groups = new Map<string, ManualDocumentCostCenterGroup>()
    const itemIndexByGroup = new Map<string, Map<string, number>>()

    for (const alloc of doc.allocations) {
      const asset = alloc.assetId ? assetsById.get(alloc.assetId) : undefined
      const costCenter = asset
        ? { code: asset.costCenterCode, name: asset.costCenterName }
        : (costCenterByCoverageId.get(alloc.policyAssetCoverageId) ?? { code: null, name: null })

      const groupKey = costCenter.code ?? costCenter.name ?? `sin-cc-${alloc.policyAssetCoverageId}`
      let group = groups.get(groupKey)
      if (!group) {
        group = { code: costCenter.code ?? null, name: costCenter.name ?? null, items: [] }
        groups.set(groupKey, group)
        itemIndexByGroup.set(groupKey, new Map())
      }

      const hasBienDeUso = !!asset?.fixedAssetCode
      const itemKey = hasBienDeUso ? asset!.id : 'sin-bien-de-uso'
      const itemIndex = itemIndexByGroup.get(groupKey)!
      const existingIdx = itemIndex.get(itemKey)
      if (existingIdx !== undefined) {
        group.items[existingIdx].amount += alloc.allocatedAmount
        group.items[existingIdx].percentage += alloc.allocationPercentage
      } else {
        itemIndex.set(itemKey, group.items.length)
        group.items.push({
          code: hasBienDeUso ? asset!.fixedAssetCode : null,
          name: hasBienDeUso ? (asset!.fixedAssetName ?? asset!.name) : null,
          amount: alloc.allocatedAmount,
          percentage: alloc.allocationPercentage,
        })
      }
    }

    // El contenido del mail se arma solo con datos ya persistidos del
    // documento — nunca con montos/distribución que pudiera mandar el
    // cliente en el body de este endpoint.
    const templateData: ManualDocumentEmailData = {
      documentType: doc.documentType,
      documentTypeLabel: typeDef?.label ?? doc.documentType,
      documentNumber: doc.documentNumber,
      issueDate: toDateStr(doc.issueDate),
      dueDate: doc.installments.map((installment) => installment.dueDate as string).sort()[0] ?? null,
      insuranceCompany: doc.insuranceCompany,
      paymentMethod: doc.paymentMethod,
      currency: doc.currency,
      totalAmount: doc.totalAmount,
      policyNumbers: [...new Set([
        ...doc.allocations.map((allocation) => allocation.policy?.policyNumber).filter((value): value is string => !!value),
        ...(ownPolicy?.policyNumber ? [ownPolicy.policyNumber] : []),
      ])],
      linkedDocumentNumber: linkedDocument?.documentNumber ?? null,
      description: doc.description,
      adjustmentReason: doc.adjustmentReason
        ? (ADJUSTMENT_REASONS[doc.adjustmentReason] ?? doc.adjustmentReason)
        : null,
      endorsementType: doc.endorsementType
        ? (ENDORSEMENT_TYPES[doc.endorsementType] ?? doc.endorsementType)
        : null,
      endorsementEffectiveDate: doc.endorsementEffectiveDate
        ? toDateStr(doc.endorsementEffectiveDate)
        : null,
      costCenters: [...groups.values()],
      attachments: [],
    }

    // Adjuntos reales — se bajan del storage (Cloudinary) recién acá, al
    // momento de enviar, no se guardan bytes en ningún lado intermedio.
    const { attachments, summaries } = await resolveEmailAttachments(
      doc.attachments.map((att) => ({ name: att.name, fileUrl: att.fileUrl })),
    )
    templateData.attachments = summaries

    return emailService.sendManualEntityEmail({
      entityType: 'AccountingDocument',
      entityId: id,
      to: payload.to,
      cc: payload.cc,
      bcc: payload.bcc,
      subjectOverride: payload.subject,
      message: payload.message,
      templateData: templateData as unknown as Record<string, unknown>,
      attachments,
      actor,
    })
  },

  async getEmailLogs(id: string) {
    await this.assertDocumentExists(id)
    const logs = await prisma.emailLog.findMany({
      where: { entityType: 'AccountingDocument', entityId: id },
      select: {
        id: true, status: true, provider: true, toAddresses: true, ccAddresses: true,
        bccAddresses: true, subject: true, triggeredByUserId: true, triggeredByEmail: true,
        sentAt: true, failedAt: true, errorMessage: true, providerMessageId: true,
        metadata: true, createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    return logs.map((log) => {
      const metadata = log.metadata && typeof log.metadata === 'object' && !Array.isArray(log.metadata)
        ? log.metadata as Record<string, unknown>
        : {}
      const stringArray = (value: unknown) =>
        Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
      return {
        id: log.id, createdAt: log.createdAt, sentAt: log.sentAt, failedAt: log.failedAt,
        status: log.status,
        sentBy: log.triggeredByEmail ? { userId: log.triggeredByUserId, email: log.triggeredByEmail } : null,
        to: log.toAddresses, cc: log.ccAddresses, bcc: log.bccAddresses, subject: log.subject,
        message: typeof metadata.message === 'string' ? metadata.message : null,
        provider: log.provider, providerMessageId: log.providerMessageId,
        errorMessage: log.errorMessage, attachments: stringArray(metadata.attachmentNames),
        documentType: typeof metadata.documentType === 'string' ? metadata.documentType : null,
        documentNumber: typeof metadata.documentNumber === 'string' ? metadata.documentNumber : null,
      }
    })
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

    const typeDef = getDocumentTypeDef(doc.documentType)
    if (data.installments.length > 0 && typeDef?.hasInstallments) {
      this.assertInstallmentsMatchTotal(data.installments, computeTotalAmount(doc))
    }

    // Reemplazo de cuotas + reset de paymentStatus en una sola transacción —
    // evita que el documento quede con cuotas nuevas pero un paymentStatus
    // desincronizado si el segundo write fallara por separado.
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
                paymentMethod: doc.paymentMethod?.trim() || null,
                ...computeDualAmounts(inst.amount, doc.currency as 'ARS' | 'USD', doc.exchangeRate),
              })),
            }),
          ]
        : []),
      prisma.accountingDocument.update({
        where: { id: documentId },
        data: { paymentStatus: 'PENDING' },
      }),
    ])

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

    // exchangeRate es un input efímero (tipo de cambio del día de pago): no
    // existe como columna en DocumentInstallment (a diferencia del documento
    // padre, la cuota no tiene su propio exchangeRate persistido), solo se
    // usa acá para derivar amountArs/amountUsd. Se destructura antes de armar
    // el `data` de Prisma para no pasarlo — Prisma tira error ante una
    // columna desconocida.
    const { exchangeRate, ...installmentData } = data

    if (data.paymentStatus === 'PAID' && exchangeRate === undefined) {
      throw new AppError(400, 'Se requiere el tipo de cambio para marcar la cuota como pagada', 'BAD_REQUEST')
    }
    const effectivePaymentStatus = data.paymentStatus ?? installment.paymentStatus
    const effectivePaymentMethod =
      data.paymentMethod !== undefined ? data.paymentMethod : installment.paymentMethod
    if (effectivePaymentStatus === 'PAID' && !effectivePaymentMethod?.trim()) {
      throw new AppError(400, 'Se requiere el medio de pago para marcar la cuota como pagada', 'BAD_REQUEST')
    }

    const dualAmounts =
      data.paymentStatus === 'PAID'
        ? computeDualAmounts(installment.amount, installment.currency as 'ARS' | 'USD', exchangeRate!)
        : {}

    const updated = await prisma.$transaction(async (tx) => {
      const inst = await tx.documentInstallment.update({
        where: { id: installmentId },
        data: {
          ...installmentData,
          ...(installmentData.paymentMethod !== undefined && {
            paymentMethod: installmentData.paymentMethod?.trim() || null,
          }),
          ...dualAmounts,
        },
      })

      await this.recalculateDocumentStatus(documentId, tx)

      if (data.paymentStatus && data.paymentStatus !== installment.paymentStatus) {
        await this.recordAudit(documentId, {
          action: 'PAYMENT_CHANGE',
          description: `Cuota ${installment.installmentNumber} marcada como ${PAYMENT_STATUS_LABELS[data.paymentStatus] ?? data.paymentStatus}`,
          previousData: { paymentStatus: installment.paymentStatus },
          newData: { paymentStatus: data.paymentStatus },
          performedBy,
        }, tx)
      }

      return inst
    })

    return mapInstallment(updated as Record<string, unknown>)
  },

  async recalculateDocumentStatus(documentId: string, client: DocClient = prisma) {
    const installments = await client.documentInstallment.findMany({
      where: { accountingDocumentId: documentId },
      select: { paymentStatus: true },
    })

    if (installments.length === 0) return

    const paid = installments.filter((i) => i.paymentStatus === 'PAID').length
    const paymentStatus =
      paid === 0 ? 'PENDING' : paid === installments.length ? 'PAID' : 'PARTIALLY_PAID'

    await client.accountingDocument.update({
      where: { id: documentId },
      data: { paymentStatus },
    })
  },

  // ── Allocations ───────────────────────────────────────────────────────────────

  async findAllocations(documentId: string) {
    await this.assertDocumentExists(documentId)
    const allocations = await prisma.documentPolicyAllocation.findMany({
      where: { accountingDocumentId: documentId },
      include: { policyAssetCoverage: { select: ALLOCATION_COVERAGE_SELECT } },
      orderBy: { allocationPercentage: 'desc' },
    })
    return allocations.map((a) => mapAllocation(a))
  },

  async findAllocationsBulk(documentIds: string[]) {
    const allocations = await prisma.documentPolicyAllocation.findMany({
      where: { accountingDocumentId: { in: documentIds } },
      include: { policyAssetCoverage: { select: ALLOCATION_COVERAGE_SELECT } },
      orderBy: { allocationPercentage: 'desc' },
    })
    return allocations.map((a) => mapAllocation(a))
  },

  async replaceAllocations(documentId: string, data: ReplaceAllocationsDTO) {
    await this.assertDocumentExists(documentId)

    if (data.allocations.length > 0) {
      await this.validateCoverageRefs(data.allocations.map((a) => a.policyAssetCoverageId))
    }

    await prisma.$transaction([
      prisma.documentPolicyAllocation.deleteMany({ where: { accountingDocumentId: documentId } }),
      ...(data.allocations.length > 0
        ? [
            prisma.documentPolicyAllocation.createMany({
              data: data.allocations.map((a) => ({
                accountingDocumentId: documentId,
                policyAssetCoverageId: a.policyAssetCoverageId,
                allocatedAmount: a.allocatedAmount,
                allocationPercentage: a.allocationPercentage,
              })),
            }),
          ]
        : []),
    ])

    const allocations = await prisma.documentPolicyAllocation.findMany({
      where: { accountingDocumentId: documentId },
      include: { policyAssetCoverage: { select: ALLOCATION_COVERAGE_SELECT } },
      orderBy: { allocationPercentage: 'desc' },
    })
    return allocations.map((a) => mapAllocation(a))
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

    const { fileUrl, cloudinaryPublicId } = await validateAndUploadAttachment(file, 'documents')

    return withAttachmentRollback(cloudinaryPublicId, () =>
      prisma.documentAttachment.create({
        data: {
          accountingDocumentId: documentId,
          name: sanitizeFileName(file.originalname),
          description: meta.description ?? null,
          fileType: detectFileType(file.mimetype),
          fileSize: formatFileSize(file.size),
          fileUrl,
          cloudinaryPublicId,
          uploadedBy,
        },
      }),
    )
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

  async getAttachmentForDownload(documentId: string, attachmentId: string) {
    const attachment = await prisma.documentAttachment.findFirst({
      where: { id: attachmentId, accountingDocumentId: documentId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    return attachment
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
    client: DocClient = prisma,
  ) {
    await client.documentAuditLog.create({
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
        insuranceCompany: true,
        currency: true,
        exchangeRate: true,
        paymentMethod: true,
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

  // Nada impedía guardar cuotas que no sumaran el total del documento
  // (netAmount+vatAmount+otherTaxesAmount) — un desfasaje silencioso entre lo
  // facturado y lo que en los papeles se va a cobrar en cuotas. Se usa la
  // misma tolerancia (0.01) que el resto de la app para comparar montos.
  assertInstallmentsMatchTotal(installments: { amount: number }[], expectedTotal: number): void {
    const sum = +installments.reduce((s, i) => s + i.amount, 0).toFixed(2)
    if (Math.abs(sum - expectedTotal) > 0.01) {
      throw new AppError(
        400,
        `La suma de las cuotas (${sum}) no coincide con el total del documento (${expectedTotal}).`,
        'INSTALLMENTS_TOTAL_MISMATCH',
      )
    }
  },

  // Reparte el monto de una NC/ND/Ajuste, en partes iguales, entre las cuotas
  // NO pagas de su factura vinculada (las PAID nunca se tocan). El resto de
  // redondeo se lleva la última cuota elegible (por installmentNumber), para
  // que la suma cierre exacta contra el monto del documento. Si el ajuste
  // supera lo que le queda a una cuota puntual, esa cuota se clampea en 0 —
  // el sobrante no se cascada a otras cuotas (limitación conocida, ver plan).
  // Guarda un InstallmentAdjustmentApplication por cuota tocada para poder
  // revertir con precisión si el documento se anula después (ver
  // reverseInstallmentAdjustments).
  async redistributeAdjustmentAcrossInstallments(
    tx: Prisma.TransactionClient,
    doc: {
      documentType: string
      netAmount: number
      vatAmount: number
      otherTaxesAmount: number
      adjustmentSign: string | null
      economicImpactType: string | null
      linkedDocumentId: string | null
    },
    sourceDocumentId: string,
  ) {
    if (!doc.linkedDocumentId) return
    const linkedInvoice = await tx.accountingDocument.findUnique({
      where: { id: doc.linkedDocumentId },
      select: { currency: true, exchangeRate: true },
    })
    if (!linkedInvoice) return

    const eligible = await tx.documentInstallment.findMany({
      where: { accountingDocumentId: doc.linkedDocumentId, paymentStatus: { not: 'PAID' } },
      orderBy: { installmentNumber: 'asc' },
    })
    if (eligible.length === 0) return

    const rawTotal = computeTotalAmount(doc)
    const signedAmount =
      doc.documentType === 'CREDIT_NOTE' ? -Math.abs(rawTotal) :
      doc.documentType === 'DEBIT_NOTE' ? Math.abs(rawTotal) :
      doc.documentType === 'ENDORSEMENT' ? Math.abs(rawTotal) * (doc.economicImpactType === 'DECREASES_COST' ? -1 : 1) :
      Math.abs(rawTotal) * (doc.adjustmentSign === 'NEGATIVE' ? -1 : 1)

    const share = +(signedAmount / eligible.length).toFixed(2)
    const currency = linkedInvoice.currency as 'ARS' | 'USD'

    // Los updates de cuota van uno por uno (cada una tiene un monto propio),
    // pero las filas de rastreo se insertan todas juntas al final con
    // createMany — evita un round-trip extra por cuota contra la DB remota,
    // que sumado al resto de la transacción podía superar el timeout.
    const applicationRows: {
      installmentId: string
      sourceDocumentId: string
      deltaAmount: number
      deltaAmountArs: number
      deltaAmountUsd: number
    }[] = []

    for (let i = 0; i < eligible.length; i++) {
      const inst = eligible[i]
      const isLast = i === eligible.length - 1
      const rawDelta = isLast ? +(signedAmount - share * (eligible.length - 1)).toFixed(2) : share
      const newAmount = Math.max(0, +(inst.amount + rawDelta).toFixed(2))
      const actualDelta = +(newAmount - inst.amount).toFixed(2)
      if (actualDelta === 0) continue

      const dual = computeDualAmounts(newAmount, currency, linkedInvoice.exchangeRate)
      const deltaDual = computeDualAmounts(actualDelta, currency, linkedInvoice.exchangeRate)

      await tx.documentInstallment.update({
        where: { id: inst.id },
        data: { amount: newAmount, amountArs: dual.amountArs, amountUsd: dual.amountUsd },
      })
      applicationRows.push({
        installmentId: inst.id,
        sourceDocumentId,
        deltaAmount: actualDelta,
        deltaAmountArs: deltaDual.amountArs,
        deltaAmountUsd: deltaDual.amountUsd,
      })
    }

    if (applicationRows.length > 0) {
      await tx.installmentAdjustmentApplication.createMany({ data: applicationRows })
    }

    await this.recalculateDocumentStatus(doc.linkedDocumentId, tx)
  },

  // Revierte exactamente el reparto hecho por redistributeAdjustmentAcrossInstallments
  // cuando el documento que lo generó se anula — sin esto, anular una NC/ND/Ajuste
  // ya aplicada dejaría las cuotas reducidas/aumentadas para siempre.
  async reverseInstallmentAdjustments(tx: Prisma.TransactionClient, sourceDocumentId: string) {
    const applications = await tx.installmentAdjustmentApplication.findMany({
      where: { sourceDocumentId },
      include: { installment: { include: { document: { select: { currency: true, exchangeRate: true } } } } },
    })
    if (applications.length === 0) return

    let linkedDocumentId: string | null = null
    for (const app of applications) {
      const inst = app.installment
      linkedDocumentId = inst.accountingDocumentId
      const restoredAmount = +(inst.amount - app.deltaAmount).toFixed(2)
      const dual = computeDualAmounts(restoredAmount, inst.document.currency as 'ARS' | 'USD', inst.document.exchangeRate)
      await tx.documentInstallment.update({
        where: { id: inst.id },
        data: { amount: restoredAmount, amountArs: dual.amountArs, amountUsd: dual.amountUsd },
      })
    }

    await tx.installmentAdjustmentApplication.deleteMany({ where: { sourceDocumentId } })
    if (linkedDocumentId) {
      await this.recalculateDocumentStatus(linkedDocumentId, tx)
    }
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
      currency?: string
    },
    selfId?: string,
  ): Promise<{ paymentMethod?: string; currency?: string; exchangeRate?: number }> {
    let inheritedPaymentMethod: string | undefined
    let inheritedCurrency: string | undefined
    let inheritedExchangeRate: number | undefined

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
      if (typeDef.hasOwnAmounts) {
        // La moneda de un NC/ND/Refacturación/Ajuste siempre tiene que coincidir
        // con la del documento que ajusta — de lo contrario el saldo y los
        // totales combinados no tienen sentido (se estaría restando un monto en
        // una moneda de un total en otra). El frontend ya lo bloquea, pero el
        // backend es quien lo tiene que garantizar.
        if (input.currency && input.currency !== linked.currency) {
          throw new AppError(
            400,
            'La moneda debe coincidir con la del documento vinculado',
            'BAD_REQUEST',
          )
        }
      } else {
        // Un Endoso no tiene importe propio, así que no hay nada que pueda
        // "no coincidir" — en vez de exigirle al frontend elegir una moneda
        // que nunca usa para calcular nada, se hereda directo la del
        // documento vinculado (o queda en el default de moneda si no hay
        // ninguno vinculado), para que la ficha del documento la muestre de
        // forma consistente.
        inheritedCurrency = linked.currency
        inheritedExchangeRate = linked.exchangeRate
      }
      if (typeDef.linkedDocumentType && linked.documentType !== typeDef.linkedDocumentType) {
        const expectedLabel = DOCUMENT_TYPES[typeDef.linkedDocumentType]?.label ?? typeDef.linkedDocumentType
        throw new AppError(400, `El documento vinculado debe ser de tipo ${expectedLabel}`, 'BAD_REQUEST')
      }
      // El Endoso modifica una póliza propia (input.policyId) — la factura
      // que respalda económicamente ese cambio tiene que ser una factura DE
      // ESA póliza, no de otra cualquiera. Sin este chequeo se podría crear
      // un Endoso que modifica la póliza A pero factura el aumento contra
      // una póliza B sin relación.
      if (typeDef.key === 'ENDORSEMENT' && input.policyId) {
        const linkedAllocations = await prisma.documentPolicyAllocation.findMany({
          where: { accountingDocumentId: linked.id },
          select: { policyAssetCoverage: { select: { policyId: true } } },
        })
        const linkedPolicyIds = new Set(linkedAllocations.map((a) => a.policyAssetCoverage.policyId))
        if (linkedPolicyIds.size > 0 && !linkedPolicyIds.has(input.policyId)) {
          throw new AppError(
            400,
            'La factura vinculada debe pertenecer a la póliza que este Endoso modifica',
            'BAD_REQUEST',
          )
        }
      }
      inheritedPaymentMethod = linked.paymentMethod?.trim()
      if (!inheritedPaymentMethod) {
        throw new AppError(
          400,
          'El documento vinculado no tiene medio de pago. Completalo antes de asociar este documento.',
          'BAD_REQUEST',
        )
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

    // Solo cuando el impacto es real (aumenta/reduce costo) el Endoso
    // necesita la factura que lo respalda y un importe propio — para
    // NO_IMPACT/PENDING_DEFINITION sigue siendo un registro administrativo,
    // sin vínculo ni importe. No se puede expresar con requiresLinkedDocument
    // (fijo por tipo) porque depende del VALOR de economicImpactType.
    if (
      typeDef.key === 'ENDORSEMENT' &&
      (input.economicImpactType === 'INCREASES_COST' || input.economicImpactType === 'DECREASES_COST')
    ) {
      if (!input.linkedDocumentId) {
        throw new AppError(400, 'La factura asociada es requerida cuando el Endoso tiene impacto económico', 'BAD_REQUEST')
      }
      if (!input.netAmount || input.netAmount <= 0) {
        throw new AppError(400, 'El importe es requerido cuando el Endoso tiene impacto económico', 'BAD_REQUEST')
      }
    }

    // Simétrico al chequeo anterior: sin impacto económico real, tampoco
    // tiene sentido cargarle un importe — evita un Endoso "NO_IMPACT" que en
    // realidad sí mueve plata sin que nada lo refleje en el saldo de nadie.
    if (
      typeDef.key === 'ENDORSEMENT' &&
      (input.economicImpactType === 'NO_IMPACT' || input.economicImpactType === 'PENDING_DEFINITION') &&
      ((input.netAmount ?? 0) !== 0 || (input.vatAmount ?? 0) !== 0 || (input.otherTaxesAmount ?? 0) !== 0)
    ) {
      throw new AppError(400, 'Un Endoso sin impacto económico no puede tener importe propio', 'BAD_REQUEST')
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

    // Los importes son siempre una magnitud (>= 0), incluido Asiento de
    // Ajuste: ahí el signo del efecto lo da adjustmentSign por separado (ver
    // documents-balance.service.ts), no el monto — si se permitiera un
    // netAmount negativo con adjustmentSign=NEGATIVE, el efecto se
    // invertiría (doble signo) en vez de aplicarse una sola vez.
    if (
      typeDef.hasOwnAmounts &&
      ((input.netAmount ?? 0) < 0 || (input.vatAmount ?? 0) < 0 || (input.otherTaxesAmount ?? 0) < 0)
    ) {
      throw new AppError(400, 'Los importes no pueden ser negativos', 'BAD_REQUEST')
    }

    return { paymentMethod: inheritedPaymentMethod, currency: inheritedCurrency, exchangeRate: inheritedExchangeRate }
  },

  async checkDocumentNumber(
    documentNumber: string,
    documentType?: string,
    insuranceCompany?: string | null,
    excludeId?: string,
  ) {
    // Mismo criterio compuesto que create()/update(): el duplicado real es
    // tipo + compañía + número, no el número solo. excludeId lo manda la
    // edición de un documento existente, para que su propio número sin
    // cambios no se marque como "ya existe" contra sí mismo.
    const existing = await prisma.accountingDocument.findFirst({
      where: {
        documentNumber,
        ...(documentType && { documentType }),
        ...(insuranceCompany !== undefined && { insuranceCompany: insuranceCompany ?? null }),
        ...(excludeId && { id: { not: excludeId } }),
      },
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

  // Para las asignaciones de un documento (ahora apuntan a una línea de
  // cobertura, no directo a la póliza) — la línea tiene que existir y su
  // póliza estar activa.
  async validateCoverageRefs(coverageIds: string[]) {
    const found = await prisma.policyAssetCoverage.findMany({
      where: { id: { in: coverageIds }, policy: { isActive: true } },
      select: { id: true },
    })
    if (found.length !== coverageIds.length) {
      throw new AppError(
        400,
        'Una o más líneas de cobertura referenciadas no existen o no pertenecen a una póliza activa',
        'INVALID_REFERENCE',
      )
    }
  },
}
