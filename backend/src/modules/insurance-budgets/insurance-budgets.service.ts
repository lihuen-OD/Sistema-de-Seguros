import { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import { AppError } from '../../shared/errors/AppError'
import { buildPaginatedResponse } from '../../shared/utils/pagination'
import type {
  BudgetAuditLogQueryDTO,
  BudgetScopeType,
  CreateBudgetDTO,
  ListBudgetsQueryDTO,
  UpdateBudgetDTO,
} from './insurance-budgets.schemas'

// ── Alcance ──────────────────────────────────────────────────────────────────

type ScopeField = 'companyId' | 'costCenterId' | 'fixedAssetId' | 'assetId'

const SCOPE_FIELD: Record<BudgetScopeType, ScopeField> = {
  COMPANY: 'companyId',
  COST_CENTER: 'costCenterId',
  FIXED_ASSET: 'fixedAssetId',
  ASSET: 'assetId',
}

const SCOPE_LABEL: Record<BudgetScopeType, string> = {
  COMPANY: 'La empresa',
  COST_CENTER: 'El centro de costo',
  FIXED_ASSET: 'El bien de uso',
  ASSET: 'El activo',
}

// Solo se puede abrir un presupuesto para un alcance existente y activo. Los
// presupuestos ya creados de entidades que después se desactivan se siguen
// leyendo y editando (son historial), solo no se crean nuevos.
async function assertScopeIsActive(scopeType: BudgetScopeType, scopeId: string): Promise<void> {
  const where = { id: scopeId }
  const select = { id: true, isActive: true }
  const row =
    scopeType === 'COMPANY'
      ? await prisma.company.findUnique({ where, select })
      : scopeType === 'COST_CENTER'
        ? await prisma.costCenter.findUnique({ where, select })
        : scopeType === 'FIXED_ASSET'
          ? await prisma.fixedAsset.findUnique({ where, select })
          : await prisma.asset.findUnique({ where, select })
  if (!row || !row.isActive) {
    throw new AppError(404, `${SCOPE_LABEL[scopeType]} no existe o está inactivo`, 'SCOPE_NOT_FOUND')
  }
}

// ── Importes ─────────────────────────────────────────────────────────────────
// DECIMAL(14,2) en la base; en la API viaja como number. Se compara en
// centavos enteros para no depender de la representación binaria.

function toCents(value: Prisma.Decimal | number): number {
  return Math.round(Number(value) * 100)
}

function toDecimal(amountUsd: number): Prisma.Decimal {
  return new Prisma.Decimal(amountUsd.toFixed(2))
}

function toNumber(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value)
}

// ── Serialización ────────────────────────────────────────────────────────────

const budgetInclude = (monthWhere?: Prisma.InsuranceBudgetMonthWhereInput) =>
  ({
    months: { where: monthWhere, orderBy: { month: 'asc' as const }, select: { month: true, amountUsd: true } },
  }) satisfies Prisma.InsuranceBudgetInclude

type BudgetWithMonths = Prisma.InsuranceBudgetGetPayload<{ include: ReturnType<typeof budgetInclude> }>

function serializeBudget(budget: BudgetWithMonths) {
  const scopeType = budget.scopeType as BudgetScopeType
  return {
    id: budget.id,
    scopeType,
    scopeId: budget[SCOPE_FIELD[scopeType]] as string,
    notes: budget.notes,
    version: budget.version,
    createdBy: budget.createdBy,
    updatedBy: budget.updatedBy,
    createdAt: budget.createdAt,
    updatedAt: budget.updatedAt,
    months: budget.months.map((m) => ({ month: m.month, amountUsd: Number(m.amountUsd) })),
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// ── Service ──────────────────────────────────────────────────────────────────

export const insuranceBudgetsService = {
  // Todas las líneas del nivel (aunque no tengan meses en el rango: el
  // editor necesita su id y versión) con solo los meses del rango. Acotado
  // por la cantidad de entidades del nivel × MAX_MONTHS.
  async findAll({ scopeType, from, to }: ListBudgetsQueryDTO) {
    const budgets = await prisma.insuranceBudget.findMany({
      where: { scopeType },
      include: budgetInclude({ month: { gte: from, lte: to } }),
      orderBy: { createdAt: 'asc' },
    })
    return budgets.map(serializeBudget)
  },

  async findById(id: string) {
    const budget = await prisma.insuranceBudget.findUnique({ where: { id }, include: budgetInclude() })
    if (!budget) throw new AppError(404, 'Presupuesto no encontrado', 'NOT_FOUND')
    return serializeBudget(budget)
  },

  async create(dto: CreateBudgetDTO, performedBy: string) {
    const { scopeType, scopeId } = dto
    await assertScopeIsActive(scopeType, scopeId)

    const field = SCOPE_FIELD[scopeType]
    const existing = await prisma.insuranceBudget.findFirst({ where: { [field]: scopeId }, select: { id: true } })
    if (existing) {
      throw new AppError(409, `${SCOPE_LABEL[scopeType]} ya tiene un presupuesto — editá el existente`, 'BUDGET_ALREADY_EXISTS')
    }

    const notes = dto.notes ?? null
    const months = dto.months ?? []
    try {
      const created = await prisma.$transaction(async (tx) => {
        const budget = await tx.insuranceBudget.create({
          data: { scopeType, [field]: scopeId, notes, createdBy: performedBy, updatedBy: performedBy },
        })
        if (months.length > 0) {
          await tx.insuranceBudgetMonth.createMany({
            data: months.map((m) => ({ budgetId: budget.id, month: m.month, amountUsd: toDecimal(m.amountUsd), updatedBy: performedBy })),
          })
        }
        await tx.insuranceBudgetAuditLog.createMany({
          data: [
            { budgetId: budget.id, action: 'CREATE', newData: { notes }, reason: dto.reason ?? null, performedBy, versionAfter: 1 },
            ...months.map((m) => ({
              budgetId: budget.id,
              action: 'UPDATE_MONTHS' as const,
              month: m.month,
              previousAmountUsd: null,
              newAmountUsd: toDecimal(m.amountUsd),
              reason: dto.reason ?? null,
              performedBy,
              versionAfter: 1,
            })),
          ],
        })
        return tx.insuranceBudget.findUniqueOrThrow({ where: { id: budget.id }, include: budgetInclude() })
      })
      return serializeBudget(created)
    } catch (err) {
      // Carrera entre dos altas simultáneas del mismo alcance: la FK @unique
      // la resuelve la base; se informa igual que el chequeo previo.
      if (isUniqueViolation(err)) {
        throw new AppError(409, `${SCOPE_LABEL[scopeType]} ya tiene un presupuesto — editá el existente`, 'BUDGET_ALREADY_EXISTS')
      }
      throw err
    }
  },

  // Edición con concurrencia optimista:
  // 1. Se calcula el diff contra lo guardado. Sin cambios → no se audita ni se
  //    sube la versión (se devuelve el estado actual).
  // 2. Compare-and-set de `version` (updateMany con la versión esperada): si
  //    otro usuario guardó antes, count = 0 → 409 y no se escribe nada.
  //    Dos transacciones concurrentes sobre la misma fila se serializan en
  //    ese UPDATE (READ COMMITTED reevalúa el WHERE tras el lock), así que la
  //    segunda siempre ve la versión nueva y falla — el diff de la primera
  //    nunca se pisa.
  // 3. Meses: alta / cambio / vaciado + una fila de auditoría por mes cambiado.
  async update(id: string, dto: UpdateBudgetDTO, performedBy: string) {
    const result = await prisma.$transaction(async (tx) => {
      const budget = await tx.insuranceBudget.findUnique({
        where: { id },
        select: { id: true, version: true, notes: true },
      })
      if (!budget) throw new AppError(404, 'Presupuesto no encontrado', 'NOT_FOUND')

      const requested = dto.months ?? []
      const stored = requested.length
        ? await tx.insuranceBudgetMonth.findMany({
            where: { budgetId: id, month: { in: requested.map((m) => m.month) } },
            select: { month: true, amountUsd: true },
          })
        : []
      const storedByMonth = new Map(stored.map((m) => [m.month, m.amountUsd]))

      const toCreate: { month: string; amountUsd: number }[] = []
      const toUpdate: { month: string; amountUsd: number; previous: Prisma.Decimal }[] = []
      const toClear: { month: string; previous: Prisma.Decimal }[] = []
      for (const entry of requested) {
        const previous = storedByMonth.get(entry.month)
        if (entry.amountUsd === null) {
          if (previous !== undefined) toClear.push({ month: entry.month, previous })
        } else if (previous === undefined) {
          toCreate.push({ month: entry.month, amountUsd: entry.amountUsd })
        } else if (toCents(previous) !== toCents(entry.amountUsd)) {
          toUpdate.push({ month: entry.month, amountUsd: entry.amountUsd, previous })
        }
      }
      const nextNotes = dto.notes === undefined ? budget.notes : dto.notes
      const notesChanged = (nextNotes ?? null) !== (budget.notes ?? null)

      if (!notesChanged && toCreate.length + toUpdate.length + toClear.length === 0) {
        return { changed: false as const }
      }

      const versionAfter = dto.expectedVersion + 1
      const cas = await tx.insuranceBudget.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { version: { increment: 1 }, updatedBy: performedBy, ...(notesChanged ? { notes: nextNotes } : {}) },
      })
      if (cas.count !== 1) {
        throw new AppError(
          409,
          'Otro usuario modificó este presupuesto mientras lo editabas. Se recargaron los datos: revisá y volvé a guardar.',
          'BUDGET_VERSION_CONFLICT',
        )
      }

      if (toClear.length) {
        await tx.insuranceBudgetMonth.deleteMany({ where: { budgetId: id, month: { in: toClear.map((m) => m.month) } } })
      }
      if (toCreate.length) {
        await tx.insuranceBudgetMonth.createMany({
          data: toCreate.map((m) => ({ budgetId: id, month: m.month, amountUsd: toDecimal(m.amountUsd), updatedBy: performedBy })),
        })
      }
      for (const m of toUpdate) {
        await tx.insuranceBudgetMonth.update({
          where: { budgetId_month: { budgetId: id, month: m.month } },
          data: { amountUsd: toDecimal(m.amountUsd), updatedBy: performedBy },
        })
      }

      const reason = dto.reason ?? null
      await tx.insuranceBudgetAuditLog.createMany({
        data: [
          ...(notesChanged
            ? [{
                budgetId: id,
                action: 'UPDATE_NOTES' as const,
                previousData: { notes: budget.notes ?? null },
                newData: { notes: nextNotes ?? null },
                reason,
                performedBy,
                versionAfter,
              }]
            : []),
          ...toCreate.map((m) => ({
            budgetId: id, action: 'UPDATE_MONTHS' as const, month: m.month,
            previousAmountUsd: null, newAmountUsd: toDecimal(m.amountUsd), reason, performedBy, versionAfter,
          })),
          ...toUpdate.map((m) => ({
            budgetId: id, action: 'UPDATE_MONTHS' as const, month: m.month,
            previousAmountUsd: m.previous, newAmountUsd: toDecimal(m.amountUsd), reason, performedBy, versionAfter,
          })),
          ...toClear.map((m) => ({
            budgetId: id, action: 'UPDATE_MONTHS' as const, month: m.month,
            previousAmountUsd: m.previous, newAmountUsd: null, reason, performedBy, versionAfter,
          })),
        ],
      })
      return { changed: true as const }
    })

    const budget = await insuranceBudgetsService.findById(id)
    return { ...budget, changed: result.changed }
  },

  // Historial permanente (sin retención), más reciente primero. Con from/to
  // se limita a los cambios de importes de esos meses (consulta de
  // ejercicios anteriores); sin filtro incluye también alta y notas.
  async findAuditLog(id: string, { page, limit, from, to }: BudgetAuditLogQueryDTO) {
    const exists = await prisma.insuranceBudget.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new AppError(404, 'Presupuesto no encontrado', 'NOT_FOUND')

    const where: Prisma.InsuranceBudgetAuditLogWhereInput = {
      budgetId: id,
      ...(from || to ? { month: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    }
    const [rows, total] = await Promise.all([
      prisma.insuranceBudgetAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { month: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.insuranceBudgetAuditLog.count({ where }),
    ])
    const data = rows.map((r) => ({
      id: r.id,
      action: r.action,
      month: r.month,
      previousAmountUsd: toNumber(r.previousAmountUsd),
      newAmountUsd: toNumber(r.newAmountUsd),
      previousData: r.previousData,
      newData: r.newData,
      reason: r.reason,
      performedBy: r.performedBy,
      versionAfter: r.versionAfter,
      createdAt: r.createdAt,
    }))
    return buildPaginatedResponse(data, total, { page, limit })
  },
}
