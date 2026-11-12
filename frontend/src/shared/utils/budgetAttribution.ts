import type { Asset } from '../types'
import {
  NO_COMPANY_ROW_ID,
  NO_COST_CENTER_ROW_ID,
  UNASSIGNED_ROW_ID,
  type AllocationContext,
  type AnalysisGrouping,
} from './analysisGrouping'
import { NO_ASSET_LINE_ROW_ID, NO_FIXED_ASSET_ROW_ID } from './fixedAssetGrouping'

// ═══════════════════════════════════════════════════════════════════════════
// Presupuestos — imputación de lo real/proyectado a una fila del NIVEL.
//
// Cuatro niveles independientes (nunca se suman entre sí):
// - Empresa / Centro de costo: un activo se PRORRATEA según sus
//   Asset.allocations[].percentage (decisión del usuario 2026-11-12). Esto
//   difiere del Análisis Económico/Financiero, que imputan todo a la primera
//   asignación — la diferencia se explica en la conciliación, nunca se oculta.
//   Una línea de cobertura sin activo usa su empresa/centro de costo.
// - Bien de uso: Asset.fixedAssetId (mismas filas que fixedAssetGrouping).
// - Activo: assetId.
// Nada desaparece: lo que no corresponde a una entidad del nivel va a su fila
// «Sin …», y si los % de un activo suman menos de 100 el resto va a «Sin
// asignar». Los pesos de una imputación SIEMPRE suman 1.
//
// Limitación conocida (D8): AssetAllocation y Asset.fixedAssetId no tienen
// historial — los meses pasados se imputan con la asignación ACTUAL.
// ═══════════════════════════════════════════════════════════════════════════

export type BudgetLevel = 'COMPANY' | 'COST_CENTER' | 'FIXED_ASSET' | 'ASSET'

export const BUDGET_LEVELS: readonly BudgetLevel[] = ['COMPANY', 'COST_CENTER', 'FIXED_ASSET', 'ASSET']

/** Agrupación equivalente de los Análisis (mismos ids de fila y filas «Sin …»). */
export const BUDGET_LEVEL_GROUPING: Record<BudgetLevel, Extract<AnalysisGrouping, 'empresa' | 'centro_costo' | 'bien_de_uso' | 'activo'>> = {
  COMPANY: 'empresa',
  COST_CENTER: 'centro_costo',
  FIXED_ASSET: 'bien_de_uso',
  ASSET: 'activo',
}

/** Niveles en los que la imputación por % difiere de la de los Análisis. */
export function levelUsesProration(level: BudgetLevel): boolean {
  return level === 'COMPANY' || level === 'COST_CENTER'
}

/** Niveles afectados por la imputación histórica con asignaciones actuales (D8). */
export function levelAffectedByCurrentAllocations(level: BudgetLevel): boolean {
  return level !== 'ASSET'
}

export interface AttributionShare {
  rowId: string
  weight: number
}

/** Tolerancia (puntos %) para considerar que las asignaciones de un activo suman 100. */
const PERCENT_TOLERANCE = 0.01

function prorate(asset: Asset | undefined, key: 'companyId' | 'costCenterId', missingRowId: string): AttributionShare[] {
  const allocations = (asset?.allocations ?? []).filter((a) => Number.isFinite(a.percentage) && a.percentage > 0)
  if (allocations.length === 0) return [{ rowId: missingRowId, weight: 1 }]
  const totalPercent = allocations.reduce((s, a) => s + a.percentage, 0)
  // Más de 100 % no debería existir (el backend exige Σ = 100): si aparece,
  // se normaliza para no duplicar importes, y se informa como observación.
  const scale = totalPercent > 100 + PERCENT_TOLERANCE ? 100 / totalPercent : 1
  const byRow = new Map<string, number>()
  for (const a of allocations) {
    const rowId = a[key] || missingRowId
    byRow.set(rowId, (byRow.get(rowId) ?? 0) + (a.percentage * scale) / 100)
  }
  const shares = [...byRow.entries()].map(([rowId, weight]) => ({ rowId, weight }))
  const assigned = shares.reduce((s, x) => s + x.weight, 0)
  const leftover = 1 - assigned
  if (leftover > 1e-9) shares.push({ rowId: UNASSIGNED_ROW_ID, weight: leftover })
  return shares
}

/** Imputación de un ACTIVO a las filas del nivel (proyección y asignaciones con activo). */
export function assetAttribution(level: BudgetLevel, assetId: string, asset: Asset | undefined): AttributionShare[] {
  switch (level) {
    case 'ASSET':
      return [{ rowId: assetId, weight: 1 }]
    case 'FIXED_ASSET':
      return [{ rowId: asset?.fixedAssetId ?? NO_FIXED_ASSET_ROW_ID, weight: 1 }]
    case 'COMPANY':
      return prorate(asset, 'companyId', NO_COMPANY_ROW_ID)
    case 'COST_CENTER':
      return prorate(asset, 'costCenterId', NO_COST_CENTER_ROW_ID)
  }
}

/** Imputación de una asignación de documento (con o sin activo). */
export function contextAttribution(level: BudgetLevel, ctx: AllocationContext, assetById: Map<string, Asset>): AttributionShare[] {
  if (ctx.assetId) return assetAttribution(level, ctx.assetId, assetById.get(ctx.assetId))
  switch (level) {
    case 'ASSET':
    case 'FIXED_ASSET':
      return [{ rowId: NO_ASSET_LINE_ROW_ID, weight: 1 }]
    case 'COMPANY':
      return [{ rowId: ctx.companyId || NO_COMPANY_ROW_ID, weight: 1 }]
    case 'COST_CENTER':
      return [{ rowId: ctx.costCenterId || NO_COST_CENTER_ROW_ID, weight: 1 }]
  }
}

export interface AllocationPercentIssue {
  assetId: string
  assetName: string
  totalPercent: number
}

/** Activos con asignaciones cuyo % no suma 100 (solo se informa; nunca se corrige). */
export function allocationPercentIssues(assets: Asset[]): AllocationPercentIssue[] {
  const issues: AllocationPercentIssue[] = []
  for (const asset of assets) {
    const allocations = asset.allocations ?? []
    if (allocations.length === 0) continue
    const totalPercent = allocations.reduce((s, a) => s + (Number.isFinite(a.percentage) ? a.percentage : 0), 0)
    if (Math.abs(totalPercent - 100) > PERCENT_TOLERANCE) issues.push({ assetId: asset.id, assetName: asset.name, totalPercent })
  }
  return issues
}
