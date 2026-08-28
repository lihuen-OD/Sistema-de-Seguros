import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { computePolicyStatus, buildPolicyStatusFilter, toDateStr } from '../../shared/utils/dates'
import { computeDualAmounts } from '../../shared/utils/currency'
import { detectFileType, formatFileSize, sanitizeFileName } from '../../shared/utils/files'
import { deleteFromCloudinary } from '../../config/cloudinary'
import { validateAndUploadAttachment, withAttachmentRollback } from '../../shared/services/attachment-upload.service'
import type {
  CreatePolicyDTO,
  UpdatePolicyDTO,
  ReplaceCoveragesDTO,
  PolicyAssetCoverageInputDTO,
  ListPoliciesQueryDTO,
  AddPolicyAttachmentDTO,
} from './policies.schemas'

// La tarjeta de circulación (y cualquier otro adjunto) ahora cuelga de la
// línea de cobertura, no de la póliza — así una póliza de flota con varios
// vehículos sabe de qué activo es cada documento (antes quedaban todos
// sueltos en una sola lista de la póliza).
const COVERAGE_DETAIL_INCLUDE = {
  insuranceType: { include: { coverages: true } },
  company: { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true, code: true } },
  // fixedAsset (Bien de Uso completo, no solo el código) y allocations
  // (Centro de Costo del activo, puede repartirse en varios por %) — para
  // que "Activos Cubiertos" en el detalle de póliza pueda mostrar ambos sin
  // otro fetch (ver PolicyDetailPage.tsx).
  asset: {
    select: {
      id: true, code: true, name: true, assetType: true, fixedAssetCode: true,
      metadata: true, brand: true, model: true,
      fixedAsset: { select: { id: true, code: true, name: true } },
      allocations: { select: { percentage: true, costCenter: { select: { id: true, code: true, name: true } } } },
    },
  },
  attachments: {
    where: { isCirculationCard: true },
    select: { id: true, fileUrl: true, name: true },
    orderBy: { uploadedAt: 'desc' as const },
    take: 1,
  },
  _count: { select: { attachments: true } },
}

const COVERAGE_LIST_SELECT = {
  id: true,
  assetId: true,
  insuranceTypeId: true,
  coverageIds: true,
  insuredAmount: true,
  currency: true,
  exchangeRate: true,
  insuredAmountArs: true,
  insuredAmountUsd: true,
  companyId: true,
  costCenterId: true,
  insuranceType: { select: { id: true, name: true } },
  asset: { select: { id: true, name: true } },
  attachments: {
    where: { isCirculationCard: true },
    select: { id: true, fileUrl: true, name: true },
    orderBy: { uploadedAt: 'desc' as const },
    take: 1,
  },
  _count: { select: { attachments: true } },
}

const POLICY_DETAIL_INCLUDE = {
  producer: true,
  coverages: {
    include: COVERAGE_DETAIL_INCLUDE,
    orderBy: { createdAt: 'asc' as const },
  },
}

function withStatus<T extends {
  startDate: Date | string
  endDate: Date | string
  deactivatedAt: Date | string | null
}>(policy: T) {
  return {
    ...policy,
    startDate: toDateStr(policy.startDate),
    endDate: toDateStr(policy.endDate),
    status: policy.deactivatedAt ? 'de_baja' : computePolicyStatus(policy.endDate),
  }
}

function withSelectedCoverages<T extends { insuranceType: { coverages: { id: string; name: string }[] }; coverageIds: string[] }>(
  coverage: T,
) {
  const selectedCoverages = coverage.insuranceType.coverages.filter((c) => coverage.coverageIds.includes(c.id))
  return { ...coverage, selectedCoverages }
}

// Agrega, a partir de las líneas de cobertura reales, los totales que
// necesita cualquier vista de la póliza (lista, detalle, ficha, o la
// respuesta de create/update) — centralizado acá para que ningún endpoint se
// olvide de calcularlo (antes solo lo hacía findAll, y findById/create/
// update/markAsDeBaja devolvían la suma asegurada en 0).
function withPolicyAggregates<T extends {
  coverages: {
    assetId: string | null
    asset?: { name: string } | null
    insuranceType: { name: string }
    insuredAmountArs: number | null
    insuredAmountUsd: number | null
    attachments: { id: string; fileUrl: string; name: string }[]
    _count: { attachments: number }
  }[]
}>(policy: T) {
  const { coverages } = policy
  const assetIds = new Set(coverages.map((c) => c.assetId).filter((id): id is string => !!id))
  const assetNames = [...new Set(coverages.map((c) => c.asset?.name).filter((n): n is string => !!n))]
  const insuranceTypeNames = [...new Set(coverages.map((c) => c.insuranceType.name))]
  const totalInsuredAmountArs = coverages.reduce((s, c) => s + (c.insuredAmountArs ?? 0), 0)
  const totalInsuredAmountUsd = coverages.reduce((s, c) => s + (c.insuredAmountUsd ?? 0), 0)
  const circulationCardAttachment = coverages.flatMap((c) => c.attachments)[0] ?? null
  const attachmentsCount = coverages.reduce((s, c) => s + c._count.attachments, 0)

  return {
    ...policy,
    coverageCount: coverages.length,
    assetCount: assetIds.size,
    hasSinActivo: coverages.some((c) => !c.assetId),
    assetNames,
    insuranceTypeNames,
    totalInsuredAmountArs,
    totalInsuredAmountUsd,
    circulationCardAttachment,
    attachmentsCount,
  }
}

async function assertPolicyExists(id: string) {
  const exists = await prisma.policy.findUnique({ where: { id }, select: { id: true } })
  if (!exists) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
}

async function assertCoverageBelongsToPolicy(policyId: string, coverageId: string) {
  const coverage = await prisma.policyAssetCoverage.findFirst({ where: { id: coverageId, policyId }, select: { id: true } })
  if (!coverage) throw new AppError(404, 'Línea de cobertura no encontrada', 'NOT_FOUND')
}

// Valida referencias (tipo de seguro activo, coberturas pertenecen a ese
// tipo, activo/empresa/centro de costo activos) y cierra insuredAmount en
// ambas monedas — comparte esta lógica create() y replaceCoverages().
async function resolveCoverageInput(input: PolicyAssetCoverageInputDTO) {
  const [insuranceType, asset, company, costCenter] = await Promise.all([
    prisma.insuranceType.findFirst({ where: { id: input.insuranceTypeId, isActive: true }, include: { coverages: true } }),
    input.assetId
      ? prisma.asset.findFirst({ where: { id: input.assetId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    input.companyId
      ? prisma.company.findFirst({ where: { id: input.companyId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    input.costCenterId
      ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
  ])

  if (!insuranceType) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')
  if (input.assetId && !asset) throw new AppError(400, 'Activo no encontrado o inactivo', 'INVALID_REFERENCE')
  if (input.companyId && !company) throw new AppError(400, 'Empresa no encontrada o inactiva', 'INVALID_REFERENCE')
  if (input.costCenterId && !costCenter) throw new AppError(400, 'Centro de costo no encontrado o inactivo', 'INVALID_REFERENCE')

  if (input.coverageIds.length > 0) {
    const validIds = new Set(insuranceType.coverages.map((c) => c.id))
    const invalid = input.coverageIds.filter((id) => !validIds.has(id))
    if (invalid.length > 0) {
      throw new AppError(400, 'Una o más coberturas no pertenecen al tipo de seguro seleccionado', 'INVALID_REFERENCE')
    }
  }

  const { amountArs, amountUsd } = computeDualAmounts(input.insuredAmount, input.currency, input.exchangeRate)

  return {
    assetId: input.assetId ?? null,
    insuranceTypeId: input.insuranceTypeId,
    coverageIds: input.coverageIds,
    insuredAmount: input.insuredAmount,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    insuredAmountArs: amountArs,
    insuredAmountUsd: amountUsd,
    companyId: input.companyId ?? null,
    costCenterId: input.costCenterId ?? null,
    beneficiaryDescription: input.beneficiaryDescription ?? null,
  }
}

function assertNoDuplicateAssets(coverages: PolicyAssetCoverageInputDTO[]) {
  const assetIds = coverages.map((c) => c.assetId).filter((id): id is string => !!id)
  if (new Set(assetIds).size !== assetIds.length) {
    throw new AppError(400, 'Un mismo activo no puede repetirse en la misma póliza', 'INVALID_REFERENCE')
  }
}

export const policiesService = {
  async findAll(query: ListPoliciesQueryDTO) {
    const { page, limit, skip } = getPaginationParams(query)

    const where = {
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.status && buildPolicyStatusFilter(query.status)),
      ...(query.insuranceTypeId && { coverages: { some: { insuranceTypeId: query.insuranceTypeId } } }),
      ...(query.assetId && { coverages: { some: { assetId: query.assetId } } }),
      ...(query.companyId && {
        coverages: {
          some: {
            OR: [
              { companyId: query.companyId },
              { asset: { allocations: { some: { companyId: query.companyId } } } },
            ],
          },
        },
      }),
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
        include: {
          producer: { select: { id: true, name: true } },
          coverages: { select: COVERAGE_LIST_SELECT },
          _count: { select: { coverages: true } },
        },
      }),
      prisma.policy.count({ where }),
    ])

    return buildPaginatedResponse(
      rawData.map((p) => {
        // Con varios activos (o varios tipos de seguro) por póliza, el
        // listado agrega en vez de mostrar un solo valor — el detalle de
        // cada línea vive en /policies/:id/coverages.
        const assetCoverage = query.assetId ? p.coverages.find((c) => c.assetId === query.assetId) : undefined
        const { coverages, ...aggregated } = withPolicyAggregates(p)

        return withStatus({
          ...aggregated,
          // Detalle liviano por línea — solo para consumidores que necesitan
          // agregar por activo/tipo de seguro sobre MUCHAS pólizas a la vez
          // (Dashboard de Seguros), sin pagar un N+1 de /coverages por póliza.
          ...(query.includeCoverages && {
            coverages: coverages.map((c) => ({
              id: c.id,
              policyId: p.id,
              assetId: c.assetId,
              insuranceTypeId: c.insuranceTypeId,
              insuranceType: c.insuranceType,
              coverageIds: c.coverageIds,
              insuredAmount: c.insuredAmount,
              currency: c.currency,
              exchangeRate: c.exchangeRate,
              insuredAmountArs: c.insuredAmountArs,
              insuredAmountUsd: c.insuredAmountUsd,
              companyId: c.companyId,
              costCenterId: c.costCenterId,
            })),
          }),
          assetCoverage: assetCoverage
            ? {
                id: assetCoverage.id,
                insuranceTypeId: assetCoverage.insuranceTypeId,
                insuranceTypeName: assetCoverage.insuranceType.name,
                insuredAmount: assetCoverage.insuredAmount,
                currency: assetCoverage.currency,
                exchangeRate: assetCoverage.exchangeRate,
                insuredAmountArs: assetCoverage.insuredAmountArs,
                insuredAmountUsd: assetCoverage.insuredAmountUsd,
                circulationCardAttachment: assetCoverage.attachments[0] ?? null,
              }
            : null,
        })
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

    return withStatus(withPolicyAggregates({ ...policy, coverages: policy.coverages.map(withSelectedCoverages) }))
  },

  async create(data: CreatePolicyDTO) {
    const exists = await prisma.policy.findUnique({ where: { policyNumber: data.policyNumber }, select: { id: true } })
    if (exists) throw new AppError(409, 'Ya existe una póliza con ese número', 'CONFLICT')

    if (data.producerId) {
      const producer = await prisma.producer.findFirst({ where: { id: data.producerId, isActive: true }, select: { id: true } })
      if (!producer) throw new AppError(400, 'Productor no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    assertNoDuplicateAssets(data.coverages)
    const resolvedCoverages = await Promise.all(data.coverages.map((c) => resolveCoverageInput(c)))

    const { coverages: _coverages, ...policyData } = data
    const policy = await prisma.policy.create({
      data: {
        ...policyData,
        coverages: { create: resolvedCoverages },
      },
      include: POLICY_DETAIL_INCLUDE,
    })

    return withStatus(withPolicyAggregates({ ...policy, coverages: policy.coverages.map(withSelectedCoverages) }))
  },

  async update(id: string, data: UpdatePolicyDTO) {
    await assertPolicyExists(id)

    if (data.producerId) {
      const producer = await prisma.producer.findFirst({ where: { id: data.producerId, isActive: true }, select: { id: true } })
      if (!producer) throw new AppError(400, 'Productor no encontrado o inactivo', 'INVALID_REFERENCE')
    }

    const updated = await prisma.policy.update({
      where: { id },
      data,
      include: POLICY_DETAIL_INCLUDE,
    })

    return withStatus(withPolicyAggregates({ ...updated, coverages: updated.coverages.map(withSelectedCoverages) }))
  },

  // Elimina la póliza por completo (no es soft-delete) y desvincula todo lo
  // que la referenciaba, en vez de borrarlo. Las líneas de cobertura y sus
  // adjuntos se borran solos vía onDelete: Cascade, y Claim.policyId /
  // AccountingDocument.policyId se limpian solos vía onDelete: SetNull (ver
  // schema.prisma) — no hace falta tocarlos a mano. Lo que sí hay que
  // resolver a mano:
  // - DocumentPolicyAllocation tiene FK RESTRICT hacia policy_asset_coverages
  //   (la columna es obligatoria, no se puede dejar en null) — hay que borrar
  //   esas filas antes de poder borrar la póliza. Los documentos (Factura/
  //   NC/ND/Ajuste/Endoso) que las tenían NO se borran, solo pierden esa
  //   línea de distribución por activo.
  // - ProducerTask.policyId no tiene una FK real en la base (es un id
  //   suelto) — si no se limpia a mano, queda apuntando para siempre a una
  //   póliza que ya no existe.
  async hardDelete(id: string) {
    const policy = await prisma.policy.findUnique({
      where: { id },
      select: {
        id: true,
        coverages: { select: { id: true, attachments: { select: { cloudinaryPublicId: true } } } },
      },
    })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    const coverageIds = policy.coverages.map((c) => c.id)
    const cloudinaryIds = policy.coverages
      .flatMap((c) => c.attachments)
      .map((a) => a.cloudinaryPublicId)
      .filter((cid): cid is string => !!cid)

    // Cloudinary vive fuera de la transacción de Postgres — se limpia antes,
    // best-effort, mismo criterio que ya usa deleteAttachment() para un
    // adjunto suelto.
    await Promise.all(cloudinaryIds.map((cid) => deleteFromCloudinary(cid).catch(() => undefined)))

    await prisma.$transaction([
      prisma.documentPolicyAllocation.deleteMany({ where: { policyAssetCoverageId: { in: coverageIds } } }),
      prisma.producerTask.updateMany({ where: { policyId: id }, data: { policyId: null } }),
      prisma.policy.delete({ where: { id } }),
    ])
  },

  // Acción manual del admin — solo permitida desde "Vencida", nunca automática.
  async markAsDeBaja(id: string) {
    const policy = await prisma.policy.findUnique({ where: { id }, select: { id: true, endDate: true, deactivatedAt: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    if (policy.deactivatedAt) throw new AppError(409, 'La póliza ya está dada de baja', 'CONFLICT')
    if (computePolicyStatus(policy.endDate) !== 'vencida') {
      throw new AppError(400, 'Solo se puede dar de baja una póliza vencida', 'INVALID_STATE')
    }
    const updated = await prisma.policy.update({
      where: { id },
      data: { deactivatedAt: new Date() },
      include: POLICY_DETAIL_INCLUDE,
    })
    return withStatus(withPolicyAggregates({ ...updated, coverages: updated.coverages.map(withSelectedCoverages) }))
  },

  // ── Líneas de cobertura ──────────────────────────────────────────────────────

  async findCoverages(policyId: string) {
    await assertPolicyExists(policyId)
    const coverages = await prisma.policyAssetCoverage.findMany({
      where: { policyId },
      include: COVERAGE_DETAIL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    })
    return coverages.map(withSelectedCoverages)
  },

  // Reemplazo por diff, no por borrar-y-recrear todo: una línea que viene
  // con `id` se actualiza en el lugar (conserva sus adjuntos); una sin `id`
  // es nueva; las que ya no vienen en el array se borran (eso sí cascadea
  // sus adjuntos — es la salida esperada si se sacó ese activo de la póliza).
  async replaceCoverages(policyId: string, data: ReplaceCoveragesDTO) {
    await assertPolicyExists(policyId)
    assertNoDuplicateAssets(data.coverages)

    const existing = await prisma.policyAssetCoverage.findMany({ where: { policyId }, select: { id: true } })
    const existingIds = new Set(existing.map((c) => c.id))

    for (const c of data.coverages) {
      if (c.id && !existingIds.has(c.id)) {
        throw new AppError(400, 'Una de las líneas de cobertura no pertenece a esta póliza', 'INVALID_REFERENCE')
      }
    }

    const incomingIds = new Set(data.coverages.filter((c) => c.id).map((c) => c.id as string))
    const toDeleteIds = [...existingIds].filter((id) => !incomingIds.has(id))

    const resolved = await Promise.all(
      data.coverages.map(async (c) => ({ id: c.id, ...(await resolveCoverageInput(c)) })),
    )

    await prisma.$transaction([
      ...(toDeleteIds.length > 0 ? [prisma.policyAssetCoverage.deleteMany({ where: { id: { in: toDeleteIds } } })] : []),
      ...resolved.map(({ id: lineId, ...rest }) =>
        lineId
          ? prisma.policyAssetCoverage.update({ where: { id: lineId }, data: rest })
          : prisma.policyAssetCoverage.create({ data: { ...rest, policyId } }),
      ),
    ])

    return this.findCoverages(policyId)
  },

  // ── Attachments (por línea de cobertura) ─────────────────────────────────────

  async findAttachments(policyId: string, coverageId: string) {
    await assertCoverageBelongsToPolicy(policyId, coverageId)
    return prisma.policyAttachment.findMany({
      where: { policyAssetCoverageId: coverageId },
      orderBy: { uploadedAt: 'desc' },
    })
  },

  async addAttachment(
    policyId: string,
    coverageId: string,
    file: Express.Multer.File,
    meta: AddPolicyAttachmentDTO,
    uploadedBy: string,
  ) {
    await assertCoverageBelongsToPolicy(policyId, coverageId)

    const { fileUrl, cloudinaryPublicId } = await validateAndUploadAttachment(file, 'policies')

    return withAttachmentRollback(cloudinaryPublicId, () =>
      prisma.policyAttachment.create({
        data: {
          policyAssetCoverageId: coverageId,
          name: sanitizeFileName(file.originalname),
          description: meta.description ?? null,
          fileType: detectFileType(file.mimetype),
          fileSize: formatFileSize(file.size),
          fileUrl,
          cloudinaryPublicId,
          isCirculationCard: meta.isCirculationCard ?? false,
          uploadedBy,
        },
      }),
    )
  },

  async deleteAttachment(policyId: string, coverageId: string, attachmentId: string) {
    await assertCoverageBelongsToPolicy(policyId, coverageId)
    const attachment = await prisma.policyAttachment.findFirst({
      where: { id: attachmentId, policyAssetCoverageId: coverageId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    if (attachment.cloudinaryPublicId) {
      await deleteFromCloudinary(attachment.cloudinaryPublicId)
    }
    await prisma.policyAttachment.delete({ where: { id: attachmentId } })
  },

  async getAttachmentForDownload(policyId: string, coverageId: string, attachmentId: string) {
    await assertCoverageBelongsToPolicy(policyId, coverageId)
    const attachment = await prisma.policyAttachment.findFirst({
      where: { id: attachmentId, policyAssetCoverageId: coverageId },
    })
    if (!attachment) throw new AppError(404, 'Adjunto no encontrado', 'NOT_FOUND')
    return attachment
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────

  async findTasks(policyId: string) {
    await assertPolicyExists(policyId)
    return prisma.producerTask.findMany({
      where: { policyId },
      include: {
        producer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    })
  },
}
