import { useMemo, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import clsx from 'clsx'
import { Building2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { DataWarning } from '../../../shared/components/feedback/DataWarning'
import { FinancialDataWarning } from '../../../shared/components/feedback/FinancialDataWarning'
import { assetQueries } from '../../../shared/api/assets.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { claimQueries } from '../../../shared/api/claims.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import {
  computeFleetSummaries,
  computeInsuranceTypeSummaries,
  computeInsurerSummaries,
  computeProductiveUnitSummaries,
  computeFixedAssetSummaries,
  computeCostCenterSummaries,
  buildPolicyExportRows,
  isPolicyIncludedInInsuranceDashboard,
  TERMINAL_CLAIM_STATUSES,
} from '../../../shared/utils/insuranceDashboardCalc'
import { buildInsuranceDashboardScope } from '../../../shared/utils/insuranceDashboardScope'
import { allocationIssueAssetLabels } from '../../../shared/utils/insuredAttribution'
import { coverageAsOfToday } from '../../../shared/utils/coverageInForce'
import type { ClaimEvent } from '../../../shared/types'
import { SingleAssetView } from './SingleAssetView'
import { CompareAssetsView } from './CompareAssetsView'
import { FleetRiskView } from './FleetRiskView'
import { InsurersView } from './InsurersView'
import { ProductiveUnitsView } from './ProductiveUnitsView'
import { FixedAssetsView } from './FixedAssetsView'
import { CostCentersView } from './CostCentersView'
import { InsuranceTypesView } from './InsuranceTypesView'
import { PolicyExportView } from './PolicyExportView'

type Tab = 'single' | 'compare' | 'fleet' | 'productive-units' | 'fixed-assets' | 'cost-centers' | 'insurance-types' | 'insurers' | 'export'

const TABS: { key: Tab; label: string }[] = [
  { key: 'single', label: 'Un activo' },
  { key: 'compare', label: 'Comparar activos' },
  { key: 'fleet', label: 'Riesgo de la flota' },
  { key: 'productive-units', label: 'Unidades productivas' },
  { key: 'fixed-assets', label: 'Bienes de uso' },
  { key: 'cost-centers', label: 'Centros de costo' },
  { key: 'insurance-types', label: 'Tipos de seguro' },
  { key: 'insurers', label: 'Aseguradoras' },
  { key: 'export', label: 'Planilla completa' },
]

export default function InsuranceDashboardPage() {
  const [tab, setTab] = useState<Tab>('single')
  const [filterCompanies, setFilterCompanies] = useState<string[]>([])

  // Fuentes de verdad: los mismos endpoints que ya usan Análisis Financiero/
  // Económico y las fichas de Póliza/Activo — el dashboard no agrega nada del
  // lado del backend, solo compone lo que ya existe (mismo criterio ya
  // documentado para economic_analysis).
  // Todas las páginas de activos, pólizas y siniestros (R4-B): los totales de
  // este dashboard son globales y antes se calculaban sobre los primeros 500
  // de cada uno sin avisar. Ver fetchAllPages (tope explícito + aviso).
  const {
    data: assetList,
    isError: isErrorAssets,
    isLoading: isLoadingAssets,
  } = useQuery(assetQueries.listAll({ isActive: true }))
  // includeCoverages:true — este dashboard agrega por activo/tipo de seguro
  // sobre TODAS las pólizas a la vez, y esa granularidad ahora vive en cada
  // línea de cobertura, no en la póliza (ver insuranceDashboardCalc.ts).
  // Pedirlo acá evita un N+1 de GET /coverages por póliza.
  const {
    data: policyList,
    isError: isErrorPolicies,
    isLoading: isLoadingPolicies,
  } = useQuery(policyQueries.listAll({ includeCoverages: true }))
  const {
    data: claimList,
    isError: isErrorClaims,
    isLoading: isLoadingClaims,
  } = useQuery(claimQueries.listAll())
  const allAssets = useMemo(() => assetList?.rows ?? [], [assetList])
  const allPolicies = useMemo(() => policyList?.rows ?? [], [policyList])
  const allClaims = useMemo(() => claimList?.rows ?? [], [claimList])
  const allocationScope = {
    scopeCompanyIds: filterCompanies.length > 0 ? [...filterCompanies].sort().join(',') : undefined,
  }
  const { data: allocationSummary } = useQuery(policyQueries.statusSummary(allocationScope))
  const allocationIssues = allocationSummary?.insuredBreakdown?.allocationIssues
  const allocationIssueAssetIds = allocationSummary?.insuredBreakdown?.allocationIssueAssetIds
  const underAllocatedAssetLabels = allocationIssueAssetLabels(allocationIssueAssetIds?.underAllocated ?? [], allAssets)
  const overAllocatedAssetLabels = allocationIssueAssetLabels(allocationIssueAssetIds?.overAllocated ?? [], allAssets)
  const hasAllocationIssues = Boolean(
    allocationSummary?.insuredBreakdown?.attributed &&
    ((allocationIssues?.underAllocatedAssets ?? 0) > 0 || (allocationIssues?.overAllocatedAssets ?? 0) > 0),
  )
  const {
    data: financialResult,
    isError: isErrorDocs,
    isLoading: isLoadingDocs,
  } = useQuery(documentQueries.financialWithMeta())
  const financialDocs = useMemo(() => financialResult?.data ?? [], [financialResult])
  const truncatedSources = [
    assetList?.truncated && `activos (${assetList.rows.length} de ${assetList.total})`,
    policyList?.truncated && `pólizas (${policyList.rows.length} de ${policyList.total})`,
    claimList?.truncated && `siniestros (${claimList.rows.length} de ${claimList.total})`,
  ].filter(Boolean)
  const {
    data: documentTypesData,
    isError: isErrorTypes,
    isLoading: isLoadingTypes,
  } = useQuery(documentQueries.types())
  const {
    data: companies = [],
    isError: isErrorCompanies,
    isLoading: isLoadingCompanies,
  } = useQuery(companyQueries.list())
  const {
    data: costCenters = [],
    isError: isErrorCostCenters,
    isLoading: isLoadingCostCenters,
  } = useQuery(costCenterQueries.list())
  const costCentersById = useMemo(() => new Map(costCenters.map((cc) => [cc.id, { id: cc.id, name: cc.name }])), [costCenters])
  const companiesById = useMemo(() => new Map(companies.map((c) => [c.id, { id: c.id, name: c.name }])), [companies])

  const companyOptions = useMemo(
    () =>
      companies
        .map((company) => ({
          value: company.id,
          label: `${company.name}${company.status === 'inactivo' ? ' · Inactiva' : ''}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [companies],
  )

  function handleCompanyFilterChange(companyIds: string[]) {
    // Elegir manualmente todas las empresas equivale a la vista global e
    // incluye también datos históricos que todavía no tienen imputación.
    setFilterCompanies(
      companyOptions.length > 0 && companyIds.length === companyOptions.length
        ? []
        : companyIds,
    )
  }

  const scopedData = useMemo(
    () => buildInsuranceDashboardScope(allAssets, allPolicies, allClaims, filterCompanies),
    [allAssets, allPolicies, allClaims, filterCompanies],
  )
  const { assets, claims, lineShare } = scopedData
  const policies = useMemo(
    () => scopedData.policies.filter(isPolicyIncludedInInsuranceDashboard),
    [scopedData.policies],
  )

  const selectedCompanyNames = useMemo(
    () =>
      companies
        .filter((company) => filterCompanies.includes(company.id))
        .map((company) => company.name),
    [companies, filterCompanies],
  )
  const scopeLabel =
    selectedCompanyNames.length === 0
      ? 'Todas las empresas'
      : selectedCompanyNames.length <= 2
        ? selectedCompanyNames.join(' y ')
        : `${selectedCompanyNames.length} empresas seleccionadas`
  const scopeKey = filterCompanies.length > 0
    ? [...filterCompanies].sort().join('|')
    : 'all'

  const typeDefsByKey = useMemo(
    () => Object.fromEntries((documentTypesData?.types ?? []).map((t) => [t.key, t])),
    [documentTypesData],
  )

  // Día de la cobertura vigente (Argentina) — uno solo para todo el render.
  const coverageToday = coverageAsOfToday()
  const summaries = useMemo(
    () => computeFleetSummaries(assets, policies, claims, financialDocs, typeDefsByKey, coverageToday, lineShare),
    [assets, policies, claims, financialDocs, typeDefsByKey, coverageToday, lineShare],
  )

  // Días de resolución por aseguradora necesita el historial de eventos de
  // cada siniestro — no hay endpoint bulk, así que se piden en paralelo, uno
  // por siniestro (misma query/caché que ya usa ClaimDetailPage), y solo para
  // los que ya llegaron a un estado terminal (los abiertos no aportan acá).
  const terminalClaims = useMemo(
    () => claims.filter((c) => TERMINAL_CLAIM_STATUSES.includes(c.status)),
    [claims],
  )
  const claimEventsQueries = useQueries({
    queries: terminalClaims.map((c) => claimQueries.events(c.id)),
  })
  const claimEventsById = useMemo(() => {
    const map: Record<string, ClaimEvent[]> = {}
    terminalClaims.forEach((c, i) => {
      map[c.id] = claimEventsQueries[i]?.data ?? []
    })
    return map
  }, [terminalClaims, claimEventsQueries])

  const insurerSummaries = useMemo(
    () => computeInsurerSummaries(policies, claims, claimEventsById, financialDocs, typeDefsByKey, coverageToday, lineShare),
    [policies, claims, claimEventsById, financialDocs, typeDefsByKey, coverageToday, lineShare],
  )
  const productiveUnitSummaries = useMemo(
    () => computeProductiveUnitSummaries(assets, policies, financialDocs, typeDefsByKey, coverageToday),
    [assets, policies, financialDocs, typeDefsByKey, coverageToday],
  )
  const fixedAssetSummaries = useMemo(
    () => computeFixedAssetSummaries(assets, policies, financialDocs, typeDefsByKey, coverageToday),
    [assets, policies, financialDocs, typeDefsByKey, coverageToday],
  )
  const costCenterSummaries = useMemo(
    () => computeCostCenterSummaries(assets, policies, financialDocs, typeDefsByKey, costCentersById, coverageToday),
    [assets, policies, financialDocs, typeDefsByKey, costCentersById, coverageToday],
  )
  const exportRows = useMemo(
    () => buildPolicyExportRows(assets, policies, financialDocs, typeDefsByKey, companiesById, costCentersById),
    [assets, policies, financialDocs, typeDefsByKey, companiesById, costCentersById],
  )
  // Datos administrativos (estado visible, renovaciones) por id de póliza para
  // las vistas. Sobre TODAS las pólizas cargadas, no solo las del alcance: la
  // póliza nueva de una renovación puede estar fuera del filtro de empresa.
  const policiesById = useMemo(() => new Map(allPolicies.map((p) => [p.id, p])), [allPolicies])
  const renewedPolicyIds = useMemo(
    () => new Set(policies.filter((p) => p.renewal?.isMarked).map((p) => p.id)),
    [policies],
  )
  const insuranceTypeSummaries = useMemo(
    () => computeInsuranceTypeSummaries(policies, claims, financialDocs, typeDefsByKey, renewedPolicyIds, coverageToday, lineShare),
    [policies, claims, financialDocs, typeDefsByKey, renewedPolicyIds, coverageToday, lineShare],
  )

  const isError =
    isErrorAssets ||
    isErrorPolicies ||
    isErrorClaims ||
    isErrorDocs ||
    isErrorTypes ||
    isErrorCompanies ||
    isErrorCostCenters
  const isLoading =
    isLoadingAssets ||
    isLoadingPolicies ||
    isLoadingClaims ||
    isLoadingDocs ||
    isLoadingTypes ||
    isLoadingCompanies ||
    isLoadingCostCenters

  const activeTabHasData =
    tab === 'productive-units'
      ? productiveUnitSummaries.length > 0
      : tab === 'fixed-assets'
        ? fixedAssetSummaries.length > 0
        : tab === 'cost-centers'
          ? costCenterSummaries.length > 0
          : tab === 'insurance-types'
            ? insuranceTypeSummaries.length > 0
            : tab === 'insurers'
              ? insurerSummaries.length > 0
              : tab === 'export'
                ? exportRows.length > 0
                : summaries.length > 0
  const emptyDescription = filterCompanies.length > 0
    ? 'No hay información de seguros para las empresas seleccionadas en esta vista.'
    : 'No hay información disponible para construir esta vista.'

  if (isError) {
    return (
      <PageContent>
        <ErrorState description="No se pudo cargar el dashboard de seguros." />
      </PageContent>
    )
  }

  return (
    <PageContent>
      <PageHeader
        title="Dashboard de Seguros"
        subtitle="Cuánto se gasta en asegurar cada activo, qué tan cubierto está hoy y cómo se compara contra el resto de la flota"
        category="Seguros"
      />

      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 px-4 py-3 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
            <Building2 size={17} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">Alcance del dashboard</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{scopeLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden lg:inline text-xs text-slate-500">
            {policies.length} pólizas · {assets.length} activos · {claims.length} siniestros
          </span>
          <MultiSelectFilter
            label={filterCompanies.length === 0 ? 'Todas las empresas' : 'Empresas'}
            options={companyOptions}
            value={filterCompanies}
            onChange={handleCompanyFilterChange}
          />
        </div>
      </div>

      {truncatedSources.length > 0 && (
        <DataWarning>
          Datos parciales: se cargaron {truncatedSources.join(', ')}. Los indicadores calculados sobre esas listas no incluyen los registros faltantes.
        </DataWarning>
      )}
      <FinancialDataWarning result={financialResult} />
      {hasAllocationIssues && (
        <DataWarning>
          <strong>Imputaciones para revisar:</strong>{' '}
          {allocationIssues?.underAllocatedAssets ? `${allocationIssues.underAllocatedAssets} activos tienen asignaciones por debajo del 100%${underAllocatedAssetLabels ? `: ${underAllocatedAssetLabels}` : ''}. ` : ''}
          {allocationIssues?.overAllocatedAssets ? `${allocationIssues.overAllocatedAssets} activos superan el 100%${overAllocatedAssetLabels ? `: ${overAllocatedAssetLabels}` : ''}. ` : ''}
          Se mantiene el tope técnico del 100%, sin normalizar ni redistribuir. Los importes atribuidos no son exactos y los filtros individuales o combinados pueden no reconciliar.
          Revisá las asignaciones de esos activos en sus fichas.
        </DataWarning>
      )}

      <div className="flex w-fit max-w-full gap-0.5 p-0.5 bg-slate-100 border border-slate-200 rounded-lg mb-5 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-10 text-center">Cargando dashboard…</p>
      ) : !activeTabHasData ? (
        <div className="bg-white border border-slate-200 rounded-xl">
          <EmptyState title="Sin datos para mostrar" description={emptyDescription} />
        </div>
      ) : (
        <>
          {tab === 'single' && <SingleAssetView key={`single:${scopeKey}`} summaries={summaries} policiesById={policiesById} />}
          {tab === 'compare' && <CompareAssetsView key={`compare:${scopeKey}`} summaries={summaries} policiesById={policiesById} />}
          {tab === 'fleet' && <FleetRiskView key={`fleet:${scopeKey}`} summaries={summaries} policiesById={policiesById} />}
          {tab === 'productive-units' && (
            <ProductiveUnitsView key={`productive-units:${scopeKey}`} summaries={productiveUnitSummaries} />
          )}
          {tab === 'fixed-assets' && (
            <FixedAssetsView key={`fixed-assets:${scopeKey}`} summaries={fixedAssetSummaries} />
          )}
          {tab === 'cost-centers' && (
            <CostCentersView key={`cost-centers:${scopeKey}`} summaries={costCenterSummaries} />
          )}
          {tab === 'insurance-types' && (
            <InsuranceTypesView key={`insurance-types:${scopeKey}`} summaries={insuranceTypeSummaries} />
          )}
          {tab === 'insurers' && <InsurersView key={`insurers:${scopeKey}`} summaries={insurerSummaries} />}
          {tab === 'export' && <PolicyExportView key={`export:${scopeKey}`} rows={exportRows} policiesById={policiesById} />}
        </>
      )}
    </PageContent>
  )
}
