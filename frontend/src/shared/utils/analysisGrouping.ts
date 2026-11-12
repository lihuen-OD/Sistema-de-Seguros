import type { Asset, Company, CostCenter, DocumentPolicyAllocation, Policy } from '../types'
import { NO_ASSET_LINE_ROW_ID, NO_FIXED_ASSET_ROW_ID, fixedAssetRowIdOf, fixedAssetRows } from './fixedAssetGrouping'

// ═══════════════════════════════════════════════════════════════════════════
// Filas de los Análisis Financiero y Económico (fuente única de ambos).
//
// Cada movimiento (cuota en Financiero, documento en Económico) se reparte
// entre sus asignaciones; cada asignación cae en exactamente UNA fila de la
// agrupación elegida. Nada se descarta:
// - una asignación sin la relación de la agrupación (sin empresa, sin centro
//   de costo, sin aseguradora, sin activo, sin bien de uso) va a su fila
//   «Sin …»;
// - la parte de un movimiento que no está distribuida (documento sin
//   asignaciones, o asignaciones que no cubren el 100 %) va a «Sin asignar»;
// - una entidad con movimientos que la lista base no muestra (póliza vencida,
//   empresa inactiva, registro no encontrado) se agrega igual a la tabla.
// Así la suma de las filas de CUALQUIER agrupación es la de los movimientos
// del período (= KPI), sin duplicar: asignado + sin asignar = movimiento.
// ═══════════════════════════════════════════════════════════════════════════

export type AnalysisGrouping = 'empresa' | 'centro_costo' | 'aseguradora' | 'poliza' | 'activo' | 'bien_de_uso'

export interface MatrixRow { id: string; label: string; sublabel?: string }

export const UNASSIGNED_ROW_ID = '__sin_asignar__'
export const NO_COMPANY_ROW_ID = '__sin_empresa__'
export const NO_COST_CENTER_ROW_ID = '__sin_centro_costo__'
export const NO_INSURER_ROW_ID = '__sin_aseguradora__'

const SYNTHETIC_ROWS: Record<string, MatrixRow> = {
  [NO_COMPANY_ROW_ID]: { id: NO_COMPANY_ROW_ID, label: 'Sin empresa', sublabel: 'Asignaciones sin empresa asociada' },
  [NO_COST_CENTER_ROW_ID]: { id: NO_COST_CENTER_ROW_ID, label: 'Sin centro de costo', sublabel: 'Asignaciones sin centro de costo asociado' },
  [NO_INSURER_ROW_ID]: { id: NO_INSURER_ROW_ID, label: 'Sin aseguradora', sublabel: 'Pólizas sin aseguradora' },
  [NO_ASSET_LINE_ROW_ID]: { id: NO_ASSET_LINE_ROW_ID, label: 'Líneas sin activo', sublabel: 'Coberturas de póliza sin activo asociado' },
  [UNASSIGNED_ROW_ID]: { id: UNASSIGNED_ROW_ID, label: 'Sin asignar', sublabel: 'Importes no distribuidos entre pólizas' },
}

/** Orden de las filas «Sin …» al final de la tabla. */
const SYNTHETIC_ORDER = [NO_COMPANY_ROW_ID, NO_COST_CENTER_ROW_ID, NO_INSURER_ROW_ID, NO_FIXED_ASSET_ROW_ID, NO_ASSET_LINE_ROW_ID, UNASSIGNED_ROW_ID]

export function isSyntheticRowId(id: string): boolean {
  return id in SYNTHETIC_ROWS || id === NO_FIXED_ASSET_ROW_ID
}

// ── Contexto de cada asignación ──────────────────────────────────────────────
// Cada allocation ya apunta a una línea de cobertura puntual (assetId directo
// si tiene activo; empresa/centro de costo propios de la línea si es "sin
// activo") — se resuelve por allocation, no por póliza, porque una póliza de
// flota puede tener varias allocations del mismo documento repartidas entre
// distintos activos (ver seed.ts: factura de flota 60/40 entre 2 camiones).

export interface AllocationContext {
  policyId: string
  companyId: string
  costCenterId: string
  assetId: string | null
  /** Fila de la agrupación «Bien de uso» (ver fixedAssetGrouping). */
  fixedAssetRowId: string
  insuranceCompany: string
  allocatedAmount: number
  allocationPercentage: number
}

export function buildDocumentAllocationContexts(
  allocations: Pick<DocumentPolicyAllocation, 'accountingDocumentId' | 'policyId' | 'policyAssetCoverageId' | 'assetId' | 'allocatedAmount' | 'allocationPercentage'>[],
  policies: Policy[],
  assets: Asset[],
): Map<string, AllocationContext[]> {
  const policyById = new Map(policies.map((p) => [p.id, p]))
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const map = new Map<string, AllocationContext[]>()

  allocations.forEach((alloc) => {
    const policy = policyById.get(alloc.policyId)
    let companyId: string
    let costCenterId: string
    if (alloc.assetId) {
      const asset = assetById.get(alloc.assetId)
      companyId = asset?.companyId ?? ''
      costCenterId = asset?.costCenterId ?? ''
    } else {
      const coverage = policy?.coverages?.find((c) => c.id === alloc.policyAssetCoverageId)
      companyId = coverage?.companyId ?? ''
      costCenterId = coverage?.costCenterId ?? ''
    }
    const existing = map.get(alloc.accountingDocumentId) ?? []
    existing.push({
      policyId: alloc.policyId,
      companyId,
      costCenterId,
      assetId: alloc.assetId,
      fixedAssetRowId: fixedAssetRowIdOf(alloc.assetId, assetById),
      insuranceCompany: policy?.insuranceCompany ?? '',
      allocatedAmount: alloc.allocatedAmount,
      allocationPercentage: alloc.allocationPercentage,
    })
    map.set(alloc.accountingDocumentId, existing)
  })
  return map
}

/** Fila de la agrupación a la que va una asignación (nunca null: lo faltante va a su fila «Sin …»). */
export function rowIdFor(grouping: AnalysisGrouping, ctx: AllocationContext): string {
  switch (grouping) {
    case 'empresa': return ctx.companyId || NO_COMPANY_ROW_ID
    case 'centro_costo': return ctx.costCenterId || NO_COST_CENTER_ROW_ID
    case 'aseguradora': return ctx.insuranceCompany || NO_INSURER_ROW_ID
    case 'poliza': return ctx.policyId
    case 'activo': return ctx.assetId ?? NO_ASSET_LINE_ROW_ID
    case 'bien_de_uso': return ctx.fixedAssetRowId
  }
}

// ── Filas ────────────────────────────────────────────────────────────────────

/** Filas base de cada agrupación (las que se listan aunque estén en cero). */
export function getAnalysisRows(
  grouping: AnalysisGrouping,
  companies: Company[],
  costCenters: CostCenter[],
  assets: Asset[],
  policies: Policy[],
): MatrixRow[] {
  switch (grouping) {
    case 'empresa':
      return companies.filter((c) => c.status === 'activo').map((c) => ({ id: c.id, label: c.name }))
    case 'centro_costo':
      return costCenters.filter((cc) => cc.status === 'activo').map((cc) => ({
        id: cc.id, label: cc.name, sublabel: cc.description || undefined,
      }))
    case 'aseguradora': {
      const insurers = Array.from(new Set(policies.map((p) => p.insuranceCompany))).sort()
      return insurers.map((name) => ({ id: name, label: name }))
    }
    case 'poliza':
      return policies.filter((p) => p.status !== 'vencida').map((p) => policyRow(p))
    case 'activo':
      return assets.map((a) => ({ id: a.id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}` }))
    case 'bien_de_uso':
      return fixedAssetRows(assets)
  }
}

function policyRow(p: Policy, extra?: string): MatrixRow {
  const detail = `${(p.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'} · ${p.insuranceCompany}`
  return { id: p.id, label: p.policyNumber, sublabel: extra ? `${extra} · ${detail}` : detail }
}

/**
 * Filas de la tabla: las base + toda fila con movimientos que la lista base
 * no muestra (póliza vencida, empresa o centro inactivo, registro no
 * encontrado) + las filas «Sin …» que tengan movimientos, al final. Las filas
 * agregadas solo aparecen si tienen movimientos en el período (la matriz se
 * arma solo con movimientos del rango).
 */
export function completeRows(
  grouping: AnalysisGrouping,
  baseRows: MatrixRow[],
  rowIdsWithMovements: Iterable<string>,
  lookups: { companies: Company[]; costCenters: CostCenter[]; assets: Asset[]; policies: Policy[] },
): MatrixRow[] {
  const listed = new Set(baseRows.map((r) => r.id))
  const extra: MatrixRow[] = []
  const synthetic = new Set<string>()
  for (const id of rowIdsWithMovements) {
    if (listed.has(id)) continue
    if (isSyntheticRowId(id)) { synthetic.add(id); continue }
    listed.add(id)
    extra.push(resolveRow(grouping, id, lookups))
  }
  const syntheticRows = SYNTHETIC_ORDER
    .filter((id) => synthetic.has(id))
    .map((id) => SYNTHETIC_ROWS[id] ?? { id, label: id })
  return [...baseRows, ...extra, ...syntheticRows]
}

function resolveRow(
  grouping: AnalysisGrouping,
  id: string,
  { companies, costCenters, assets, policies }: { companies: Company[]; costCenters: CostCenter[]; assets: Asset[]; policies: Policy[] },
): MatrixRow {
  switch (grouping) {
    case 'empresa': {
      const c = companies.find((x) => x.id === id)
      return c ? { id, label: c.name, sublabel: 'Empresa inactiva' } : { id, label: 'Empresa no encontrada', sublabel: id }
    }
    case 'centro_costo': {
      const cc = costCenters.find((x) => x.id === id)
      return cc ? { id, label: cc.name, sublabel: 'Centro de costo inactivo' } : { id, label: 'Centro de costo no encontrado', sublabel: id }
    }
    case 'aseguradora':
      return { id, label: id }
    case 'poliza': {
      const p = policies.find((x) => x.id === id)
      return p ? policyRow(p, p.status === 'vencida' ? 'Vencida' : undefined) : { id, label: 'Póliza no encontrada', sublabel: id }
    }
    case 'activo': {
      const a = assets.find((x) => x.id === id)
      return a ? { id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}` } : { id, label: 'Activo no encontrado', sublabel: id }
    }
    case 'bien_de_uso':
      return { id, label: 'Bien de uso no encontrado', sublabel: id }
  }
}

/** Etiqueta de una fila «Sin …» (null si el id no es una fila sintética). */
export function syntheticRowLabel(id: string): string | null {
  if (id === NO_FIXED_ASSET_ROW_ID) return fixedAssetRows([]).find((r) => r.id === id)?.label ?? null
  return SYNTHETIC_ROWS[id]?.label ?? null
}
