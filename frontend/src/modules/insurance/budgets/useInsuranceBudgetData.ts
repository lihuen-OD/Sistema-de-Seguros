import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { assetQueries } from '../../../shared/api/assets.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { fixedAssetQueries } from '../../../shared/api/fixed-assets.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { renewalProjectionQueries, type RenewalProjectionMode } from '../../../shared/api/renewal-projections.api'
import { insuranceBudgetQueries } from '../../../shared/api/insurance-budgets.api'
import type { BudgetLevel } from '../../../shared/utils/budgetAttribution'
import {
  aggregateRows,
  computeBudgetComparison,
  filterBudgetRows,
  hasActiveFilters,
  syntheticTotals,
  type BudgetRowFilters,
} from '../../../shared/utils/budgetComparisonCalc'
import { reconcileEconomic, reconcileFinancial } from '../../../shared/utils/budgetReconciliation'
import { todayMonthKey } from '../../../shared/utils/renewalProjectionCalc'
import {
  buildProjectionAssetInputs,
  buildRenewalProjectionRows,
  relevantProjectionAssets,
  type RenewalProjectionRowData,
} from '../../../shared/utils/renewalProjectionRows'
import type { RenewalProjectionOverride } from '../../../shared/api/renewal-projections.api'
import type { Asset, Policy } from '../../../shared/types'
import type { DocumentForFinancial } from '../../../shared/api/documents.api'
import { buildBudgetObservations } from './budgetObservations'

// Datos de Análisis → Presupuestos. Usa EXACTAMENTE las mismas queries (y
// query keys) que la Proyección de Renovaciones — historial completo de
// documentos, pólizas con coberturas, activos y overrides — así que comparte
// caché con esas pantallas; lo único propio es la lista de presupuestos del
// nivel (chica). Todo el cálculo es puro (shared/utils/budget*).

function useProjectionRows(
  mode: RenewalProjectionMode,
  enabled: boolean,
  docs: DocumentForFinancial[],
  policies: Policy[],
  relevantAssets: Asset[],
  overrides: RenewalProjectionOverride[],
  today: string,
  horizonEnd: string,
): RenewalProjectionRowData[] {
  const inputs = useMemo(
    () => (enabled ? buildProjectionAssetInputs(mode, relevantAssets, docs, policies) : []),
    [enabled, mode, relevantAssets, docs, policies],
  )
  const overridesByAssetId = useMemo(() => new Map(overrides.map((o) => [o.assetId, o])), [overrides])
  return useMemo(
    () => (enabled ? buildRenewalProjectionRows(inputs, overridesByAssetId, today, horizonEnd) : []),
    [enabled, inputs, overridesByAssetId, today, horizonEnd],
  )
}

export function useInsuranceBudgetData(level: BudgetLevel, from: string, to: string, filters: BudgetRowFilters) {
  const docsQuery = useQuery(documentQueries.financialWithMeta())
  const policiesQuery = useQuery(policyQueries.list({ includeCoverages: true }))
  const assetsQuery = useQuery(assetQueries.list())
  const companiesQuery = useQuery(companyQueries.list())
  const costCentersQuery = useQuery(costCenterQueries.list())
  const fixedAssetsQuery = useQuery(fixedAssetQueries.list())
  const economicOverridesQuery = useQuery(renewalProjectionQueries.overrides('ECONOMIC'))
  const financialOverridesQuery = useQuery(renewalProjectionQueries.overrides('FINANCIAL'))
  const budgetsQuery = useQuery(insuranceBudgetQueries.list(level, from, to))

  const queries = [docsQuery, policiesQuery, assetsQuery, companiesQuery, costCentersQuery, fixedAssetsQuery, economicOverridesQuery, financialOverridesQuery, budgetsQuery]
  const isLoading = queries.some((q) => q.isLoading)
  const isError = queries.some((q) => q.isError)

  const documents = useMemo(() => docsQuery.data?.data ?? [], [docsQuery.data])
  const policies = useMemo(() => policiesQuery.data ?? [], [policiesQuery.data])
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data])
  const companies = useMemo(() => companiesQuery.data ?? [], [companiesQuery.data])
  const costCenters = useMemo(() => costCentersQuery.data ?? [], [costCentersQuery.data])
  const fixedAssets = useMemo(() => fixedAssetsQuery.data ?? [], [fixedAssetsQuery.data])
  const budgets = useMemo(() => budgetsQuery.data ?? [], [budgetsQuery.data])

  // La proyección solo hace falta si el rango llega al mes actual o después
  // (nada se proyecta hacia atrás) — así un rango pasado no paga su costo.
  const today = todayMonthKey()
  const needsProjection = to >= today
  const horizonEnd = needsProjection ? to : today
  const relevantAssets = useMemo(() => relevantProjectionAssets(assets, policies), [assets, policies])
  const economicProjectionRows = useProjectionRows('ECONOMIC', needsProjection, documents, policies, relevantAssets, economicOverridesQuery.data ?? EMPTY, today, horizonEnd)
  const financialProjectionRows = useProjectionRows('FINANCIAL', needsProjection, documents, policies, relevantAssets, financialOverridesQuery.data ?? EMPTY, today, horizonEnd)

  const result = useMemo(
    () =>
      isLoading
        ? null
        : computeBudgetComparison({
            level, from, to, currentMonth: today, documents, policies, assets, companies, costCenters, fixedAssets,
            economicProjectionRows, financialProjectionRows,
            budgets: budgets.filter((b) => b.scopeType === level),
          }),
    [isLoading, level, from, to, today, documents, policies, assets, companies, costCenters, fixedAssets, economicProjectionRows, financialProjectionRows, budgets],
  )

  // La conciliación se calcula siempre (es una pasada más sobre los mismos
  // documentos ya cargados) porque una diferencia sin explicar tiene que
  // aparecer en Observaciones aunque el panel esté cerrado.
  const reconciliations = useMemo(() => {
    if (!result) return []
    const args = { level, from, to, documents, policies, assets, rows: result.rows }
    return [reconcileEconomic(args), reconcileFinancial(args)]
  }, [result, level, from, to, documents, policies, assets])

  const visibleRows = useMemo(() => (result ? filterBudgetRows(result.rows, level, filters, assets) : []), [result, level, filters, assets])
  const visibleTotals = useMemo(() => (result ? aggregateRows(visibleRows, result.months, today) : null), [result, visibleRows, today])
  const unassignedTotals = useMemo(() => (result ? syntheticTotals(result.rows, result.months, today) : null), [result, today])
  const observations = useMemo(() => (result ? buildBudgetObservations(result, reconciliations) : []), [result, reconciliations])

  const budgetByScopeId = useMemo(() => new Map(budgets.filter((b) => b.scopeType === level).map((b) => [b.scopeId, b])), [budgets, level])

  return {
    isLoading,
    isError,
    refetchAll: () => queries.forEach((q) => q.refetch()),
    financialDocsResult: docsQuery.data,
    documents,
    assets,
    companies,
    costCenters,
    fixedAssets,
    budgetByScopeId,
    currentMonth: today,
    result,
    reconciliations,
    visibleRows,
    visibleTotals,
    unassignedTotals,
    filtersApplied: hasActiveFilters(filters),
    observations,
  }
}

const EMPTY: RenewalProjectionOverride[] = []
