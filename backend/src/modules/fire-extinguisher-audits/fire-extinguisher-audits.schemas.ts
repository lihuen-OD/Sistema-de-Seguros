import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'
import {
  FIRE_EXT_AUDIT_CLEANLINESS,
  FIRE_EXT_AUDIT_CHARGE_FILL_STATUS,
  FIRE_EXT_AUDIT_PLATE_CONDITION,
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
  beaconPlateCondition: z.enum(FIRE_EXT_AUDIT_PLATE_CONDITION),
  sealStatus: z.enum(FIRE_EXT_AUDIT_HAS_STATUS),
  ringStatus: z.enum(FIRE_EXT_AUDIT_HAS_STATUS),
  hoseNozzleCondition: z.enum(FIRE_EXT_AUDIT_HOSE_NOZZLE_CONDITION),
  chargeExpirationDateObserved: ISODate,
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

// Acepta ?status=SUBMITTED (string) o ?status=SUBMITTED&status=NEEDS_CORRECTION
// (array, comportamiento nativo de Express/qs con params repetidos) y lo
// normaliza siempre a un array (o undefined si no vino).
export const ListFireExtinguisherAuditsQuerySchema = PaginationSchema.extend({
  status: z
    .union([z.enum(FIRE_EXT_AUDIT_STATUSES), z.array(z.enum(FIRE_EXT_AUDIT_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
})

// ── Cobertura por establecimiento ───────────────────────────────────────────────

export const CoverageQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'Formato de período inválido. Usar YYYY-MM'),
})

export type LocationReviewDTO = z.infer<typeof LocationReviewSchema>
export type MasterFieldReviewDTO = z.infer<typeof MasterFieldReviewSchema>
export type ChecklistDTO = z.infer<typeof ChecklistSchema>
export type CreateFireExtinguisherAuditDTO = z.infer<typeof CreateFireExtinguisherAuditSchema>
export type AddFireExtinguisherAuditAttachmentDTO = z.infer<typeof AddFireExtinguisherAuditAttachmentSchema>
export type ReviewFireExtinguisherAuditDTO = z.infer<typeof ReviewFireExtinguisherAuditSchema>
export type ListFireExtinguisherAuditsQueryDTO = z.infer<typeof ListFireExtinguisherAuditsQuerySchema>
export type CoverageQueryDTO = z.infer<typeof CoverageQuerySchema>
