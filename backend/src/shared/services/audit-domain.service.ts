import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../errors/AppError'
import { normalizeAssetType } from '../../modules/fire-extinguishers/asset-type-classification'
import { replaceUserAuditScope } from './audit-scope.service'
import type { AuditableAssetCategory, ModuleKey, AuditScopeArea } from '../types'

// Reglas compartidas por los 3 dominios de auditoría (matafuegos/rodados,
// activos, seguros) — antes duplicadas entre fire-extinguisher-audits.service.ts,
// insurance-audits.service.ts y asset-audits-assignments.service.ts.

export const MAX_ATTACHMENTS_PER_AUDIT = 10

// Chequeo de mimetype MÁS ESTRICTO que el `isAllowedMimetype` compartido de
// shared/utils/files.ts — son fotos de inspección de auditoría, no
// documentos contables. No se toca ese helper genérico.
export const ALLOWED_PHOTO_MIMETYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])

export function isAllowedPhotoMimetype(mimetype: string): boolean {
  return ALLOWED_PHOTO_MIMETYPES.has(mimetype)
}

// Manejo de la constraint única (fireExtinguisherId|assetId, auditPeriod) de
// cada dominio de auditoría — el mensaje del caso "ya existe para este
// período" es específico de cada dominio, el resto de la lógica es igual en
// los tres.
export function handleDuplicateAudit(e: unknown, duplicatePeriodMessage: string): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(',') : String(e.meta?.target ?? '')
    if (target.includes('auditPeriod')) {
      throw new AppError(409, duplicatePeriodMessage, 'DUPLICATE_AUDIT_PERIOD')
    }
    throw new AppError(409, 'Registro duplicado', 'DUPLICATE')
  }
  throw e
}

// `reviewerIsAdmin` exceptúa la restricción de autorevisión — un ADMIN suele
// ser quien audita (desde Cobertura) Y revisa/aprueba en esta misma cuenta,
// a diferencia de un auditor común (solo tiene el módulo de cobertura, nunca
// llega a la pantalla de revisión). Un usuario no-ADMIN con permiso de
// revisión sigue sin poder autoaprobarse.
export function assertNotSelfReview(auditedBy: string, reviewedBy: string, reviewerIsAdmin: boolean): void {
  if (auditedBy === reviewedBy && !reviewerIsAdmin) {
    throw new AppError(403, 'No podés revisar/aprobar una auditoría que vos mismo auditaste', 'SELF_REVIEW_FORBIDDEN')
  }
}

// Clasificación fina (una de las 10 AUDITABLE_ASSET_CATEGORIES) a partir del
// `Asset.assetType` libre — a diferencia de classifyAssetType() (que solo
// distingue vehículo/maquinaria para excluir matafuegos de vehículos, y por
// diseño nunca clasifica "moto"), esta necesita el detalle real de categoría
// para el alcance de auditoría por categoría (UserAuditScope, área
// ASSET_AUDIT/INSURANCE_AUDIT). Acá "moto" sí clasifica — solo importa para
// INSURANCE_AUDIT, ya que ASSET_AUDIT (Auditoría de Rodados) filtra motos
// antes, en matchesAuditPopulation() vía classifyAssetType().
const NORMALIZED_TO_AUDITABLE_CATEGORY: Record<string, AuditableAssetCategory> = {
  vehiculo: 'vehiculo',
  camioneta: 'camioneta',
  camion: 'camion',
  moto: 'moto',
  transportedepasajeros: 'transporte_pasajeros',
  tractor: 'tractor',
  cosechadora: 'cosechadora',
  pulverizadora: 'pulverizadora',
  implemento: 'implemento',
  implementoagricola: 'implemento',
  maquinaria: 'maquinaria',
  maquinariaagricola: 'maquinaria',
}

export function classifyAuditableAssetCategory(assetType: string): AuditableAssetCategory | null {
  return NORMALIZED_TO_AUDITABLE_CATEGORY[normalizeAssetType(assetType)] ?? null
}

export interface BulkApproveResult {
  approved: string[]
  failed: { id: string; code: string | null; message: string }[]
}

// Orquestación compartida por bulkApprove() de los 3 dominios de auditoría —
// cada auditoría se procesa de forma independiente (si una falla no aborta
// el resto del lote), reusando el propio review() de cada dominio para no
// duplicar su lógica de aprobar/rechazar. Lo que sí difiere por dominio (y
// por eso queda a cargo del caller): de dónde sacar el código a mostrar si
// falla, y qué payload exacto le pasa a review() (matafuegos/rodados arma
// `decisions` a partir de los proposedChanges PENDING; seguros no tiene ese
// concepto y aprueba directo).
export async function bulkApproveAudits<TReviewPayload>(
  ids: string[],
  auditRefs: Map<string, { code: string | null }>,
  buildReviewPayload: (id: string) => TReviewPayload,
  review: (id: string, payload: TReviewPayload, reviewedBy: string, reviewerIsAdmin: boolean) => Promise<unknown>,
  reviewedBy: string,
  reviewerIsAdmin: boolean,
): Promise<BulkApproveResult> {
  const approved: string[] = []
  const failed: { id: string; code: string | null; message: string }[] = []

  for (const id of ids) {
    const ref = auditRefs.get(id)
    if (!ref) {
      failed.push({ id, code: null, message: 'Auditoría no encontrada' })
      continue
    }
    try {
      await review(id, buildReviewPayload(id), reviewedBy, reviewerIsAdmin)
      approved.push(id)
    } catch (err) {
      failed.push({ id, code: ref.code, message: err instanceof AppError ? err.message : 'Error al aprobar' })
    }
  }

  return { approved, failed }
}

// Claves planas de Asset.metadata (JSON) para patente/chasis/motor — única
// fuente de verdad para el nombre de esas 3 claves. extractVehicleMeta() las
// usa directo (acceso a propiedad, sin cambios); insurance-audits.service.ts
// las reusa para armar el filtro de búsqueda server-side sobre `metadata`
// (un filtro de Prisma no puede "llamar" a extractVehicleMeta en tiempo de
// query, pero sí puede iterar los mismos 3 nombres de clave).
export const VEHICLE_META_KEYS = ['plate', 'chassisNumber', 'engineNumber'] as const

// Patente/chasis/motor no son columnas propias del Activo — viven en
// Asset.metadata (JSON). Único lugar donde los dominios de auditoría que
// tocan vehículos los extraen, para no repetir el parseo en cada mapper.
export function extractVehicleMeta(metadata: unknown): { plate: string | null; chassisNumber: string | null; engineNumber: string | null } {
  const meta = (metadata ?? {}) as Record<string, unknown>
  const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
  return {
    plate: asString(meta.plate),
    chassisNumber: asString(meta.chassisNumber),
    engineNumber: asString(meta.engineNumber),
  }
}

export interface AssignableAssetRef {
  id: string
  code: string | null
  name: string
  assetType: string
  metadata: unknown
}

export interface AuditAssignmentsResult {
  auditors: { userId: string; name: string; email: string; assetIds: string[] }[]
  assets: {
    id: string
    code: string | null
    name: string
    assetType: string
    category: AuditableAssetCategory
    plate: string | null
    chassisNumber: string | null
    engineNumber: string | null
  }[]
}

// Orquestación compartida por getAssignments() de rodados y seguros — los
// únicos 2 dominios con este mecanismo (matafuegos gestiona su alcance por
// otro camino, vía users.service, no tiene este endpoint). Lo que difiere
// por dominio (a cargo del caller, vía `fetchCandidateAssets`): de dónde
// sacar el pool de activos candidatos — rodados lo deriva de
// FireExtinguisher activo (join a Asset + matchesAuditPopulation), seguros
// consulta Asset.insuranceAuditable directo.
export async function getAuditAssetAssignments(
  moduleKey: ModuleKey,
  area: AuditScopeArea,
  fetchCandidateAssets: () => Promise<AssignableAssetRef[]>,
): Promise<AuditAssignmentsResult> {
  const [auditors, candidateAssets, scopes] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true, accessProfile: { modules: { has: moduleKey } } },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
    fetchCandidateAssets(),
    prisma.userAuditScope.findMany({ where: { area }, select: { userId: true, scopeValue: true } }),
  ])

  const assetIdsByUser = new Map<string, string[]>()
  for (const s of scopes) {
    const list = assetIdsByUser.get(s.userId)
    if (list) list.push(s.scopeValue)
    else assetIdsByUser.set(s.userId, [s.scopeValue])
  }

  // Un activo puede haber quedado asignado antes de perder elegibilidad (se
  // le quitó el tilde, se dio de baja su único matafuego, cambió de
  // categoría, etc.) — no mostrarlo como asignado, porque tampoco se puede
  // desmarcar desde la UI (ni aparece ahí). Se limpia solo la próxima vez
  // que se guarde la asignación de ese usuario (ver saveAuditAssetAssignment).
  const eligibleAssets = candidateAssets
    .map((asset) => ({ asset, category: classifyAuditableAssetCategory(asset.assetType) }))
    .filter((x): x is { asset: AssignableAssetRef; category: AuditableAssetCategory } => x.category !== null)
  const eligibleAssetIds = new Set(eligibleAssets.map((x) => x.asset.id))

  return {
    auditors: auditors.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      assetIds: (assetIdsByUser.get(u.id) ?? []).filter((id) => eligibleAssetIds.has(id)),
    })),
    assets: eligibleAssets.map(({ asset, category }) => ({
      id: asset.id,
      code: asset.code,
      name: asset.name,
      assetType: asset.assetType,
      category,
      ...extractVehicleMeta(asset.metadata),
    })),
  }
}

// Contraparte de getAuditAssetAssignments — el caller re-valida elegibilidad
// (vía `fetchValidAssetIds`) y lo que ya no es elegible se descarta en
// silencio en vez de rechazar todo el guardado: el checklist de la UI solo
// puede enviar activos elegibles, así que un id no elegible acá solo puede
// ser un resabio de una asignación vieja o una carrera con otro cambio —
// nunca algo que el admin eligió a propósito. Bloquear todo el guardado lo
// dejaría sin forma de sacar ese resabio, porque tampoco aparece en la UI
// para desmarcarlo.
export async function saveAuditAssetAssignment(
  userId: string,
  assetIds: string[],
  area: AuditScopeArea,
  fetchValidAssetIds: (assetIds: string[]) => Promise<Set<string>>,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError(404, 'Usuario no encontrado', 'NOT_FOUND')

  let validAssetIds = assetIds
  if (assetIds.length > 0) {
    const validIds = await fetchValidAssetIds(assetIds)
    validAssetIds = assetIds.filter((id) => validIds.has(id))
  }

  await replaceUserAuditScope(userId, area, validAssetIds)
}
