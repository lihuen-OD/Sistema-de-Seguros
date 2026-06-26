import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { detectFileType, formatFileSize, isAllowedMimetype } from '../../shared/utils/files'
import { uploadToCloudinary, deleteFromCloudinary, isCloudinaryConfigured } from '../../config/cloudinary'
import type {
  CreateAssetDTO,
  UpdateAssetDTO,
  ReplaceAllocationsDTO,
  AddValueHistoryDTO,
  AddAttachmentDTO,
  ListAssetsQueryDTO,
} from './assets.schemas'

// Lista: solo IDs de empresa/centro de costo — sin datos anidados pesados
const ASSET_LIST_INCLUDE = {
  allocations: {
    select: {
      id: true,
      companyId: true,
      costCenterId: true,
      percentage: true,
    },
    orderBy: { percentage: 'desc' as const },
  },
  _count: { select: { attachments: true, fireExtinguishers: true } },
}

// Detalle: incluye datos completos de empresa/centro de costo + historial + adjuntos
const ASSET_DETAIL_INCLUDE = {
  allocations: {
    include: {
      company: { select: { id: true, name: true, cuit: true } },
      costCenter: { select: { id: true, name: true, code: true } },
    },
    orderBy: { percentage: 'desc' as const },
  },
  _count: { select: { attachments: true, fireExtinguishers: true } },
  valueHistory: { orderBy: { date: 'desc' as const }, take: 100 },
  statusHistory: { orderBy: { date: 'asc' as const } },
  attachments: { orderBy: { uploadedAt: 'desc' as const }, take: 50 },
}

async function assertAssetExists(id: string) {
  const exists = await prisma.asset.findUnique({ where: { id }, select: { id: true } })
  if (!exists) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
}

function handleUpdateNotFound(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
    throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
  }
  throw e
}

export const assetsService = {
  async findAll(query: ListAssetsQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.assetType && { assetType: query.assetType }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { brand: { contains: query.search, mode: 'insensitive' as const } },
          { serialNumber: { contains: query.search, mode: 'insensitive' as const } },
          { location: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [data, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: ASSET_LIST_INCLUDE,
      }),
      prisma.asset.count({ where }),
    ])

    return buildPaginatedResponse(data, total, { page, limit })
  },

  async findById(id: string) {
    const asset = await prisma.asset.findUnique({
      where: { id },
      include: ASSET_DETAIL_INCLUDE,
    })
    if (!asset) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')
    return asset
  },

  async create(data: CreateAssetDTO) {
    const { allocations, ...assetData } = data

    const companyIds = [...new Set(allocations.map((a) => a.companyId))]
    const costCenterIds = [...new Set(allocations.map((a) => a.costCenterId))]

    const [existingCompanies, existingCenters] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: companyIds }, isActive: true }, select: { id: true } }),
      prisma.costCenter.findMany({ where: { id: { in: costCenterIds }, isActive: true }, select: { id: true } }),
    ])
    if (existingCompanies.length !== companyIds.length) {
      throw new AppError(400, 'Una o más empresas no existen o están inactivas', 'INVALID_REFERENCE')
    }
    if (existingCenters.length !== costCenterIds.length) {
      throw new AppError(400, 'Uno o más centros de costo no existen o están inactivos', 'INVALID_REFERENCE')
    }

    const seqResult = await prisma.$queryRaw<[{ nextval: bigint }]>`SELECT nextval('asset_code_seq')`
    const code = `ACT-${String(Number(seqResult[0].nextval)).padStart(5, '0')}`

    return prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({
        data: {
          ...assetData,
          code,
          metadata: assetData.metadata ? (assetData.metadata as Prisma.InputJsonValue) : undefined,
        },
      })

      await tx.assetAllocation.createMany({
        data: allocations.map((a) => ({
          assetId: asset.id,
          companyId: a.companyId,
          costCenterId: a.costCenterId,
          percentage: a.percentage,
        })),
      })

      if (assetData.currentValue) {
        await tx.assetValueHistory.create({
          data: {
            assetId: asset.id,
            value: assetData.currentValue,
            date: assetData.purchaseDate ?? new Date(),
            type: 'real',
            note: 'Valor inicial al alta del activo',
          },
        })
      }
      if (assetData.patrimonialValueNew) {
        await tx.assetValueHistory.create({
          data: {
            assetId: asset.id,
            value: assetData.patrimonialValueNew,
            date: assetData.purchaseDate ?? new Date(),
            type: 'nuevo',
            note: 'Valor a nuevo inicial al alta del activo',
          },
        })
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (tx as any).assetStatusHistory.create({
        data: {
          assetId: asset.id,
          status: assetData.status ?? 'activo',
          date: assetData.purchaseDate ?? new Date(),
          note: 'Alta del activo',
        },
      })

      return tx.asset.findUniqueOrThrow({
        where: { id: asset.id },
        include: ASSET_DETAIL_INCLUDE,
      })
    })
  },

  async update(id: string, data: UpdateAssetDTO) {
    // reactivationDate no es columna de assets — solo se usa para loguear el historial
    const { reactivationDate, ...assetData } = data

    const current = await prisma.asset.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!current) throw new AppError(404, 'Activo no encontrado', 'NOT_FOUND')

    if (assetData.status && assetData.status !== current.status) {
      const statusDate = assetData.status === 'baja' ? assetData.dischargeDate
        : assetData.status === 'vendido' ? assetData.saleDate
        : reactivationDate ?? new Date()

      await prisma.$transaction([
        prisma.asset.update({
          where: { id },
          data: {
            ...assetData,
            metadata: assetData.metadata ? (assetData.metadata as Prisma.InputJsonValue) : undefined,
          },
          select: { id: true },
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (prisma as any).assetStatusHistory.create({
          data: {
            assetId: id,
            status: assetData.status,
            date: statusDate ?? new Date(),
            note: assetData.status === 'baja' ? 'Activo dado de baja'
              : assetData.status === 'vendido' ? 'Activo vendido'
              : 'Activo reactivado',
          },
        }),
      ])
    } else {
      await prisma.asset.update({
        where: { id },
        data: {
          ...assetData,
          metadata: assetData.metadata ? (assetData.metadata as Prisma.InputJsonValue) : undefined,
        },
        select: { id: true },
      }).catch(handleUpdateNotFound)
    }

    return { id }
  },

  async softDelete(id: string) {
    return prisma.asset.update({
      where: { id },
      data: { isActive: false, status: 'baja' },
    }).catch(handleUpdateNotFound)
  },

  // ── Allocations ─────────────────────────────────────────────────────────────

  async replaceAllocations(assetId: string, { allocations }: ReplaceAllocationsDTO) {
    await assertAssetExists(assetId)

    const companyIds = [...new Set(allocations.map((a) => a.companyId))]
    const costCenterIds = [...new Set(allocations.map((a) => a.costCenterId))]

    const [existingCompanies, existingCenters] = await Promise.all([
      prisma.company.findMany({ where: { id: { in: companyIds }, isActive: true }, select: { id: true } }),
      prisma.costCenter.findMany({ where: { id: { in: costCenterIds }, isActive: true }, select: { id: true } }),
    ])
    if (existingCompanies.length !== companyIds.length) {
      throw new AppError(400, 'Una o más empresas no existen o están inactivas', 'INVALID_REFERENCE')
    }
    if (existingCenters.length !== costCenterIds.length) {
      throw new AppError(400, 'Uno o más centros de costo no existen o están inactivos', 'INVALID_REFERENCE')
    }

    return prisma.$transaction(async (tx) => {
      await tx.assetAllocation.deleteMany({ where: { assetId } })
      await tx.assetAllocation.createMany({
        data: allocations.map((a) => ({
          assetId,
          companyId: a.companyId,
          costCenterId: a.costCenterId,
          percentage: a.percentage,
        })),
      })
      return tx.assetAllocation.findMany({
        where: { assetId },
        include: { costCenter: { select: { id: true, name: true, code: true } } },
        orderBy: { percentage: 'desc' },
      })
    })
  },

  // ── Status History ───────────────────────────────────────────────────────────

  async findStatusHistory(assetId: string) {
    await assertAssetExists(assetId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prisma as any).assetStatusHistory.findMany({
      where: { assetId },
      orderBy: { date: 'asc' },
    })
  },

  // ── Value History ────────────────────────────────────────────────────────────

  async findValueHistory(assetId: string) {
    await assertAssetExists(assetId)
    return prisma.assetValueHistory.findMany({
      where: { assetId },
      orderBy: { date: 'desc' },
    })
  },

  async addValueHistory(assetId: string, data: AddValueHistoryDTO) {
    await assertAssetExists(assetId)
    return prisma.assetValueHistory.create({ data: { ...data, assetId } })
  },

  // ── Attachments ──────────────────────────────────────────────────────────────

  async findAttachments(assetId: string) {
    await assertAssetExists(assetId)
    return prisma.assetAttachment.findMany({
      where: { assetId },
      orderBy: { uploadedAt: 'desc' },
    })
  },

  async addAttachment(
    assetId: string,
    file: Express.Multer.File,
    meta: AddAttachmentDTO,
    uploadedBy: string,
  ) {
    await assertAssetExists(assetId)

    if (!isAllowedMimetype(file.mimetype)) {
      throw new AppError(415, 'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel', 'UNSUPPORTED_MEDIA_TYPE')
    }

    let fileUrl = `local://${file.originalname}`
    let cloudinaryPublicId: string | null = null

    if (isCloudinaryConfigured()) {
      const result = await uploadToCloudinary(file.buffer, 'assets')
      fileUrl = result.secure_url
      cloudinaryPublicId = result.public_id
    }

    try {
      return await prisma.assetAttachment.create({
        data: {
          assetId,
          name: file.originalname,
          description: meta.description ?? null,
          fileType: detectFileType(file.mimetype),
          fileSize: formatFileSize(file.size),
          fileUrl,
          cloudinaryPublicId,
          expirationDate: meta.expirationDate ?? null,
          notifyEmail: meta.notifyEmail || null,
          uploadedBy,
        },
      })
    } catch (err) {
      if (cloudinaryPublicId) await deleteFromCloudinary(cloudinaryPublicId).catch(() => undefined)
      throw err
    }
  },

  async deleteAttachment(assetId: string, attachmentId: string) {
    const attachment = await prisma.assetAttachment.findFirst({
      where: { id: attachmentId, assetId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (attachment.cloudinaryPublicId) {
      await deleteFromCloudinary(attachment.cloudinaryPublicId)
    }
    await prisma.assetAttachment.delete({ where: { id: attachmentId } })
  },
}
