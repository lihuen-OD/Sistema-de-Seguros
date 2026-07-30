import { z } from 'zod'
import { PaginationSchema, ActiveFilterSchema, booleanFromString } from '../../shared/schemas/common'

const ISODate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido. Usar YYYY-MM-DD')
  .transform((s) => new Date(s + 'T00:00:00.000Z'))

// Una línea de cobertura dentro de una póliza — un activo (o ninguno, para
// casos como Accidentes Personales) con su propio tipo de seguro, coberturas,
// suma asegurada/tipo de cambio, e imputación empresa/centro de costo cuando
// no hay activo (con activo, la imputación ya vive en Asset.allocations).
const PolicyAssetCoverageInputSchema = z.object({
  // Si viene, actualiza esa línea existente (preserva sus adjuntos); si no,
  // crea una nueva — ver policies.service.ts#replaceCoverages.
  id: z.string().uuid('ID de línea de cobertura inválido').optional(),
  assetId: z.string().uuid('ID de activo inválido').optional().nullable(),
  insuranceTypeId: z.string().uuid('ID de tipo de seguro inválido'),
  coverageIds: z.array(z.string()).default([]),
  insuredAmount: z.number().min(0).default(0),
  currency: z.enum(['ARS', 'USD']).default('ARS'),
  exchangeRate: z.number().min(0).default(1),
  companyId: z.string().uuid('ID de empresa inválido').optional().nullable(),
  costCenterId: z.string().uuid('ID de centro de costo inválido').optional().nullable(),
  beneficiaryDescription: z.string().max(2000).optional().nullable(),
})

const PolicyBaseSchema = z.object({
  policyNumber: z.string().min(1, 'El número de póliza es requerido').max(100),
  producerId: z.string().uuid('ID de productor inválido').optional().nullable(),
  insuredName: z.string().min(1, 'El nombre del asegurado es requerido').max(300),
  startDate: ISODate,
  endDate: ISODate,
  description: z.string().max(1000).optional(),
})

export const CreatePolicySchema = PolicyBaseSchema.extend({
  coverages: z.array(PolicyAssetCoverageInputSchema).min(1, 'Agregá al menos una línea de cobertura'),
}).refine(
  (data) => data.endDate.getTime() >= data.startDate.getTime(),
  { message: 'La fecha de fin debe ser posterior a la fecha de inicio', path: ['endDate'] },
)

// UpdatePolicySchema solo toca los datos únicos de la póliza — las líneas de
// cobertura se reemplazan aparte, vía PUT /:id/coverages (ver
// ReplaceCoveragesSchema), para no perder adjuntos de líneas que no cambiaron.
export const UpdatePolicySchema = PolicyBaseSchema.partial().omit({ policyNumber: true })

export const ReplaceCoveragesSchema = z.object({
  coverages: z.array(PolicyAssetCoverageInputSchema).min(1, 'Agregá al menos una línea de cobertura'),
})

export const ListPoliciesQuerySchema = PaginationSchema.merge(ActiveFilterSchema).extend({
  search: z.string().optional(),
  status: z.enum(['vigente', 'proxima_a_vencer', 'vencida', 'de_baja']).optional(),
  insuranceTypeId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  producerId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  // El Dashboard de Seguros necesita, para MUCHAS pólizas a la vez, el
  // detalle de cada línea de cobertura (para agregar por activo/tipo de
  // seguro/aseguradora) — pedirlo acá evita un N+1 de GET /coverages por
  // póliza (que con cientos de pólizas sería inviable).
  includeCoverages: booleanFromString.optional(),
})

export const AddPolicyAttachmentSchema = z.object({
  description: z.string().max(500).optional(),
  // Llega por multipart/form-data — el frontend solo manda el campo cuando
  // está tildado ('true'), nunca 'false' explícito (mismo criterio que el
  // resto de los campos opcionales de este schema).
  isCirculationCard: z.literal('true').optional().transform((v) => v === 'true'),
})

export type PolicyAssetCoverageInputDTO = z.infer<typeof PolicyAssetCoverageInputSchema>
export type CreatePolicyDTO = z.infer<typeof CreatePolicySchema>
export type UpdatePolicyDTO = z.infer<typeof UpdatePolicySchema>
export type ReplaceCoveragesDTO = z.infer<typeof ReplaceCoveragesSchema>
export type ListPoliciesQueryDTO = z.infer<typeof ListPoliciesQuerySchema>
export type AddPolicyAttachmentDTO = z.infer<typeof AddPolicyAttachmentSchema>
