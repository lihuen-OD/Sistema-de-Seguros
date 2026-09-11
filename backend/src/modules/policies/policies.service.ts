import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { getPaginationParams, buildPaginatedResponse } from '../../shared/utils/pagination'
import { computePolicyStatus, buildPolicyStatusFilter, toDateStr, isCoverageActiveOn, todayDate } from '../../shared/utils/dates'
import { computeDualAmounts } from '../../shared/utils/currency'
import { detectFileType, formatFileSize, sanitizeFileName } from '../../shared/utils/files'
import { deleteFromCloudinary } from '../../config/cloudinary'
import { validateAndUploadAttachment, withAttachmentRollback } from '../../shared/services/attachment-upload.service'
import type {
  CreatePolicyDTO,
  UpdatePolicyDTO,
  ReplaceCoveragesDTO,
  PolicyAssetCoverageInputDTO,
  AddCoverageDTO,
  UpdateCoverageDTO,
  DeactivateCoverageDTO,
  ListPoliciesQueryDTO,
  AddPolicyAttachmentDTO,
} from './policies.schemas'

// Fecha "sin fin" para tratar una línea sin bajaDate como vigente hacia
// adelante indefinidamente al comparar rangos de vigencia (ver
// assertNoOverlappingCoverage).
const OPEN_ENDED = new Date('9999-12-31T00:00:00.000Z')

function isPrismaKnownError(err: unknown, code: string): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code
}

const COVERAGE_ASSET_CHANGE_WITH_ATTACHMENTS_MESSAGE =
  'No se puede cambiar el activo de esta cobertura porque ya tiene adjuntos cargados. Para cambiar el activo, eliminá primero los adjuntos de esta cobertura o creá una nueva línea de cobertura.'

const POLICY_ASSOCIABLE_ASSET_STATUSES = ['activo', 'vendido'] as const

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
  effectiveDate: true,
  bajaDate: true,
  bajaReason: true,
  deactivatedAt: true,
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

// Un activo puede tener más de una PolicyAssetCoverage en la misma póliza
// (dado de baja + reincorporado más adelante) — al filtrar findAll() por
// assetId hay que elegir UNA para representarlo, y tiene que ser la vigente
// hoy (isCoverageActiveOn), no la primera que aparezca en el array. Si
// ninguna está vigente (activo sin cobertura actual), cae a la más reciente
// por effectiveDate como antecedente histórico.
function pickCurrentAssetCoverage<T extends { assetId: string | null; effectiveDate: Date; bajaDate: Date | null }>(
  coverages: T[],
  assetId: string,
): T | undefined {
  const matching = coverages
    .filter((c) => c.assetId === assetId)
    .sort((a, b) => toDateStr(b.effectiveDate).localeCompare(toDateStr(a.effectiveDate)))

  return matching.find((c) => isCoverageActiveOn(c, todayDate())) ?? matching[0]
}

// Valida referencias (tipo de seguro activo, coberturas pertenecen a ese
// tipo, activo asociable a pólizas y empresa/centro de costo activos) y
// cierra insuredAmount en ambas monedas — comparte esta lógica create() y
// replaceCoverages().
async function resolveCoverageInput(input: PolicyAssetCoverageInputDTO) {
  const [insuranceType, asset, company, costCenter] = await Promise.all([
    prisma.insuranceType.findFirst({
      where: { id: input.insuranceTypeId, isActive: true },
      // Select liviano — acá solo se valida existencia y se necesita
      // coverages.id (línea `validIds` más abajo), nunca el resto de los
      // campos de InsuranceType/Coverage. El objeto no se devuelve al
      // llamador, así que no cambia ningún contrato.
      select: { id: true, coverages: { select: { id: true } } },
    }),
    input.assetId
      ? prisma.asset.findFirst({
          where: { id: input.assetId, isActive: true, status: { in: [...POLICY_ASSOCIABLE_ASSET_STATUSES] } },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.companyId
      ? prisma.company.findFirst({ where: { id: input.companyId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
    input.costCenterId
      ? prisma.costCenter.findFirst({ where: { id: input.costCenterId, isActive: true }, select: { id: true } })
      : Promise.resolve(null),
  ])

  if (!insuranceType) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')
  if (input.assetId && !asset) throw new AppError(400, 'Activo no encontrado o no asociable a pólizas', 'INVALID_REFERENCE')
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

type ResolvedCoverageInput = Awaited<ReturnType<typeof resolveCoverageInput>>

// Versión en batch de resolveCoverageInput — misma validación, mismos
// mensajes/códigos de error, línea por línea, pero resolviendo las
// referencias (tipo de seguro, activo, empresa, centro de costo) con un solo
// findMany por entidad en vez de 4 queries POR LÍNEA. Pensada para create()
// y replaceCoverages(), que reciben un array de líneas de una sola vez — en
// una póliza de flota con muchas líneas, esto pasa de ~4×N queries a 4.
// addCoverage()/updateCoverage() siguen usando resolveCoverageInput() tal
// cual: procesan una sola línea por request, no hay N+1 que agrupar ahí.
async function resolveCoverageInputsBatch(
  inputs: PolicyAssetCoverageInputDTO[],
): Promise<ResolvedCoverageInput[]> {
  const insuranceTypeIds = [...new Set(inputs.map((i) => i.insuranceTypeId))]
  const assetIds = [...new Set(inputs.map((i) => i.assetId).filter((id): id is string => !!id))]
  const companyIds = [...new Set(inputs.map((i) => i.companyId).filter((id): id is string => !!id))]
  const costCenterIds = [...new Set(inputs.map((i) => i.costCenterId).filter((id): id is string => !!id))]

  const [insuranceTypes, assets, companies, costCenters] = await Promise.all([
    prisma.insuranceType.findMany({
      where: { id: { in: insuranceTypeIds }, isActive: true },
      select: { id: true, coverages: { select: { id: true } } },
    }),
    assetIds.length > 0
      ? prisma.asset.findMany({
          where: {
            id: { in: assetIds },
            isActive: true,
            status: { in: [...POLICY_ASSOCIABLE_ASSET_STATUSES] },
          },
          select: { id: true },
        })
      : Promise.resolve([]),
    companyIds.length > 0
      ? prisma.company.findMany({ where: { id: { in: companyIds }, isActive: true }, select: { id: true } })
      : Promise.resolve([]),
    costCenterIds.length > 0
      ? prisma.costCenter.findMany({ where: { id: { in: costCenterIds }, isActive: true }, select: { id: true } })
      : Promise.resolve([]),
  ])

  const insuranceTypeById = new Map(insuranceTypes.map((t) => [t.id, t]))
  const activeAssetIds = new Set(assets.map((a) => a.id))
  const activeCompanyIds = new Set(companies.map((c) => c.id))
  const activeCostCenterIds = new Set(costCenters.map((c) => c.id))

  return inputs.map((input) => {
    const insuranceType = insuranceTypeById.get(input.insuranceTypeId)
    if (!insuranceType) throw new AppError(400, 'Tipo de seguro no encontrado o inactivo', 'INVALID_REFERENCE')
    if (input.assetId && !activeAssetIds.has(input.assetId)) {
      throw new AppError(400, 'Activo no encontrado o no asociable a pólizas', 'INVALID_REFERENCE')
    }
    if (input.companyId && !activeCompanyIds.has(input.companyId)) {
      throw new AppError(400, 'Empresa no encontrada o inactiva', 'INVALID_REFERENCE')
    }
    if (input.costCenterId && !activeCostCenterIds.has(input.costCenterId)) {
      throw new AppError(400, 'Centro de costo no encontrado o inactivo', 'INVALID_REFERENCE')
    }

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
  })
}

// Usado por create() y replaceCoverages() — alcanza para evitar duplicados
// dentro de una misma póliza nueva sin un chequeo de solapamiento aparte:
// create() solo puede generar líneas con bajaDate null (no hay forma de
// mandar bajaDate al crear una póliza), así que dos líneas del mismo activo
// en la misma alta siempre chocan también contra el índice único parcial de
// Fase 1 (bajaDate IS NULL) — y como la póliza es nueva, no puede haber
// ninguna línea previa con baja futura contra la cual solapar. El gap real
// de solapamiento (línea existente con baja a futuro) solo puede darse
// contra líneas YA persistidas, algo que create() nunca tiene.
function assertNoDuplicateAssets(coverages: PolicyAssetCoverageInputDTO[]) {
  const assetIds = coverages.map((c) => c.assetId).filter((id): id is string => !!id)
  if (new Set(assetIds).size !== assetIds.length) {
    throw new AppError(400, 'Un mismo activo no puede repetirse en la misma póliza', 'INVALID_REFERENCE')
  }
}

// ── Ciclo de vida de la línea de cobertura (Fase 2) ──────────────────────────

function assertEffectiveDateWithinPolicy(effectiveDate: Date, policy: { startDate: Date; endDate: Date }) {
  if (effectiveDate < policy.startDate || effectiveDate > policy.endDate) {
    throw new AppError(
      400,
      'La fecha de alta debe estar dentro de la vigencia de la póliza',
      'INVALID_DATE_RANGE',
    )
  }
}

function assertBajaDateValid(bajaDate: Date, effectiveDate: Date, policyEndDate: Date) {
  if (bajaDate < effectiveDate) {
    throw new AppError(400, 'La fecha de baja no puede ser anterior a la fecha de alta', 'INVALID_DATE_RANGE')
  }
  if (bajaDate > policyEndDate) {
    throw new AppError(400, 'La fecha de baja no puede ser posterior al vencimiento de la póliza', 'INVALID_DATE_RANGE')
  }
}

// Comparación pura de rangos — separada de assertNoOverlappingCoverage para
// poder reusarla en replaceCoverages sobre datos ya traídos en memoria (la
// lista `existing`), sin pagar una query de más por cada línea nueva.
function assertRangeNotOverlapping(
  effectiveDate: Date,
  bajaDate: Date | null,
  siblings: { effectiveDate: Date; bajaDate: Date | null }[],
) {
  const newEnd = bajaDate ?? OPEN_ENDED
  const overlaps = siblings.some((s) => {
    const siblingEnd = s.bajaDate ?? OPEN_ENDED
    return s.effectiveDate <= newEnd && effectiveDate <= siblingEnd
  })

  if (overlaps) {
    throw new AppError(
      409,
      'Ya existe otra línea de este activo en esta póliza cuya vigencia se superpone con las fechas indicadas',
      'COVERAGE_OVERLAP',
    )
  }
}

// Dos líneas del mismo activo en la misma póliza no pueden tener vigencias
// solapadas — bajaDate null se trata como "sin fin" (OPEN_ENDED). Cubre tanto
// el caso simple (otra línea sigue activa) como el de baja programada a
// futuro, que el índice único parcial de Fase 1 (solo bajaDate IS NULL) no
// alcanza a bloquear por sí solo.
async function assertNoOverlappingCoverage(
  policyId: string,
  assetId: string,
  effectiveDate: Date,
  bajaDate: Date | null,
  excludeCoverageId?: string,
) {
  const siblings = await prisma.policyAssetCoverage.findMany({
    where: {
      policyId,
      assetId,
      ...(excludeCoverageId && { id: { not: excludeCoverageId } }),
    },
    select: { effectiveDate: true, bajaDate: true },
  })

  assertRangeNotOverlapping(effectiveDate, bajaDate, siblings)
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
        const assetCoverage = query.assetId ? pickCurrentAssetCoverage(p.coverages, query.assetId) : undefined
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
              // Sin esto, un consumidor que necesite elegir la línea vigente
              // de un activo (ver pickActiveCoverageForAsset en el frontend)
              // no puede distinguirla de una histórica dada de baja.
              effectiveDate: toDateStr(c.effectiveDate),
              bajaDate: c.bajaDate ? toDateStr(c.bajaDate) : null,
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
                // Para que el consumidor (ej. AssetDetailPage) sepa si esta
                // línea es la vigente o quedó como antecedente histórico —
                // ver pickCurrentAssetCoverage.
                effectiveDate: toDateStr(assetCoverage.effectiveDate),
                bajaDate: assetCoverage.bajaDate ? toDateStr(assetCoverage.bajaDate) : null,
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
    const resolvedCoverages = await resolveCoverageInputsBatch(data.coverages)

    const { coverages: _coverages, ...policyData } = data
    const policy = await prisma.policy.create({
      data: {
        ...policyData,
        // effectiveDate: el frontend todavía no manda una fecha de alta por
        // línea (eso llega en la próxima fase) — hasta entonces, toda línea
        // nueva hereda la fecha de inicio de la póliza que la contiene, mismo
        // criterio que el backfill de líneas preexistentes.
        coverages: { create: resolvedCoverages.map((c) => ({ ...c, effectiveDate: data.startDate })) },
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

  // Acción manual del admin — permitida para cualquier estado excepto ya dada de baja.
  async markAsDeBaja(id: string) {
    const policy = await prisma.policy.findUnique({ where: { id }, select: { id: true, deactivatedAt: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    if (policy.deactivatedAt) throw new AppError(409, 'La póliza ya está dada de baja', 'CONFLICT')
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
    // Reemplaza el chequeo genérico de assertPolicyExists por uno que además
    // trae startDate — sin sumar una query nueva — porque una línea nueva
    // (sin id, ver más abajo) necesita effectiveDate y el frontend todavía no
    // manda una fecha de alta propia por línea (llega en la próxima fase).
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { startDate: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
    assertNoDuplicateAssets(data.coverages)

    const existing = await prisma.policyAssetCoverage.findMany({
      where: { policyId },
      select: {
        id: true, assetId: true, effectiveDate: true, bajaDate: true,
        _count: { select: { attachments: true, allocations: true } },
      },
    })
    const existingIds = new Set(existing.map((c) => c.id))
    const existingById = new Map(existing.map((c) => [c.id, c]))

    for (const c of data.coverages) {
      if (c.id && !existingIds.has(c.id)) {
        throw new AppError(400, 'Una de las líneas de cobertura no pertenece a esta póliza', 'INVALID_REFERENCE')
      }

      const persisted = c.id ? existingById.get(c.id) : undefined
      if (persisted && persisted.assetId !== (c.assetId ?? null) && persisted._count.attachments > 0) {
        throw new AppError(409, COVERAGE_ASSET_CHANGE_WITH_ATTACHMENTS_MESSAGE, 'COVERAGE_ASSET_CHANGE_BLOCKED')
      }
    }

    const incomingIds = new Set(data.coverages.filter((c) => c.id).map((c) => c.id as string))
    const toDeleteIds = [...existingIds].filter((id) => !incomingIds.has(id))

    // Una línea persistida que sale del array solo se puede borrar
    // físicamente acá si no tiene historial — si ya tiene adjuntos o
    // asignaciones de documentos, hay que darla de baja explícitamente
    // (POST .../de-baja), nunca sacarla en silencio de un PUT masivo.
    const blockedDeletion = toDeleteIds
      .map((id) => existingById.get(id)!)
      .find((c) => c._count.attachments > 0 || c._count.allocations > 0)
    if (blockedDeletion) {
      throw new AppError(
        409,
        'No se puede quitar una línea de cobertura que ya tiene adjuntos o documentos asociados. Dala de baja en lugar de eliminarla.',
        'COVERAGE_HAS_HISTORY',
      )
    }

    // Una línea NUEVA (sin id) que elige un activo no puede solaparse en el
    // tiempo con NINGUNA línea existente de ese mismo activo — incluidas las
    // que este mismo request va a borrar más abajo (toDeleteIds): si esa
    // línea ya tiene una baja formal (bajaDate/bajaReason reales, aunque sea
    // a futuro), un PUT masivo no puede pisarla en silencio con un
    // delete+create. Mismo chequeo que addCoverage, pero en memoria sobre
    // `existing` (ya traído arriba) en vez de una query nueva por línea.
    for (const c of data.coverages) {
      if (!c.id && c.assetId) {
        const siblings = existing
          .filter((e) => e.assetId === c.assetId)
          .map((e) => ({ effectiveDate: e.effectiveDate, bajaDate: e.bajaDate }))
        assertRangeNotOverlapping(policy.startDate, null, siblings)
      }
    }

    // Batch en vez de un resolveCoverageInput por línea — resolveCoverageInputsBatch
    // conserva el orden de entrada, así que se puede zipear por índice con el
    // `id` original de cada línea (create()/update() más abajo dependen de
    // saber si la línea es nueva o existente).
    const batchResolved = await resolveCoverageInputsBatch(data.coverages)
    const resolved = data.coverages.map((c, i) => ({ id: c.id, ...batchResolved[i] }))

    try {
      await prisma.$transaction([
        ...(toDeleteIds.length > 0 ? [prisma.policyAssetCoverage.deleteMany({ where: { id: { in: toDeleteIds } } })] : []),
        ...resolved.map(({ id: lineId, ...rest }) =>
          lineId
            ? prisma.policyAssetCoverage.update({ where: { id: lineId }, data: rest })
            : prisma.policyAssetCoverage.create({ data: { ...rest, policyId, effectiveDate: policy.startDate } }),
        ),
      ])
    } catch (err) {
      if (isPrismaKnownError(err, 'P2002') || isPrismaKnownError(err, 'P2003')) {
        throw new AppError(
          409,
          'No se pudo guardar la póliza: alguna línea de cobertura quedó en conflicto con datos existentes',
          'CONFLICT',
        )
      }
      throw err
    }

    return this.findCoverages(policyId)
  },

  // Alta explícita de una línea nueva, con fecha de alta elegida por quien la
  // carga (a diferencia de create()/replaceCoverages(), que siguen
  // completando effectiveDate con policy.startDate por compatibilidad con el
  // frontend viejo).
  async addCoverage(policyId: string, data: AddCoverageDTO) {
    const policy = await prisma.policy.findUnique({ where: { id: policyId }, select: { startDate: true, endDate: true } })
    if (!policy) throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')

    assertEffectiveDateWithinPolicy(data.effectiveDate, policy)

    const resolved = await resolveCoverageInput(data)

    if (resolved.assetId) {
      await assertNoOverlappingCoverage(policyId, resolved.assetId, data.effectiveDate, null)
    }

    try {
      const created = await prisma.policyAssetCoverage.create({
        data: { ...resolved, policyId, effectiveDate: data.effectiveDate },
        include: COVERAGE_DETAIL_INCLUDE,
      })
      return withSelectedCoverages(created)
    } catch (err) {
      if (isPrismaKnownError(err, 'P2002')) {
        throw new AppError(409, 'Ya existe una línea activa para este activo en esta póliza', 'CONFLICT')
      }
      throw err
    }
  },

  // Baja histórica — nunca borra la línea, sus adjuntos ni sus asignaciones
  // de documentos. Queda marcada con bajaDate/bajaReason (fecha y motivo de
  // negocio) y deactivatedAt/deactivatedBy (auditoría de cuándo/quién
  // ejecutó la acción).
  async deactivateCoverage(policyId: string, coverageId: string, data: DeactivateCoverageDTO, performedBy: string) {
    const coverage = await prisma.policyAssetCoverage.findFirst({
      where: { id: coverageId, policyId },
      select: { id: true, effectiveDate: true, bajaDate: true, policy: { select: { endDate: true } } },
    })
    if (!coverage) throw new AppError(404, 'Línea de cobertura no encontrada', 'NOT_FOUND')
    if (coverage.bajaDate) throw new AppError(409, 'La línea ya está dada de baja', 'CONFLICT')

    assertBajaDateValid(data.bajaDate, coverage.effectiveDate, coverage.policy.endDate)

    const updated = await prisma.policyAssetCoverage.update({
      where: { id: coverageId },
      data: {
        bajaDate: data.bajaDate,
        bajaReason: data.bajaReason,
        deactivatedAt: new Date(),
        deactivatedBy: performedBy,
      },
      include: COVERAGE_DETAIL_INCLUDE,
    })
    return withSelectedCoverages(updated)
  },

  // Edita los datos propios de una línea ACTIVA (monto, tipo de seguro,
  // coberturas, activo, imputación) — nunca toca effectiveDate/bajaDate, eso
  // es acción exclusiva de alta/baja. Una línea ya dada de baja queda
  // congelada: no se edita para no alterar su historial.
  async updateCoverage(policyId: string, coverageId: string, data: UpdateCoverageDTO) {
    const existing = await prisma.policyAssetCoverage.findFirst({
      where: { id: coverageId, policyId },
      select: {
        id: true, assetId: true, effectiveDate: true, bajaDate: true,
        _count: { select: { attachments: true } },
      },
    })
    if (!existing) throw new AppError(404, 'Línea de cobertura no encontrada', 'NOT_FOUND')
    if (existing.bajaDate) throw new AppError(409, 'No se puede editar una línea dada de baja', 'CONFLICT')

    const resolved = await resolveCoverageInput(data)

    if (existing.assetId !== resolved.assetId) {
      if (existing._count.attachments > 0) {
        throw new AppError(409, COVERAGE_ASSET_CHANGE_WITH_ATTACHMENTS_MESSAGE, 'COVERAGE_ASSET_CHANGE_BLOCKED')
      }
      if (resolved.assetId) {
        await assertNoOverlappingCoverage(policyId, resolved.assetId, existing.effectiveDate, existing.bajaDate, coverageId)
      }
    }

    try {
      const updated = await prisma.policyAssetCoverage.update({
        where: { id: coverageId },
        data: resolved,
        include: COVERAGE_DETAIL_INCLUDE,
      })
      return withSelectedCoverages(updated)
    } catch (err) {
      if (isPrismaKnownError(err, 'P2002')) {
        throw new AppError(409, 'Ya existe una línea activa para este activo en esta póliza', 'CONFLICT')
      }
      throw err
    }
  },

  // Borrado físico real — reservado para corregir un alta cargada por error,
  // nunca para dar de baja una línea con historial (para eso existe
  // deactivateCoverage). Solo se permite si no tiene adjuntos ni
  // asignaciones de documentos.
  async deleteCoveragePhysical(policyId: string, coverageId: string) {
    const coverage = await prisma.policyAssetCoverage.findFirst({
      where: { id: coverageId, policyId },
      select: { id: true, _count: { select: { attachments: true, allocations: true } } },
    })
    if (!coverage) throw new AppError(404, 'Línea de cobertura no encontrada', 'NOT_FOUND')
    if (coverage._count.attachments > 0) {
      throw new AppError(
        409,
        'No se puede eliminar una línea que tiene adjuntos cargados. Usá la acción de dar de baja en su lugar.',
        'COVERAGE_HAS_ATTACHMENTS',
      )
    }
    if (coverage._count.allocations > 0) {
      throw new AppError(
        409,
        'No se puede eliminar una línea que ya tiene documentos asociados. Usá la acción de dar de baja en su lugar.',
        'COVERAGE_HAS_ALLOCATIONS',
      )
    }

    try {
      await prisma.policyAssetCoverage.delete({ where: { id: coverageId } })
    } catch (err) {
      if (isPrismaKnownError(err, 'P2003')) {
        throw new AppError(409, 'No se puede eliminar la línea porque tiene datos relacionados', 'CONFLICT')
      }
      throw err
    }
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
