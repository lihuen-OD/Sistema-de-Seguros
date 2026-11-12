import type { DocumentForFinancial } from '../api/documents.api'
import type { RenewalProjectionMode, RenewalProjectionOverride } from '../api/renewal-projections.api'
import type { Asset, Policy } from '../types'
import {
  autoInstallmentsCount,
  buildAssetRealTimelineByCuota,
  buildAssetRealTimelineByDocument,
  convertibleLegacyFields,
  detectRenewalCycleByCuota,
  detectRenewalCycleByDocument,
  excludedAdjustmentsForAsset,
  hasCurrentOverrides,
  hasLegacyValues,
  inconsistentAllocationsForAsset,
  projectAssetRow,
  resolveEffectiveCycle,
  resolveRowBase,
  type AllocationInconsistency,
  type ExcludedAdjustmentItem,
  type LegacyAmountField,
  type RealMonthCell,
  type RenewalBaseStatus,
  type RenewalCycle,
  type RenewalTraceItem,
  type RowProjectionInputs,
} from './renewalProjectionCalc'

// ═══════════════════════════════════════════════════════════════════════════
// Filas de la Proyección de Renovaciones (fuente única).
//
// Extraído sin cambios de useRenewalProjectionData para que otra pantalla
// (Presupuestos) use EXACTAMENTE la misma proyección que las páginas de
// Proyección, sin copiar el motor. El hook sigue llamando a estas funciones
// en dos memos separados (datos por activo / filas) como antes.
// ═══════════════════════════════════════════════════════════════════════════

// Financiero calcula lo real por cuota (dueDate), Económico por documento
// (issueDate) — dos números legítimamente distintos para el mismo activo,
// así que se elige el par de funciones correcto según `mode` y nunca se
// mezclan datos ni overrides entre los dos (cada modo tiene su propia fila
// en AssetRenewalProjectionOverride, ver @@unique([assetId, mode])).
export const RENEWAL_PROJECTION_BUILDERS = {
  FINANCIAL: { buildTimeline: buildAssetRealTimelineByCuota, detectCycle: detectRenewalCycleByCuota },
  ECONOMIC: { buildTimeline: buildAssetRealTimelineByDocument, detectCycle: detectRenewalCycleByDocument },
} as const

export interface RenewalProjectionRowData extends RowProjectionInputs {
  assetId: string
  name: string
  code: string
  /** % por ciclo sobre la base USD (default 0 %). */
  pct: number
  cycleLengthMonths: number
  installmentsCount: number
  startMonthKey: string
  baseStatus: RenewalBaseStatus
  /** Sin base USD confiable (y sin Neto USD manual): la fila no se proyecta. */
  projectionBlocked: boolean
  /** Facturas que forman el último período de cobertura. */
  periodInvoiceCount: number
  /** Cuotas/emisiones del último período fuera de su vigencia (= outOfTermItems.length). */
  outOfTermCount: number
  /** Cuáles (comprobante + fecha): las renovaciones proyectadas repiten esas fechas tal cual. */
  outOfTermItems: RenewalTraceItem[]
  /** Facturas del último período cuyo período no se pudo determinar sin ambigüedad. */
  ambiguousPeriodItems: RenewalTraceItem[]
  /** Asignaciones del activo cuyo % no corresponde al importe asignado (se informan, no se corrigen). */
  allocationIssues: AllocationInconsistency[]
  /** Ajustes ya volcados en su factura cuyas cuotas propias no se suman (solo Financiero; informativo). */
  excludedAdjustments: ExcludedAdjustmentItem[]
  /** Coberturas concurrentes con otro plazo que no se suman a la base. */
  concurrentPeriodsExcluded: number
  /** Tiene configuración vigente que "Volver al automático" puede limpiar. */
  isOverridden: boolean
  /** Tiene importes ARS / % anteriores (o su trazabilidad) — histórico protegido. */
  hasLegacy: boolean
  /** Importes ARS anteriores pendientes de una conversión confirmada. */
  legacyPendingFields: LegacyAmountField[]
  override: RenewalProjectionOverride | null
}

export interface ProjectionAssetInput {
  asset: Asset
  realTimeline: Map<string, RealMonthCell>
  cycle: RenewalCycle
  allocationIssues: AllocationInconsistency[]
  excludedAdjustments: ExcludedAdjustmentItem[]
}

/** Activos relevantes: los que alguna vez tuvieron una línea de cobertura (orden alfabético). */
export function relevantProjectionAssets(assets: Asset[], policies: Policy[]): Asset[] {
  const ids = new Set<string>()
  for (const policy of policies) {
    for (const coverage of policy.coverages ?? []) {
      if (coverage.assetId) ids.add(coverage.assetId)
    }
  }
  return assets.filter((a) => ids.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

/** Línea de tiempo real + ciclo por activo (depende solo de los datos, no del horizonte ni de los overrides). */
export function buildProjectionAssetInputs(
  mode: RenewalProjectionMode,
  relevantAssets: Asset[],
  documents: DocumentForFinancial[],
  policies: Policy[],
): ProjectionAssetInput[] {
  const { buildTimeline, detectCycle } = RENEWAL_PROJECTION_BUILDERS[mode]
  return relevantAssets.map((asset) => ({
    asset,
    realTimeline: buildTimeline(asset.id, documents),
    cycle: detectCycle(asset.id, documents, policies),
    allocationIssues: inconsistentAllocationsForAsset(asset.id, documents),
    // Solo Financiero (por cuota) excluye cuotas propias de ajustes ya volcados; Económico no excluye nada.
    excludedAdjustments: mode === 'FINANCIAL' ? excludedAdjustmentsForAsset(asset.id, documents) : [],
  }))
}

/** Filas (base USD efectiva + proyección USD desde `today` hasta `horizonEndMonthKey`). */
export function buildRenewalProjectionRows(
  perAssetData: ProjectionAssetInput[],
  overridesByAssetId: Map<string, RenewalProjectionOverride>,
  today: string,
  horizonEndMonthKey: string,
): RenewalProjectionRowData[] {
  return perAssetData.map(({ asset, realTimeline, cycle, allocationIssues, excludedAdjustments }) => {
    const override = overridesByAssetId.get(asset.id) ?? null
    const base = resolveRowBase(cycle, override)
    // "Cada cuántos meses renueva", "cuántas cuotas" y "en qué mes arranca"
    // son editables SOLO acá — nunca tocan la póliza/documento real, y
    // solo afectan los meses proyectados de la fila.
    const effectiveCycle = resolveEffectiveCycle(
      cycle,
      override?.cycleLengthMonthsOverride ?? null,
      override?.installmentsCountOverride ?? null,
      override?.startMonthOverride ?? null,
    )
    // Sin base USD confiable no se proyecta (ni se inventa una base).
    // Se proyecta por período desde el mes actual: un mes puede tener lo
    // real y lo proyectado a la vez (partes separadas en la matriz).
    const projectedList = base.projectionBlocked
      ? []
      : projectAssetRow(effectiveCycle, today, horizonEndMonthKey, base.netUsd ?? 0, base.vatUsd ?? 0, base.otherUsd ?? 0, base.pct)
    return {
      assetId: asset.id,
      name: asset.name,
      code: `${asset.internalCode} · ${asset.assetType}`,
      realTimeline,
      projectedByMonth: new Map(projectedList.map((c) => [c.monthKey, c])),
      netUsd: base.netUsd,
      vatUsd: base.vatUsd,
      otherUsd: base.otherUsd,
      pct: base.pct,
      cycleLengthMonths: effectiveCycle.cycleLengthMonths,
      installmentsCount: autoInstallmentsCount(effectiveCycle),
      startMonthKey: effectiveCycle.lastRenewalStartMonthKey,
      baseStatus: cycle.baseStatus,
      projectionBlocked: base.projectionBlocked,
      periodInvoiceCount: cycle.periodInvoiceCount,
      outOfTermCount: cycle.outOfTermCount,
      outOfTermItems: cycle.outOfTermItems,
      ambiguousPeriodItems: cycle.ambiguousPeriodItems,
      allocationIssues,
      excludedAdjustments,
      concurrentPeriodsExcluded: cycle.concurrentPeriodsExcluded,
      isOverridden: hasCurrentOverrides(override),
      hasLegacy: hasLegacyValues(override),
      legacyPendingFields: convertibleLegacyFields(override),
      override,
    }
  })
}
