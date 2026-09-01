import { z } from 'zod'
import { PaginationSchema, booleanFromString } from '../../shared/schemas/common'
import { AuditPeriodQuerySchema, BulkApproveAuditsSchema } from '../../shared/schemas/audit-domain'
import { AUDITABLE_ASSET_CATEGORIES } from '../../shared/types'
import {
  FIRE_EXT_AUDIT_CLEANLINESS,
  FIRE_EXT_AUDIT_CHARGE_FILL_STATUS,
  FIRE_EXT_AUDIT_MOUNTING_CONDITION,
  FIRE_EXT_AUDIT_HAS_STATUS,
  FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION,
  FIRE_EXT_AUDIT_MASTER_FIELDS,
  FIRE_EXT_AUDIT_STATUSES,
} from './fire-extinguisher-audits.constants'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

const ISODateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')

// No todos los matafuegos tienen una fecha de vencimiento de carga conocida al
// momento de auditar — a diferencia del resto del checklist, este campo puede
// quedar sin cargar. Acepta string vacío (lo que manda el frontend cuando el
// input date queda en blanco) además de undefined/null.
const OptionalISODate = z
  .union([ISODate, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v == null ? null : v))

// ── Paso 2 — Validación de ubicación ───────────────────────────────────────────

const LocationReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('OK') }),
  z.object({
    action: z.literal('MODIFICAR'),
    proposedLocation: z.string().trim().min(1, 'La ubicación propuesta es requerida').max(200),
    reason: z.string().max(500).optional().nullable(),
  }),
])

// ── Paso 3 — Validación de campos maestros ─────────────────────────────────────

const MasterFieldReviewSchema = z
  .discriminatedUnion('action', [
    z.object({
      field: z.enum(FIRE_EXT_AUDIT_MASTER_FIELDS),
      action: z.literal('OK'),
    }),
    z.object({
      field: z.enum(FIRE_EXT_AUDIT_MASTER_FIELDS),
      action: z.literal('MODIFICAR'),
      newValue: z.string().trim().min(1, 'El valor propuesto es requerido').max(200),
      reason: z.string().max(500).optional().nullable(),
    }),
  ])
  .refine(
    (data) => (data.action === 'MODIFICAR' && data.field === 'expirationDate' ? ISODateString.safeParse(data.newValue).success : true),
    { message: 'Formato de fecha inválido. Usar YYYY-MM-DD', path: ['newValue'] },
  )

const MasterDataReviewSchema = z
  .array(MasterFieldReviewSchema)
  .length(FIRE_EXT_AUDIT_MASTER_FIELDS.length, `masterDataReview debe incluir exactamente ${FIRE_EXT_AUDIT_MASTER_FIELDS.length} entradas`)
  .refine(
    (arr) => {
      const fields = arr.map((f) => f.field)
      const uniqueFields = new Set(fields)
      return uniqueFields.size === FIRE_EXT_AUDIT_MASTER_FIELDS.length && FIRE_EXT_AUDIT_MASTER_FIELDS.every((f) => uniqueFields.has(f))
    },
    { message: 'masterDataReview debe incluir exactamente una entrada por cada campo, sin duplicados ni faltantes' },
  )

// ── Paso 4 — Checklist de condición ────────────────────────────────────────────

const ChecklistSchema = z.object({
  cleanliness: z.enum(FIRE_EXT_AUDIT_CLEANLINESS),
  chargeFillStatus: z.enum(FIRE_EXT_AUDIT_CHARGE_FILL_STATUS),
  mountingCondition: z.enum(FIRE_EXT_AUDIT_MOUNTING_CONDITION),
  sealStatus: z.enum(FIRE_EXT_AUDIT_HAS_STATUS),
  ringStatus: z.enum(FIRE_EXT_AUDIT_HAS_STATUS),
  hoseNozzleCondition: z.enum(FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION),
  chargeExpirationDateObserved: OptionalISODate,
  comments: z.string().max(1000).optional().nullable(),
})

// ── Alta de auditoría ───────────────────────────────────────────────────────────

export const CreateFireExtinguisherAuditSchema = z.object({
  fireExtinguisherId: z.string().uuid('ID de matafuego inválido'),
  locationReview: LocationReviewSchema,
  masterDataReview: MasterDataReviewSchema,
  checklist: ChecklistSchema,
})

export const AddFireExtinguisherAuditAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
})

// ── Edición de auditoría pendiente de revisión ──────────────────────────────────
// Mismo cuerpo que el alta, sin fireExtinguisherId — el service solo permite
// editar mientras status === 'SUBMITTED' y el matafuego auditado no cambia.
export const UpdateFireExtinguisherAuditSchema = z.object({
  locationReview: LocationReviewSchema,
  masterDataReview: MasterDataReviewSchema,
  checklist: ChecklistSchema,
})

// ── Revisión/aprobación (Fase 4) ────────────────────────────────────────────────

const ReviewDecisionSchema = z.object({
  proposedChangeId: z.string().uuid('ID de cambio propuesto inválido'),
  decision: z.enum(['APPROVED', 'REJECTED'], {
    errorMap: () => ({ message: 'decision debe ser APPROVED o REJECTED' }),
  }),
})

export const ReviewFireExtinguisherAuditSchema = z.object({
  // La cobertura exacta contra los proposedChanges PENDING de la auditoría se
  // valida en el service (requiere leer el estado real en base de datos).
  decisions: z.array(ReviewDecisionSchema).max(50).default([]),
  auditDecision: z.enum(['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'], {
    errorMap: () => ({ message: 'auditDecision debe ser APPROVED, REJECTED o NEEDS_CORRECTION' }),
  }),
  reviewNotes: z.string().max(1000).optional().nullable(),
})

// Aprobación en bloque — a diferencia de review(), no recibe decisions por
// cambio propuesto: aprueba automáticamente todos los cambios propuestos
// PENDING de cada auditoría seleccionada (confía en lo que cargó el
// auditor). Pensada para el caso común de muchas auditorías sin nada que
// objetar; una auditoría puntual que requiera decidir cambio por cambio
// sigue yendo por review(). Mismo shape que los otros 2 dominios de
// auditoría — ver shared/schemas/audit-domain.ts.
export const BulkApproveFireExtinguisherAuditsSchema = BulkApproveAuditsSchema

// Acepta ?campo=valor (string) o ?campo=valor1&campo=valor2 (array,
// comportamiento nativo de Express/qs con params repetidos, también con
// notación campo[]=valor1&campo[]=valor2) y lo normaliza siempre a un array
// (o undefined si no vino). Factorizado porque el listado de auditorías
// soporta varios filtros multi-select con esta misma forma (status y los
// filtros avanzados de establecimiento/tipo/checklist más abajo).
function arrayFilter<Schema extends z.ZodTypeAny>(schema: Schema) {
  return z
    .union([schema, z.array(schema)])
    .optional()
    .transform((v) => {
      // TS no puede acotar `Array.isArray` sobre una unión genérica (Schema
      // podría en teoría ser un array), así que el resultado se castea
      // explícitamente — los schemas que se le pasan acá nunca son arrays.
      if (v === undefined) return undefined
      return (Array.isArray(v) ? v : [v]) as z.infer<Schema>[]
    })
}

export const ListFireExtinguisherAuditsQuerySchema = PaginationSchema.extend({
  status: arrayFilter(z.enum(FIRE_EXT_AUDIT_STATUSES)),
  // Historial de auditorías de un matafuego puntual (ficha de detalle).
  fireExtinguisherId: z.string().uuid('ID de matafuego inválido').optional(),
  // ── Filtros avanzados de la tabla (Fase 1 — columnas/filtros de checklist) ──
  // auditedBy/establishment/locationType/type son texto libre respaldado por
  // catálogo (establishment/locationType/type) o sin catálogo (auditedBy) —
  // no son enums, se filtran por igualdad exacta contra lo que ya guarda
  // FireExtinguisher/FireExtinguisherAudit.
  auditedBy: arrayFilter(z.string().trim().min(1)),
  establishment: arrayFilter(z.string().trim().min(1)),
  locationType: arrayFilter(z.string().trim().min(1)),
  type: arrayFilter(z.string().trim().min(1)),
  cleanliness: arrayFilter(z.enum(FIRE_EXT_AUDIT_CLEANLINESS)),
  chargeFillStatus: arrayFilter(z.enum(FIRE_EXT_AUDIT_CHARGE_FILL_STATUS)),
  mountingCondition: arrayFilter(z.enum(FIRE_EXT_AUDIT_MOUNTING_CONDITION)),
  sealStatus: arrayFilter(z.enum(FIRE_EXT_AUDIT_HAS_STATUS)),
  ringStatus: arrayFilter(z.enum(FIRE_EXT_AUDIT_HAS_STATUS)),
  hoseNozzleCondition: arrayFilter(z.enum(FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION)),
  // "Con cambios propuestos" (true) / "Sin cambios propuestos" (false) — mismo
  // criterio que proposedChangesCount en la respuesta (cualquier estado, no
  // solo PENDING).
  hasProposedChanges: booleanFromString.optional(),
  // Categoría del Asset al que está montado el matafuego (una de
  // AUDITABLE_ASSET_CATEGORIES) — solo tiene efecto en población ASSET
  // (Auditoría de Rodados); ESTABLISHMENT (Matafuegos) lo ignora, mismo
  // criterio que establishment/category en AuditDashboardQuerySchema más abajo.
  category: arrayFilter(z.enum(AUDITABLE_ASSET_CATEGORIES)),
})

// ── Cobertura por establecimiento ───────────────────────────────────────────────
// Mismo shape que los otros 2 dominios de auditoría — ver shared/schemas/audit-domain.ts.

export const CoverageQuerySchema = AuditPeriodQuerySchema

// ── Dashboard de nivel % (auditoría mensual) ────────────────────────────────────
// `establishment` solo tiene efecto en la población ESTABLISHMENT (Matafuegos);
// `category` solo en la población ASSET (Activos) — cada router de auditoría
// ignora el filtro que no le corresponde.

export const AuditDashboardQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'),
  establishment: z.string().optional(),
  category: z.enum(AUDITABLE_ASSET_CATEGORIES).optional(),
})

// ── Historial de limpieza multi-período (heatmap sector × mes) ─────────────────
// `periods` viaja como un único string separado por comas (no arrays
// serializados de axios) — se separa, deduplica y valida cada elemento acá.
// Tope de 24 (2 años) para acotar el ancho de la tabla y el costo de la query.
export const CleanlinessHistoryQuerySchema = z.object({
  periods: z
    .string()
    .transform((v) => [...new Set(v.split(',').map((p) => p.trim()).filter(Boolean))])
    .pipe(
      z
        .array(z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'))
        .min(1, 'Debe seleccionar al menos un período')
        .max(24, 'Máximo 24 períodos por consulta'),
    ),
})
export type CleanlinessHistoryQueryDTO = z.infer<typeof CleanlinessHistoryQuerySchema>

export type LocationReviewDTO = z.infer<typeof LocationReviewSchema>
export type MasterFieldReviewDTO = z.infer<typeof MasterFieldReviewSchema>
export type ChecklistDTO = z.infer<typeof ChecklistSchema>
export type CreateFireExtinguisherAuditDTO = z.infer<typeof CreateFireExtinguisherAuditSchema>
export type UpdateFireExtinguisherAuditDTO = z.infer<typeof UpdateFireExtinguisherAuditSchema>
export type AddFireExtinguisherAuditAttachmentDTO = z.infer<typeof AddFireExtinguisherAuditAttachmentSchema>
export type ReviewFireExtinguisherAuditDTO = z.infer<typeof ReviewFireExtinguisherAuditSchema>
export type BulkApproveFireExtinguisherAuditsDTO = z.infer<typeof BulkApproveFireExtinguisherAuditsSchema>
export type ListFireExtinguisherAuditsQueryDTO = z.infer<typeof ListFireExtinguisherAuditsQuerySchema>
export type CoverageQueryDTO = z.infer<typeof CoverageQuerySchema>
export type AuditDashboardQueryDTO = z.infer<typeof AuditDashboardQuerySchema>

// Mismo shape que CoverageQuerySchema (solo `period`) — alias propio para que
// el nombre del tipo hable del endpoint que lo usa.
export const AuditorProgressQuerySchema = CoverageQuerySchema
export type AuditorProgressQueryDTO = z.infer<typeof AuditorProgressQuerySchema>

// Comentario suelto ("Agregar comentario"), sin auditoría de por medio — ver
// fire-extinguisher-audits.service.ts#addComment. Compartido por Matafuegos
// (ESTABLISHMENT) y Rodados (ASSET) — ambos routers importan de este archivo.
export const AddCommentSchema = z.object({
  targetId: z.string().uuid('ID de matafuego inválido'),
  body: z.string().trim().min(1, 'El comentario no puede estar vacío').max(1000),
})
export type AddCommentDTO = z.infer<typeof AddCommentSchema>
