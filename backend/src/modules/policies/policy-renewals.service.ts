import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { businessDateStr, toDateStr } from '../../shared/utils/dates'
import { normalizeCatalogText } from '../../shared/utils/normalize'
import type { CreatePolicyRenewalDTO, RevokePolicyRenewalDTO } from './policies.schemas'

// Renovación de pólizas — vínculo administrativo "la póliza anterior fue
// renovada por la nueva". Solo lee pólizas y escribe en policy_renewals:
// nunca toca fechas, líneas de cobertura, sumas aseguradas ni documentos de
// ninguna de las dos pólizas.

type DbClient = Prisma.TransactionClient
type RenewalNotice = { code: string; message: string }

const DAY_MS = 24 * 60 * 60 * 1000

// Tope defensivo al recorrer una cadena de renovaciones (A → B → C …). Con la
// regla cronológica un ciclo es imposible y las cadenas reales tienen un
// eslabón por año — el tope solo corta un dato corrupto.
const MAX_RENEWAL_CHAIN = 100

const POLICY_CORE_SELECT = {
  id: true,
  policyNumber: true,
  startDate: true,
  endDate: true,
  deactivatedAt: true,
} satisfies Prisma.PolicySelect

// Solo líneas vigentes dentro de la póliza (bajaDate null) — mismo criterio
// que el único parcial policy_asset_coverages_one_active_per_asset, así que
// hay a lo sumo una línea por activo en cada póliza.
const POLICY_COMPARISON_SELECT = {
  ...POLICY_CORE_SELECT,
  insuredName: true,
  producer: { select: { id: true, name: true } },
  coverages: {
    where: { bajaDate: null },
    select: {
      id: true,
      coverageIds: true,
      insuredAmount: true,
      currency: true,
      asset: { select: { id: true, name: true, code: true } },
      insuranceType: { select: { id: true, name: true, coverages: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PolicySelect

const POLICY_REF_SELECT = {
  id: true,
  policyNumber: true,
  insuredName: true,
  startDate: true,
  endDate: true,
} satisfies Prisma.PolicySelect

const RENEWAL_SELECT = {
  id: true,
  notes: true,
  createdBy: true,
  createdAt: true,
  revokedAt: true,
  revokedBy: true,
  revokeReason: true,
  previousPolicy: { select: POLICY_REF_SELECT },
  renewalPolicy: { select: POLICY_REF_SELECT },
} satisfies Prisma.PolicyRenewalSelect

type PolicyCore = Prisma.PolicyGetPayload<{ select: typeof POLICY_CORE_SELECT }>
type PolicyForComparison = Prisma.PolicyGetPayload<{ select: typeof POLICY_COMPARISON_SELECT }>
type ComparisonLine = PolicyForComparison['coverages'][number]
type RenewalRow = Prisma.PolicyRenewalGetPayload<{ select: typeof RENEWAL_SELECT }>
type LineDifference = 'insuranceType' | 'coverages' | 'currency' | 'insuredAmount'

const ALREADY_RENEWED_MESSAGE = 'La póliza ya está registrada como renovada.'
const NO_ACTIVE_RENEWAL_MESSAGE = 'La póliza no tiene una renovación activa para revertir.'
const CONCURRENT_UPDATE_MESSAGE =
  'La información de las pólizas cambió mientras se guardaba. Revisá los datos actualizados y volvé a intentarlo.'

// lock_timeout (55P03), deadlock (40P01) o conflicto de serialización (40001).
// Formas reales verificadas contra Postgres 16 + Prisma 5.22:
// - query cruda ($queryRaw): PrismaClientKnownRequestError P2010 con
//   meta.code = SQLSTATE;
// - query propia de Prisma (ej. el INSERT esperando un único): un lock_timeout
//   llega como PrismaClientUnknownRequestError, SIN código — el SQLSTATE solo
//   aparece en el mensaje (`code: "55P03"`);
// - P2034 es como Prisma reporta un deadlock/conflicto en sus propias queries.
const CONCURRENCY_SQLSTATES = ['55P03', '40P01', '40001']

function isConcurrencyConflict(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    return CONCURRENCY_SQLSTATES.some((state) => err.message.includes(`code: "${state}"`))
  }
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false
  if (err.code === 'P2034') return true
  const sqlState = (err.meta as { code?: unknown } | undefined)?.code
  return err.code === 'P2010' && typeof sqlState === 'string' && CONCURRENCY_SQLSTATES.includes(sqlState)
}

// Serializa todo lo que puede romper la regla cronológica de un vínculo
// (registrar una renovación, cambiar la fecha de fin de una póliza vinculada).
// Una transacción sola no alcanza: el INSERT en policy_renewals solo toma
// FOR KEY SHARE sobre las pólizas (por la FK), que no choca con el UPDATE de
// endDate — ambos podrían validar contra fechas viejas y confirmarse juntos.
//
// Bloquea SOLO las filas de policies involucradas con FOR NO KEY UPDATE, el
// mismo nivel que toma un UPDATE común: espera a cualquier edición, baja o
// borrado en curso de esas pólizas, pero no frena altas de líneas, documentos
// ni siniestros que las referencian (esas toman FOR KEY SHARE). Es un solo
// statement con ORDER BY — Postgres ordena antes de bloquear, así que dos
// transacciones que se cruzan piden los locks en el mismo orden y no pueden
// trabarse entre sí. Los locks duran lo que la transacción (milisegundos) y la
// espera queda acotada por lock_timeout, por debajo del timeout de 5s de las
// transacciones interactivas de Prisma.
async function lockPolicies(tx: DbClient, ids: string[]): Promise<Set<string>> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "policies"
    WHERE "id" IN (${Prisma.join([...new Set(ids)])})
    ORDER BY "id"
    FOR NO KEY UPDATE`
  return new Set(rows.map((row) => row.id))
}

// Regla estructural: la póliza nueva tiene que vencer DESPUÉS que la anterior.
// Diferencias en la fecha de inicio o superposiciones solo generan
// advertencias. Como cada eslabón vence estrictamente después que el
// anterior, esta regla alcanza para que un ciclo sea imposible.
function endsAfter(renewalEndDate: Date, previousEndDate: Date): boolean {
  return renewalEndDate.getTime() > previousEndDate.getTime()
}

// Fechas @db.Date llegan como medianoche UTC — la diferencia es exacta en días.
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

function assertNotSelf(previousPolicyId: string, renewalPolicyId: string) {
  if (previousPolicyId === renewalPolicyId) {
    throw new AppError(400, 'Una póliza no puede ser renovación de sí misma.', 'SELF_RENEWAL')
  }
}

async function findCoreOrThrow(client: DbClient, id: string, notFoundMessage: string): Promise<PolicyCore> {
  const policy = await client.policy.findUnique({ where: { id }, select: POLICY_CORE_SELECT })
  if (!policy) throw new AppError(404, notFoundMessage, 'NOT_FOUND')
  return policy
}

async function findForComparisonOrThrow(id: string, notFoundMessage: string): Promise<PolicyForComparison> {
  const policy = await prisma.policy.findUnique({ where: { id }, select: POLICY_COMPARISON_SELECT })
  if (!policy) throw new AppError(404, notFoundMessage, 'NOT_FOUND')
  return policy
}

// ¿Siguiendo los vínculos activos desde `fromPolicyId` (como póliza anterior)
// se llega a `targetPolicyId`? Defensa adicional a la regla cronológica: si
// los datos estuvieran inconsistentes, vincular target → from cerraría un
// ciclo. Una cadena anómala (repetida o demasiado larga) se trata como ciclo.
async function reachesPolicy(client: DbClient, fromPolicyId: string, targetPolicyId: string): Promise<boolean> {
  const visited = new Set<string>()
  let current = fromPolicyId
  for (let step = 0; step < MAX_RENEWAL_CHAIN; step++) {
    if (current === targetPolicyId || visited.has(current)) return true
    visited.add(current)
    const next = await client.policyRenewal.findFirst({
      where: { previousPolicyId: current, revokedAt: null },
      select: { renewalPolicyId: true },
    })
    if (!next?.renewalPolicyId) return false
    current = next.renewalPolicyId
  }
  return true
}

// Validaciones estructurales — las únicas que impiden registrar el vínculo.
// Diferencias de activos, coberturas, aseguradora o fechas de inicio nunca
// bloquean (ver buildWarnings).
async function findBlockers(client: DbClient, previous: PolicyCore, renewal: PolicyCore): Promise<RenewalNotice[]> {
  const blockers: RenewalNotice[] = []
  if (previous.deactivatedAt) {
    blockers.push({
      code: 'PREVIOUS_POLICY_DE_BAJA',
      message: `La póliza ${previous.policyNumber} fue dada de baja manualmente: no puede marcarse como renovada.`,
    })
  }
  if (renewal.deactivatedAt) {
    blockers.push({
      code: 'RENEWAL_POLICY_DE_BAJA',
      message: `La póliza ${renewal.policyNumber} fue dada de baja manualmente: no puede registrarse como renovación.`,
    })
  }

  const activeLink = await client.policyRenewal.findFirst({
    where: { previousPolicyId: previous.id, revokedAt: null },
    select: { renewalPolicy: { select: { policyNumber: true } } },
  })
  if (activeLink) {
    blockers.push({
      code: 'ALREADY_RENEWED',
      message: activeLink.renewalPolicy
        ? `La póliza ${previous.policyNumber} ya está registrada como renovada por la póliza ${activeLink.renewalPolicy.policyNumber}.`
        : `La póliza ${previous.policyNumber} ya tiene una marca administrativa de renovación activa.`,
    })
  }

  if (!endsAfter(renewal.endDate, previous.endDate)) {
    blockers.push({
      code: 'RENEWAL_MUST_END_LATER',
      message: `La póliza ${renewal.policyNumber} tiene que vencer después que la póliza ${previous.policyNumber}.`,
    })
  } else if (await reachesPolicy(client, renewal.id, previous.id)) {
    blockers.push({ code: 'RENEWAL_CYCLE', message: 'El vínculo formaría un ciclo de renovaciones.' })
  }
  return blockers
}

function lineSummary(line: ComparisonLine) {
  return {
    id: line.id,
    insuranceType: { id: line.insuranceType.id, name: line.insuranceType.name },
    // Mismo criterio que withSelectedCoverages (policies.service.ts).
    coverages: line.insuranceType.coverages.filter((c) => line.coverageIds.includes(c.id)),
    insuredAmount: line.insuredAmount,
    currency: line.currency,
  }
}

function sameIdSet(a: string[], b: string[]): boolean {
  const setA = new Set(a)
  const setB = new Set(b)
  return setA.size === setB.size && [...setA].every((id) => setB.has(id))
}

// Diferencias entre las líneas de un mismo activo — solo informativas. Con
// otro tipo de seguro las coberturas son de otro catálogo, y con otra moneda
// los montos no son comparables: en esos casos se informa solo lo primero.
function lineDifferences(previous: ComparisonLine, renewal: ComparisonLine): LineDifference[] {
  const differences: LineDifference[] = []
  if (previous.insuranceType.id !== renewal.insuranceType.id) differences.push('insuranceType')
  else if (!sameIdSet(previous.coverageIds, renewal.coverageIds)) differences.push('coverages')
  if (previous.currency !== renewal.currency) differences.push('currency')
  else if (previous.insuredAmount !== renewal.insuredAmount) differences.push('insuredAmount')
  return differences
}

function compareCoverages(previous: PolicyForComparison, renewal: PolicyForComparison) {
  const renewalLineByAsset = new Map(
    renewal.coverages.flatMap((line) => (line.asset ? [[line.asset.id, line] as const] : [])),
  )
  const previousAssetIds = new Set(previous.coverages.flatMap((line) => (line.asset ? [line.asset.id] : [])))

  const continuingAssets = []
  const removedAssets = []
  for (const line of previous.coverages) {
    if (!line.asset) continue
    const match = renewalLineByAsset.get(line.asset.id)
    if (match) {
      continuingAssets.push({
        asset: line.asset,
        previous: lineSummary(line),
        renewal: lineSummary(match),
        differences: lineDifferences(line, match),
      })
    } else {
      removedAssets.push({ asset: line.asset, previous: lineSummary(line) })
    }
  }
  const addedAssets = renewal.coverages.flatMap((line) =>
    line.asset && !previousAssetIds.has(line.asset.id) ? [{ asset: line.asset, renewal: lineSummary(line) }] : [],
  )

  return {
    continuingAssets,
    removedAssets,
    addedAssets,
    previousLinesWithoutAsset: previous.coverages.filter((line) => !line.asset).map(lineSummary),
    renewalLinesWithoutAsset: renewal.coverages.filter((line) => !line.asset).map(lineSummary),
  }
}

function compareDates(previous: PolicyCore, renewal: PolicyCore) {
  const laterStart = Math.max(previous.startDate.getTime(), renewal.startDate.getTime())
  const earlierEnd = Math.min(previous.endDate.getTime(), renewal.endDate.getTime())
  return {
    // Días calendario cubiertos por ambas pólizas (fechas inclusive).
    overlapDays: Math.max(0, daysBetween(new Date(laterStart), new Date(earlierEnd)) + 1),
    // Días sin cobertura entre el fin de la anterior y el inicio de la nueva.
    gapDays: Math.max(0, daysBetween(previous.endDate, renewal.startDate) - 1),
  }
}

function countDifferences(rows: { differences: LineDifference[] }[], difference: LineDifference): number {
  return rows.filter((row) => row.differences.includes(difference)).length
}

// "1 activo cambia" / "2 activos cambian": los avisos se leen tal cual en la
// vista previa de la renovación.
function counted(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function buildWarnings(
  previous: PolicyForComparison,
  renewal: PolicyForComparison,
  comparison: ReturnType<typeof compareCoverages>,
  dates: ReturnType<typeof compareDates>,
  otherPoliciesRenewed: string[],
): RenewalNotice[] {
  const warnings: RenewalNotice[] = []
  const add = (code: string, message: string) => warnings.push({ code, message })
  const today = businessDateStr()

  if (normalizeCatalogText(previous.insuredName) !== normalizeCatalogText(renewal.insuredName)) {
    add('INSURER_CHANGED', `Cambia la aseguradora: ${previous.insuredName} → ${renewal.insuredName}.`)
  }
  if ((previous.producer?.id ?? null) !== (renewal.producer?.id ?? null)) {
    add('PRODUCER_CHANGED', 'Cambia el productor entre ambas pólizas.')
  }

  if (renewal.startDate.getTime() < previous.startDate.getTime()) {
    add('RENEWAL_STARTS_BEFORE_PREVIOUS', 'La póliza nueva empieza antes que la anterior.')
  }
  if (dates.overlapDays > 0) {
    add('DATES_OVERLAP', `Las vigencias se superponen ${counted(dates.overlapDays, 'día', 'días')}.`)
  }
  if (dates.gapDays > 0) {
    add('COVERAGE_GAP', `${dates.gapDays === 1 ? 'Queda' : 'Quedan'} ${counted(dates.gapDays, 'día', 'días')} sin cobertura entre ambas pólizas.`)
  }
  if (toDateStr(previous.endDate) < today) {
    add('PREVIOUS_POLICY_EXPIRED', 'La póliza anterior ya está vencida.')
  }
  if (toDateStr(renewal.startDate) > today) {
    add('RENEWAL_NOT_STARTED', 'La póliza nueva todavía no empezó.')
  }
  if (toDateStr(renewal.endDate) < today) {
    add('RENEWAL_POLICY_EXPIRED', 'La póliza nueva también está vencida.')
  }

  const { continuingAssets, removedAssets, addedAssets } = comparison
  if (removedAssets.length > 0 && continuingAssets.length === 0) {
    add('NO_COMMON_ASSETS', 'Ningún activo de la póliza anterior continúa en la nueva.')
  } else if (removedAssets.length > 0) {
    add(
      'ASSETS_NOT_CONTINUING',
      `${counted(removedAssets.length, 'activo de la póliza anterior no continúa', 'activos de la póliza anterior no continúan')} en la nueva.`,
    )
  }
  if (addedAssets.length > 0) {
    add('ASSETS_ADDED', `${counted(addedAssets.length, 'activo nuevo', 'activos nuevos')} en la póliza nueva.`)
  }
  const typeChanges = countDifferences(continuingAssets, 'insuranceType')
  const coverageChanges = countDifferences(continuingAssets, 'coverages')
  if (typeChanges + coverageChanges > 0) {
    add('COVERAGE_CHANGED', `${counted(typeChanges + coverageChanges, 'activo cambia', 'activos cambian')} de tipo de seguro o de coberturas.`)
  }
  const currencyChanges = countDifferences(continuingAssets, 'currency')
  if (currencyChanges > 0) {
    add('CURRENCY_CHANGED', `${counted(currencyChanges, 'activo cambia', 'activos cambian')} de moneda.`)
  }
  const amountChanges = countDifferences(continuingAssets, 'insuredAmount')
  if (amountChanges > 0) {
    add('INSURED_AMOUNT_CHANGED', `${counted(amountChanges, 'activo cambia', 'activos cambian')} de suma asegurada.`)
  }
  if (comparison.previousLinesWithoutAsset.length > 0 || comparison.renewalLinesWithoutAsset.length > 0) {
    add('LINES_WITHOUT_ASSET', 'Hay líneas sin activo que no se pueden emparejar automáticamente.')
  }
  if (otherPoliciesRenewed.length > 0) {
    add('RENEWAL_ALREADY_LINKED', `La póliza nueva ya figura como renovación de: ${otherPoliciesRenewed.join(', ')}.`)
  }
  return warnings
}

function policySummary(policy: PolicyForComparison) {
  return {
    id: policy.id,
    policyNumber: policy.policyNumber,
    insuredName: policy.insuredName,
    producer: policy.producer,
    startDate: toDateStr(policy.startDate),
    endDate: toDateStr(policy.endDate),
    isDeBaja: policy.deactivatedAt != null,
  }
}

function mapPolicyRef(policy: RenewalRow['previousPolicy']) {
  return { ...policy, startDate: toDateStr(policy.startDate), endDate: toDateStr(policy.endDate) }
}

function mapRenewal(row: RenewalRow) {
  return {
    ...row,
    previousPolicy: mapPolicyRef(row.previousPolicy),
    renewalPolicy: row.renewalPolicy ? mapPolicyRef(row.renewalPolicy) : null,
    status: row.revokedAt ? ('REVOKED' as const) : ('ACTIVE' as const),
  }
}

// Vínculos ACTIVOS de una póliza (como anterior o como renovación), con la
// fecha de fin de cada extremo. Los revertidos son historial y no restringen
// nada.
async function findActiveLinks(client: DbClient, policyId: string) {
  const links = await client.policyRenewal.findMany({
    where: {
      revokedAt: null,
      renewalPolicyId: { not: null },
      OR: [{ previousPolicyId: policyId }, { renewalPolicyId: policyId }],
    },
    select: {
      previousPolicyId: true,
      renewalPolicyId: true,
      previousPolicy: { select: { policyNumber: true, endDate: true } },
      renewalPolicy: { select: { policyNumber: true, endDate: true } },
    },
  })
  return links.filter(
    (link): link is typeof link & { renewalPolicyId: string; renewalPolicy: NonNullable<typeof link.renewalPolicy> } =>
      link.renewalPolicyId !== null && link.renewalPolicy !== null,
  )
}

type ActiveLink = Awaited<ReturnType<typeof findActiveLinks>>[number]

function counterpartOf(link: ActiveLink, policyId: string): string {
  return link.previousPolicyId === policyId ? link.renewalPolicyId : link.previousPolicyId
}

// Cambiar la fecha de fin de una póliza con vínculos activos no puede romper
// la regla cronológica (si no, un vínculo posterior podría cerrar un ciclo).
function assertEndDateKeepsRenewalOrder(policyId: string, endDate: Date, links: ActiveLink[]) {
  for (const link of links) {
    if (link.previousPolicyId === policyId) {
      if (!endsAfter(link.renewalPolicy.endDate, endDate)) {
        throw new AppError(
          409,
          `La póliza fue renovada por la póliza ${link.renewalPolicy.policyNumber}: la fecha de fin tiene que ser anterior a la de esa póliza.`,
          'RENEWAL_DATE_CONFLICT',
        )
      }
    } else if (!endsAfter(endDate, link.previousPolicy.endDate)) {
      throw new AppError(
        409,
        `La póliza es la renovación de la póliza ${link.previousPolicy.policyNumber}: la fecha de fin tiene que ser posterior a la de esa póliza.`,
        'RENEWAL_DATE_CONFLICT',
      )
    }
  }
}

// PUT /policies/:id con fecha de fin: valida contra los vínculos activos y
// escribe (`write`) con la póliza y sus contrapartes bloqueadas (ver
// lockPolicies), así ningún vínculo nuevo ni otra edición de fechas se cuela
// entre la validación y la escritura.
export async function updateEndDateKeepingRenewalOrder<T>(
  policyId: string,
  endDate: Date,
  write: (tx: DbClient) => Promise<T>,
): Promise<T> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Las contrapartes actuales se leen sin lock solo para poder bloquearlas
      // a todas juntas y en orden con la propia póliza.
      const before = await findActiveLinks(tx, policyId)
      const locked = await lockPolicies(tx, [policyId, ...before.map((link) => counterpartOf(link, policyId))])
      // Relectura con las filas ya bloqueadas: un vínculo confirmado mientras
      // se esperaba el lock recién es visible acá. Si apareció una contraparte
      // que no quedó bloqueada se aborta en vez de bloquearla fuera de orden.
      const links = await findActiveLinks(tx, policyId)
      if (links.some((link) => !locked.has(counterpartOf(link, policyId)))) {
        throw new AppError(409, CONCURRENT_UPDATE_MESSAGE, 'CONCURRENT_UPDATE')
      }
      assertEndDateKeepsRenewalOrder(policyId, endDate, links)
      return write(tx)
    })
  } catch (err) {
    if (isConcurrencyConflict(err)) throw new AppError(409, CONCURRENT_UPDATE_MESSAGE, 'CONCURRENT_UPDATE')
    throw err
  }
}

export const policyRenewalsService = {
  // Historial completo de la póliza, como anterior y como renovación,
  // incluidas las revertidas.
  async findAll(policyId: string) {
    await findCoreOrThrow(prisma, policyId, 'Póliza no encontrada')
    const rows = await prisma.policyRenewal.findMany({
      where: { OR: [{ previousPolicyId: policyId }, { renewalPolicyId: policyId }] },
      select: RENEWAL_SELECT,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(mapRenewal)
  },

  // Solo lectura: devuelve bloqueos, advertencias y la comparación de ambas
  // pólizas sin escribir nada.
  async preview(previousPolicyId: string, renewalPolicyId: string) {
    assertNotSelf(previousPolicyId, renewalPolicyId)
    const [previous, renewal] = await Promise.all([
      findForComparisonOrThrow(previousPolicyId, 'Póliza no encontrada'),
      findForComparisonOrThrow(renewalPolicyId, 'Póliza de renovación no encontrada'),
    ])
    const [blockers, otherLinks] = await Promise.all([
      findBlockers(prisma, previous, renewal),
      prisma.policyRenewal.findMany({
        where: { renewalPolicyId, revokedAt: null },
        select: { previousPolicy: { select: { policyNumber: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    const comparison = compareCoverages(previous, renewal)
    const dates = compareDates(previous, renewal)
    const otherPoliciesRenewed = otherLinks.map((link) => link.previousPolicy.policyNumber)

    return {
      previousPolicy: policySummary(previous),
      renewalPolicy: policySummary(renewal),
      canRenew: blockers.length === 0,
      blockers,
      warnings: buildWarnings(previous, renewal, comparison, dates, otherPoliciesRenewed),
      comparison: { ...dates, ...comparison },
    }
  },

  async create(previousPolicyId: string, data: CreatePolicyRenewalDTO, createdBy: string) {
    if (data.renewalPolicyId) assertNotSelf(previousPolicyId, data.renewalPolicyId)
    try {
      const row = await prisma.$transaction(async (tx) => {
        // Serializa marcas repetidas de una misma póliza; el índice único
        // parcial sigue siendo la última defensa ante duplicados.
        await lockPolicies(tx, [previousPolicyId, ...(data.renewalPolicyId ? [data.renewalPolicyId] : [])])
        const previous = await findCoreOrThrow(tx, previousPolicyId, 'Póliza no encontrada')
        if (previous.deactivatedAt) {
          throw new AppError(409, 'Una póliza dada de baja no puede marcarse como renovada.', 'PREVIOUS_POLICY_DE_BAJA')
        }

        if (data.renewalPolicyId) {
          // Compatibilidad con los vínculos históricos póliza anterior →
          // sucesora; el flujo nuevo no envía renewalPolicyId.
          const renewal = await findCoreOrThrow(tx, data.renewalPolicyId, 'Póliza de renovación no encontrada')
          const [blocker] = await findBlockers(tx, previous, renewal)
          if (blocker) throw new AppError(409, blocker.message, blocker.code)
        } else {
          const active = await tx.policyRenewal.findFirst({
            where: { previousPolicyId, revokedAt: null },
            select: { id: true },
          })
          if (active) throw new AppError(409, ALREADY_RENEWED_MESSAGE, 'ALREADY_RENEWED')
        }

        return tx.policyRenewal.create({
          data: {
            previousPolicyId,
            renewalPolicyId: data.renewalPolicyId ?? null,
            notes: data.notes || null,
            createdBy,
          },
          select: RENEWAL_SELECT,
        })
      })
      return mapRenewal(row)
    } catch (err) {
      // Dos usuarios marcando la misma póliza a la vez: ambos pasan el
      // chequeo previo y el único parcial policy_renewals_one_active_per_previous
      // frena al segundo.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppError(409, ALREADY_RENEWED_MESSAGE, 'ALREADY_RENEWED')
      }
      // FK: una de las dos pólizas se borró entre la lectura y el alta.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new AppError(404, 'Póliza no encontrada', 'NOT_FOUND')
      }
      if (isConcurrencyConflict(err)) throw new AppError(409, CONCURRENT_UPDATE_MESSAGE, 'CONCURRENT_UPDATE')
      throw err
    }
  },

  async revoke(previousPolicyId: string, data: RevokePolicyRenewalDTO, revokedBy: string) {
    await findCoreOrThrow(prisma, previousPolicyId, 'Póliza no encontrada')
    const active = await prisma.policyRenewal.findFirst({
      where: { previousPolicyId, revokedAt: null },
      select: { id: true },
    })
    if (!active) throw new AppError(409, NO_ACTIVE_RENEWAL_MESSAGE, 'NO_ACTIVE_RENEWAL')

    // revokedAt: null en el where — si otro usuario la revirtió en el medio,
    // no se pisa su usuario ni su motivo (mismo patrón que la baja de prendas,
    // asset-pledges.service.ts#cancel).
    const result = await prisma.policyRenewal.updateMany({
      where: { id: active.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy, revokeReason: data.reason },
    })
    if (result.count === 0) throw new AppError(409, NO_ACTIVE_RENEWAL_MESSAGE, 'NO_ACTIVE_RENEWAL')

    const row = await prisma.policyRenewal.findUniqueOrThrow({ where: { id: active.id }, select: RENEWAL_SELECT })
    return mapRenewal(row)
  },
}
