import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { detectFileType, formatFileSize, isAllowedMimetype } from '../../shared/utils/files'
import type {
  CreateAssetDTO,
  UpdateAssetDTO,
  ReplaceAllocationsDTO,
  AddValueHistoryDTO,
  AddAttachmentDTO,
  ListAssetsQueryDTO,
} from './assets.schemas'

// Relaciones incluidas en detalle y lista
const ASSET_INCLUDE = {
  allocations: {
    include: { costCenter: { select: { id: true, name: true, code: true } } },
    orderBy: { percentage: 'desc' as const },
  },
  _count: { select: { attachments: true, fireExtinguishers: true } },
}

const ASSET_DETAIL_INCLUDE = {
  ...ASSET_INCLUDE,
  valueHistory: { orderBy: { date: 'desc' as const } },
  attachments: { orderBy: { uploadedAt: 'desc' as const } },
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
        include: ASSET_INCLUDE,
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

    // Verificar que los centros de costo existen y están activos
    const costCenterIds = allocations.map((a) => a.costCenterId)
    const existingCenters = await prisma.costCenter.findMany({
      where: { id: { in: costCenterIds }, isActive: true },
      select: { id: true },
    })
    if (existingCenters.length !== costCenterIds.length) {
      throw new AppError(
        400,
        'Uno o más centros de costo no existen o están inactivos',
        'INVALID_REFERENCE',
      )
    }

    return prisma.$transaction(async (tx) => {
      const asset = await tx.asset.create({ data: assetData })

      await tx.assetAllocation.createMany({
        data: allocations.map((a) => ({
          assetId: asset.id,
          costCenterId: a.costCenterId,
          percentage: a.percentage,
        })),
      })

      return tx.asset.findUniqueOrThrow({
        where: { id: asset.id },
        include: ASSET_DETAIL_INCLUDE,
      })
    })
  },

  async update(id: string, data: UpdateAssetDTO) {
    await assetsService.findById(id)
    return prisma.asset.update({
      where: { id },
      data,
      include: ASSET_DETAIL_INCLUDE,
    })
  },

  async softDelete(id: string) {
    await assetsService.findById(id)
    return prisma.asset.update({ where: { id }, data: { isActive: false } })
  },

  // ── Allocations ─────────────────────────────────────────────────────────────

  async replaceAllocations(assetId: string, { allocations }: ReplaceAllocationsDTO) {
    await assetsService.findById(assetId)

    const costCenterIds = allocations.map((a) => a.costCenterId)
    const existingCenters = await prisma.costCenter.findMany({
      where: { id: { in: costCenterIds }, isActive: true },
      select: { id: true },
    })
    if (existingCenters.length !== costCenterIds.length) {
      throw new AppError(
        400,
        'Uno o más centros de costo no existen o están inactivos',
        'INVALID_REFERENCE',
      )
    }

    return prisma.$transaction(async (tx) => {
      await tx.assetAllocation.deleteMany({ where: { assetId } })
      await tx.assetAllocation.createMany({
        data: allocations.map((a) => ({
          assetId,
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

  // ── Value History ────────────────────────────────────────────────────────────

  async findValueHistory(assetId: string) {
    await assetsService.findById(assetId)
    return prisma.assetValueHistory.findMany({
      where: { assetId },
      orderBy: { date: 'desc' },
    })
  },

  async addValueHistory(assetId: string, data: AddValueHistoryDTO) {
    await assetsService.findById(assetId)

    return prisma.$transaction(async (tx) => {
      const entry = await tx.assetValueHistory.create({ data: { ...data, assetId } })
      // Actualiza el currentValue del activo automáticamente
      await tx.asset.update({ where: { id: assetId }, data: { currentValue: data.value } })
      return entry
    })
  },

  // ── Attachments ──────────────────────────────────────────────────────────────

  async findAttachments(assetId: string) {
    await assetsService.findById(assetId)
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
    await assetsService.findById(assetId)

    if (!isAllowedMimetype(file.mimetype)) {
      throw new AppError(415, 'Tipo de archivo no permitido. Formatos: PDF, imágenes, Excel', 'UNSUPPORTED_MEDIA_TYPE')
    }

    return prisma.assetAttachment.create({
      data: {
        assetId,
        name: file.originalname,
        description: meta.description ?? null,
        fileType: detectFileType(file.mimetype),
        fileSize: formatFileSize(file.size),
        fileUrl: `pending://${file.originalname}`, // Phase 10: reemplazar con URL de Cloudinary
        expirationDate: meta.expirationDate ?? null,
        notifyEmail: meta.notifyEmail || null,
        uploadedBy,
      },
    })
  },

  async deleteAttachment(assetId: string, attachmentId: string) {
    const attachment = await prisma.assetAttachment.findFirst({
      where: { id: attachmentId, assetId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    await prisma.assetAttachment.delete({ where: { id: attachmentId } })
  },
}
