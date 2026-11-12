import { z } from 'zod'
import { PaginationSchema } from '../../shared/schemas/common'

// ── Primitivas ────────────────────────────────────────────────────────────────

// Mes calendario 'YYYY-MM' (01-12) — mismo formato que startMonthOverride y
// que el CHECK insurance_budget_months_month_format de la migración.
export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mes inválido (formato YYYY-MM)')

// Los cuatro niveles son independientes — ver schema.prisma#InsuranceBudget.
export const BUDGET_SCOPE_TYPES = ['COMPANY', 'COST_CENTER', 'FIXED_ASSET', 'ASSET'] as const
export const BudgetScopeTypeSchema = z.enum(BUDGET_SCOPE_TYPES)
export type BudgetScopeType = z.infer<typeof BudgetScopeTypeSchema>

// Máximo de meses por consulta o por escritura (5 años). Mismo tope que
// generateMonthRange del frontend; acota también el tamaño del body (el
// límite de express.json es 10 kB).
export const MAX_MONTHS = 60

// Techo anti-typo (no es un límite de negocio): entra holgado en DECIMAL(14,2).
const MAX_AMOUNT_USD = 100_000_000_000

// Importe USD con a lo sumo 2 decimales. 0 es válido (presupuesto cero ≠ sin
// presupuesto).
export const AmountUsdSchema = z
  .number()
  .finite()
  .min(0, 'El importe no puede ser negativo')
  .max(MAX_AMOUNT_USD, 'Importe fuera de rango')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'El importe admite como máximo 2 decimales')

const NotesSchema = z.string().trim().max(2000)
const ReasonSchema = z.string().trim().max(500)

/** Diferencia en meses entre dos claves 'YYYY-MM' (to − from). */
export function monthSpan(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty - fy) * 12 + (tm - fm)
}

function noDuplicateMonths(entries: { month: string }[], ctx: z.RefinementCtx) {
  const seen = new Set<string>()
  entries.forEach((entry, index) => {
    if (seen.has(entry.month)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, 'month'], message: `Mes repetido: ${entry.month}` })
    }
    seen.add(entry.month)
  })
}

// ── Listado ──────────────────────────────────────────────────────────────────

export const ListBudgetsQuerySchema = z
  .object({
    scopeType: BudgetScopeTypeSchema,
    from: MonthKeySchema,
    to: MonthKeySchema,
  })
  .strict()
  .superRefine((q, ctx) => {
    const span = monthSpan(q.from, q.to)
    if (span < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'El mes final es anterior al inicial' })
    else if (span + 1 > MAX_MONTHS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: `El rango no puede superar ${MAX_MONTHS} meses` })
    }
  })

export type ListBudgetsQueryDTO = z.infer<typeof ListBudgetsQuerySchema>

// ── Alta ─────────────────────────────────────────────────────────────────────

const CreateMonthSchema = z.object({ month: MonthKeySchema, amountUsd: AmountUsdSchema }).strict()

export const CreateBudgetSchema = z
  .object({
    scopeType: BudgetScopeTypeSchema,
    scopeId: z.string().trim().min(1).max(64),
    notes: NotesSchema.nullable().optional(),
    months: z.array(CreateMonthSchema).max(MAX_MONTHS).superRefine(noDuplicateMonths).optional(),
    reason: ReasonSchema.optional(),
  })
  .strict()

export type CreateBudgetDTO = z.infer<typeof CreateBudgetSchema>

// ── Edición ──────────────────────────────────────────────────────────────────

// amountUsd null = vaciar el mes (vuelve a "sin presupuesto"); queda auditado.
const UpdateMonthSchema = z.object({ month: MonthKeySchema, amountUsd: AmountUsdSchema.nullable() }).strict()

export const UpdateBudgetSchema = z
  .object({
    // La versión que el cliente vio — compare-and-set en el service (409 si
    // otro usuario guardó antes).
    expectedVersion: z.number().int().min(1),
    notes: NotesSchema.nullable().optional(),
    months: z.array(UpdateMonthSchema).min(1).max(MAX_MONTHS).superRefine(noDuplicateMonths).optional(),
    reason: ReasonSchema.optional(),
  })
  .strict()
  .refine((b) => b.notes !== undefined || b.months !== undefined, {
    message: 'No hay cambios para guardar (notes o months)',
    path: ['months'],
  })

export type UpdateBudgetDTO = z.infer<typeof UpdateBudgetSchema>

// ── Historial ────────────────────────────────────────────────────────────────

export const BudgetAuditLogQuerySchema = PaginationSchema.extend({
  from: MonthKeySchema.optional(),
  to: MonthKeySchema.optional(),
})
  .strict()
  .superRefine((q, ctx) => {
    if (q.from && q.to && monthSpan(q.from, q.to) < 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'El mes final es anterior al inicial' })
    }
  })

export type BudgetAuditLogQueryDTO = z.infer<typeof BudgetAuditLogQuerySchema>
