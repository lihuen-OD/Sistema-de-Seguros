import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { toDateStr } from '../../shared/utils/dates'
import { detectFileType, formatFileSize, isAllowedMimetype, matchesDeclaredMimetype, sanitizeFileName } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import { computeTotalAmount } from '../documents/document-amounts'
import type {
  CreateClaimDTO,
  UpdateClaimDTO,
  ListClaimsQueryDTO,
  AddEventDTO,
  AddClaimAttachmentDTO,
  CreateExpenseDTO,
  UpdateExpenseDTO,
} from './claims.schemas'

// ── Includes ──────────────────────────────────────────────────────────────────

const CLAIM_LIST_INCLUDE = {
  asset: { select: { id: true, name: true } },
  policy: { select: { id: true, policyNumber: true } },
  _count: { select: { events: true, expenses: true } },
}

const CLAIM_DETAIL_INCLUDE = {
  asset: { select: { id: true, name: true, assetType: true } },
  policy: { select: { id: true, policyNumber: true, insuredName: true } },
  events: { orderBy: { date: 'desc' as const }, take: 100 },
  expenses: { orderBy: { date: 'desc' as const } },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapEvent(e: Record<string, unknown>) {
  return {
    id: e.id,
    claimId: e.claimId,
    type: e.type,
    description: e.description,
    date: toDateStr(e.date as Date | string),
    previousStatus: e.previousStatus ?? null,
    newStatus: e.newStatus ?? null,
    amountLabel: e.amountLabel ?? null,
    previousAmount: e.previousAmount ?? null,
    newAmount: e.newAmount ?? null,
    author: e.createdBy ?? null,
    createdAt: e.createdAt,
  }
}

function mapExpense(e: Record<string, unknown>) {
  const netAmount = e.netAmount as number
  const vatAmount = e.vatAmount as number
  const otherTaxesAmount = e.otherTaxesAmount as number
  return {
    id: e.id,
    claimId: e.claimId,
    date: toDateStr(e.date as Date | string),
    provider: e.provider,
    receiptNumber: e.receiptNumber ?? null,
    netAmount,
    vatAmount,
    otherTaxesAmount,
    totalAmount: computeTotalAmount({ netAmount, vatAmount, otherTaxesAmount }),
    createdBy: e.createdBy ?? null,
    createdAt: e.createdAt,
  }
}

async function generateClaimNumber(): Promise<string> {
  const year = new Date().getFullYear()
  const result = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('claim_number_seq')`
  const seq = String(Number(result[0].nextval)).padStart(5, '0')
  return `SIN-${year}-${seq}`
}

// ── Service ───────────────────────────────────────────────────────────────────

export const claimsService = {
  async findAll(query: ListClaimsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where: Record<string, unknown> = {}
    if (query.isActive !== undefined) where.isActive = query.isActive
    if (query.status) where.status = query.status
    if (query.claimType) where.claimType = query.claimType
    if (query.policyId) where.policyId = query.policyId
    if (query.assetId) where.assetId = query.assetId
    if (query.year) {
      const y = String(query.year)
      where.occurrenceDate = { gte: `${y}-01-01`, lte: `${y}-12-31` }
    }
    if (query.search) {
      where.OR = [
        { claimNumber: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { insuranceCompany: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [rawData, total] = await Promise.all([
      prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: CLAIM_LIST_INCLUDE,
      }),
      prisma.claim.count({ where }),
    ])

    return buildPaginatedResponse(rawData, total, { page, limit })
  },

  async findById(id: string) {
    const claim = await prisma.claim.findUnique({
      where: { id },
      include: CLAIM_DETAIL_INCLUDE,
    })
    if (!claim) throw new AppError(404, 'Siniestro no encontrado', 'NOT_FOUND')

    return {
      ...claim,
      events: claim.events.map((e) => mapEvent(e as unknown as Record<string, unknown>)),
      expenses: claim.expenses.map((e) => mapExpense(e as unknown as Record<string, unknown>)),
    }
  },

  async create(data: CreateClaimDTO, createdBy?: string) {
    if (data.assetId) {
      const asset = await prisma.asset.findFirst({ where: { id: data.assetId, isActive: true } })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    if (data.policyId) {
      const policy = await prisma.policy.findFirst({ where: { id: data.policyId, isActive: true } })
      if (!policy) throw new AppError(400, 'Póliza no encontrada o inactiva', 'INVALID_REFERENCE')
    }

    const claimNumber = await generateClaimNumber()

    const claim = await prisma.claim.create({
      data: {
        claimNumber,
        assetId: data.assetId ?? null,
        policyId: data.policyId ?? null,
        claimType: data.claimType,
        occurrenceDate: data.occurrenceDate,
        reportDate: data.reportDate,
        description: data.description,
        insuranceCompany: data.insuranceCompany ?? null,
        ownershipType: data.ownershipType,
        responsiblePersonName: data.responsiblePersonName ?? null,
        thirdPartyInsuranceCompany: data.thirdPartyInsuranceCompany ?? null,
        thirdPartyContact: data.thirdPartyContact ?? null,
        thirdPartyInsurerContact: data.thirdPartyInsurerContact ?? null,
        status: data.status,
        claimedAmountArs: data.claimedAmountArs,
        realAmountArs: data.realAmountArs ?? null,
        settledAmountArs: data.settledAmountArs ?? null,
        deductibleArs: data.deductibleArs ?? null,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        observations: data.observations ?? null,
        // Auto-generate initial event
        events: {
          create: {
            type: 'siniestro_creado',
            description: 'Siniestro registrado en el sistema',
            date: new Date(),
            createdBy: createdBy ?? 'Sistema',
          },
        },
      },
      include: CLAIM_DETAIL_INCLUDE,
    })

    return {
      ...claim,
      events: claim.events.map((e) => mapEvent(e as unknown as Record<string, unknown>)),
      expenses: claim.expenses.map((e) => mapExpense(e as unknown as Record<string, unknown>)),
    }
  },

  async update(id: string, data: UpdateClaimDTO) {
    const existing = await prisma.claim.findUnique({
      where: { id },
      select: { status: true, claimedAmountArs: true, realAmountArs: true, settledAmountArs: true },
    })
    if (!existing) throw new AppError(404, 'Siniestro no encontrado', 'NOT_FOUND')

    if (data.assetId) {
      const asset = await prisma.asset.findFirst({ where: { id: data.assetId, isActive: true } })
      if (!asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    if (data.policyId) {
      const policy = await prisma.policy.findFirst({ where: { id: data.policyId, isActive: true } })
      if (!policy) throw new AppError(400, 'Póliza no encontrada o inactiva', 'INVALID_REFERENCE')
    }

    // Cambios de estado/montos vía este update() genérico (ej. desde el
    // formulario de edición completo) quedan igual de auditados que los que
    // vienen del selector rápido de estado — no depende de que el frontend
    // se acuerde de llamar a addEvent() por separado. Todo en una transacción
    // para que el update y su rastro en ClaimEvent sean atómicos.
    const amountChanges: { label: string; previous: number | null; next: number }[] = [
      { label: 'Monto reclamado', previous: existing.claimedAmountArs, next: data.claimedAmountArs },
      { label: 'Monto real', previous: existing.realAmountArs, next: data.realAmountArs },
      { label: 'Monto liquidado', previous: existing.settledAmountArs, next: data.settledAmountArs },
    ].filter((c): c is { label: string; next: number; previous: number | null } =>
      c.next !== undefined && c.next !== c.previous,
    )

    const updated = await prisma.$transaction(async (tx) => {
      await tx.claim.update({
        where: { id },
        data: {
          ...(data.claimNumber && { claimNumber: data.claimNumber }),
          ...(data.claimType && { claimType: data.claimType }),
          ...(data.occurrenceDate && { occurrenceDate: data.occurrenceDate }),
          ...(data.reportDate && { reportDate: data.reportDate }),
          ...(data.description && { description: data.description }),
          ...(data.insuranceCompany !== undefined && { insuranceCompany: data.insuranceCompany }),
          ...(data.ownershipType && { ownershipType: data.ownershipType }),
          ...(data.responsiblePersonName !== undefined && { responsiblePersonName: data.responsiblePersonName }),
          ...(data.thirdPartyInsuranceCompany !== undefined && { thirdPartyInsuranceCompany: data.thirdPartyInsuranceCompany }),
          ...(data.thirdPartyContact !== undefined && { thirdPartyContact: data.thirdPartyContact }),
          ...(data.thirdPartyInsurerContact !== undefined && { thirdPartyInsurerContact: data.thirdPartyInsurerContact }),
          ...(data.status && { status: data.status }),
          ...(data.claimedAmountArs !== undefined && { claimedAmountArs: data.claimedAmountArs }),
          ...(data.realAmountArs !== undefined && { realAmountArs: data.realAmountArs }),
          ...(data.settledAmountArs !== undefined && { settledAmountArs: data.settledAmountArs }),
          ...(data.deductibleArs !== undefined && { deductibleArs: data.deductibleArs }),
          ...(data.currency && { currency: data.currency }),
          ...(data.exchangeRate !== undefined && { exchangeRate: data.exchangeRate }),
          ...(data.observations !== undefined && { observations: data.observations }),
          ...(data.assetId !== undefined && { assetId: data.assetId }),
          ...(data.policyId !== undefined && { policyId: data.policyId }),
        },
      })

      if (data.status && data.status !== existing.status) {
        await tx.claimEvent.create({
          data: {
            claimId: id,
            type: 'estado_cambiado',
            description: `Estado actualizado: "${existing.status}" → "${data.status}".`,
            date: new Date(),
            previousStatus: existing.status,
            newStatus: data.status,
            createdBy: 'Sistema',
          },
        })
      }

      for (const change of amountChanges) {
        await tx.claimEvent.create({
          data: {
            claimId: id,
            type: 'monto_actualizado',
            description: `${change.label} actualizado: ${change.previous ?? 0} → ${change.next}.`,
            date: new Date(),
            amountLabel: change.label,
            previousAmount: change.previous,
            newAmount: change.next,
            createdBy: 'Sistema',
          },
        })
      }

      // Re-fetch dentro de la misma transacción para que la respuesta incluya
      // los ClaimEvent recién creados (el include del update de arriba se
      // resolvió antes de que existieran).
      return tx.claim.findUniqueOrThrow({ where: { id }, include: CLAIM_DETAIL_INCLUDE })
    })

    return {
      ...updated,
      events: updated.events.map((e) => mapEvent(e as unknown as Record<string, unknown>)),
      expenses: updated.expenses.map((e) => mapExpense(e as unknown as Record<string, unknown>)),
    }
  },

  async softDelete(id: string) {
    await this.assertExists(id)
    await prisma.claim.update({ where: { id }, data: { isActive: false } })
  },

  // ── Events ────────────────────────────────────────────────────────────────────

  async findEvents(claimId: string) {
    await this.assertExists(claimId)
    const events = await prisma.claimEvent.findMany({
      where: { claimId },
      orderBy: { date: 'desc' },
    })
    return events.map((e) => mapEvent(e as unknown as Record<string, unknown>))
  },

  async addEvent(claimId: string, data: AddEventDTO, createdBy?: string) {
    await this.assertExists(claimId)

    const event = await prisma.claimEvent.create({
      data: {
        claimId,
        type: data.type,
        description: data.description,
        date: data.date,
        previousStatus: data.previousStatus ?? null,
        newStatus: data.newStatus ?? null,
        amountLabel: data.amountLabel ?? null,
        previousAmount: data.previousAmount ?? null,
        newAmount: data.newAmount ?? null,
        createdBy: createdBy ?? null,
      },
    })

    return mapEvent(event as unknown as Record<string, unknown>)
  },

  async deleteEvent(claimId: string, eventId: string) {
    const event = await prisma.claimEvent.findFirst({ where: { id: eventId, claimId } })
    if (!event) throw new AppError(404, 'Evento no encontrado', 'NOT_FOUND')
    await prisma.claimEvent.delete({ where: { id: eventId } })
  },

  // ── Expenses ──────────────────────────────────────────────────────────────────

  async findExpenses(claimId: string) {
    await this.assertExists(claimId)
    const expenses = await prisma.claimExpense.findMany({
      where: { claimId },
      orderBy: { date: 'desc' },
    })
    return expenses.map((e) => mapExpense(e as unknown as Record<string, unknown>))
  },

  async addExpense(claimId: string, data: CreateExpenseDTO, createdBy?: string) {
    await this.assertExists(claimId)

    const total = computeTotalAmount({
      netAmount: data.netAmount,
      vatAmount: data.vatAmount,
      otherTaxesAmount: data.otherTaxesAmount,
    })

    const [expense] = await prisma.$transaction([
      prisma.claimExpense.create({
        data: {
          claimId,
          date: data.date,
          provider: data.provider,
          receiptNumber: data.receiptNumber ?? null,
          netAmount: data.netAmount,
          vatAmount: data.vatAmount,
          otherTaxesAmount: data.otherTaxesAmount,
          createdBy: createdBy ?? null,
        },
      }),
      prisma.claimEvent.create({
        data: {
          claimId,
          type: 'gasto_agregado',
          description: `Gasto registrado: ${data.provider} — $${total.toFixed(2)}`,
          date: data.date,
          createdBy: createdBy ?? 'Sistema',
        },
      }),
    ])

    return mapExpense(expense as unknown as Record<string, unknown>)
  },

  async updateExpense(claimId: string, expenseId: string, data: UpdateExpenseDTO, updatedBy?: string) {
    const existing = await prisma.claimExpense.findFirst({ where: { id: expenseId, claimId } })
    if (!existing) throw new AppError(404, 'Gasto no encontrado', 'NOT_FOUND')

    const total = computeTotalAmount({
      netAmount: data.netAmount ?? existing.netAmount,
      vatAmount: data.vatAmount ?? existing.vatAmount,
      otherTaxesAmount: data.otherTaxesAmount ?? existing.otherTaxesAmount,
    })

    const [expense] = await prisma.$transaction([
      prisma.claimExpense.update({
        where: { id: expenseId },
        data: {
          ...(data.date && { date: data.date }),
          ...(data.provider !== undefined && { provider: data.provider }),
          ...(data.receiptNumber !== undefined && { receiptNumber: data.receiptNumber }),
          ...(data.netAmount !== undefined && { netAmount: data.netAmount }),
          ...(data.vatAmount !== undefined && { vatAmount: data.vatAmount }),
          ...(data.otherTaxesAmount !== undefined && { otherTaxesAmount: data.otherTaxesAmount }),
        },
      }),
      prisma.claimEvent.create({
        data: {
          claimId,
          type: 'gasto_editado',
          description: `Gasto editado: ${data.provider ?? existing.provider} — $${total.toFixed(2)}`,
          date: new Date(),
          createdBy: updatedBy ?? 'Sistema',
        },
      }),
    ])

    return mapExpense(expense as unknown as Record<string, unknown>)
  },

  async deleteExpense(claimId: string, expenseId: string, deletedBy?: string) {
    const expense = await prisma.claimExpense.findFirst({ where: { id: expenseId, claimId } })
    if (!expense) throw new AppError(404, 'Gasto no encontrado', 'NOT_FOUND')

    await prisma.$transaction([
      prisma.claimExpense.delete({ where: { id: expenseId } }),
      prisma.claimEvent.create({
        data: {
          claimId,
          type: 'gasto_eliminado',
          description: `Gasto eliminado: ${expense.provider} — $${expense.netAmount.toFixed(2)} (neto)`,
          date: new Date(),
          createdBy: deletedBy ?? 'Sistema',
        },
      }),
    ])
  },

  // ── Attachments ───────────────────────────────────────────────────────────────

  async findAttachments(claimId: string) {
    await this.assertExists(claimId)
    return prisma.claimAttachment.findMany({
      where: { claimId },
      orderBy: { uploadedAt: 'desc' },
    })
  },

  async addAttachment(
    claimId: string,
    file: Express.Multer.File,
    meta: AddClaimAttachmentDTO,
    uploadedBy: string,
  ) {
    await this.assertExists(claimId)

    if (!isAllowedMimetype(file.mimetype)) {
      throw new AppError(415, 'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel, Word, video', 'UNSUPPORTED_MEDIA_TYPE')
    }

    if (!matchesDeclaredMimetype(file.buffer, file.mimetype)) {
      throw new AppError(415, 'El contenido del archivo no coincide con su tipo declarado', 'FILE_TYPE_MISMATCH')
    }

    let fileUrl = `local://${file.originalname}`
    let cloudinaryPublicId: string | null = null

    if (isCloudinaryConfigured()) {
      const result = await uploadToCloudinary(file.buffer, 'claims', file.mimetype)
      fileUrl = result.secure_url
      cloudinaryPublicId = result.public_id
    }

    try {
      return await prisma.claimAttachment.create({
        data: {
          claimId,
          name: sanitizeFileName(file.originalname),
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

  async deleteAttachment(claimId: string, attachmentId: string) {
    const attachment = await prisma.claimAttachment.findFirst({
      where: { id: attachmentId, claimId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (attachment.cloudinaryPublicId) {
      await deleteFromCloudinary(attachment.cloudinaryPublicId)
    }
    await prisma.claimAttachment.delete({ where: { id: attachmentId } })
  },

  async getAttachmentForDownload(claimId: string, attachmentId: string) {
    const attachment = await prisma.claimAttachment.findFirst({
      where: { id: attachmentId, claimId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    return attachment
  },

  // ── Private ───────────────────────────────────────────────────────────────────

  async assertExists(id: string) {
    const claim = await prisma.claim.findUnique({ where: { id }, select: { id: true } })
    if (!claim) throw new AppError(404, 'Siniestro no encontrado', 'NOT_FOUND')
  },
}
