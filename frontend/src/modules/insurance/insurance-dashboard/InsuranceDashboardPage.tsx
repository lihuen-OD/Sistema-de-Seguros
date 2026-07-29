import { useMemo, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import clsx from 'clsx'
import { Building2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { assetQueries } from '../../../shared/api/assets.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { claimQueries } from '../../../shared/api/claims.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { companyQueries } from '../../../shared/api/companies.api'
import {
  computeFleetSummaries,
  computeInsuranceTypeSummaries,
  computeInsurerSummaries,
  computeProductiveUnitSummaries,
  isPolicyIncludedInInsuranceDashboard,
  TERMINAL_CLAIM_STATUSES,
} from '../../../shared/utils/insuranceDashboardCalc'
import { buildInsuranceDashboardScope } from '../../../shared/utils/insuranceDashboardScope'
import type { ClaimEvent } from '../../../shared/types'
import { SingleAssetView } from './SingleAssetView'
import { CompareAssetsView } from './CompareAssetsView'
import { FleetRiskView } from './FleetRiskView'
import { InsurersView } from './InsurersView'
import { ProductiveUnitsView } from './ProductiveUnitsView'
import { InsuranceTypesView } from './InsuranceTypesView'

type Tab = 'single' | 'compare' | 'fleet' | 'productive-units' | 'insurance-types' | 'insurers'

const TABS: { key: Tab; label: string }[] = [
  { key: 'single', label: 'Un activo' },
  { key: 'compare', label: 'Comparar activos' },
  { key: 'fleet', label: 'Riesgo de la flota' },
  { key: 'productive-units', label: 'Unidades productivas' },
  { key: 'insurance-types', label: 'Tipos de seguro' },
  { key: 'insurers', label: 'Aseguradoras' },
]

export default function InsuranceDashboardPage() {
  const [tab, setTab] = useState<Tab>('single')
  const [filterCompanies, setFilterCompanies] = useState<string[]>([])

  // Fuentes de verdad: los mismos endpoints que ya usan Análisis Financiero/
  // Económico y las fichas de Póliza/Activo — el dashboard no agrega nada del
  // lado del backend, solo compone lo que ya existe (mismo criterio ya
  // documentado para economic_analysis).
  const {
    data: allAssets = [],
    isError: isErrorAssets,
    isLoading: isLoadingAssets,
  } = useQuery(assetQueries.list({ isActive: true, limit: 500 }))
  const {
    data: allPolicies = [],
    isError: isErrorPolicies,
    isLoading: isLoadingPolicies,
  } = useQuery(policyQueries.list({ limit: 500 }))
  const {
    data: allClaims = [],
    isError: isErrorClaims,
    isLoading: isLoadingClaims,
  } = useQuery(claimQueries.list({ limit: 500 }))
  const {
    data: financialDocs = [],
    isError: isErrorDocs,
    isLoading: isLoadingDocs,
  } = useQuery(documentQueries.financial())
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
  const { assets, claims } = scopedData
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

  const summaries = useMemo(
    () => computeFleetSummaries(assets, policies, claims, financialDocs, typeDefsByKey),
    [assets, policies, claims, financialDocs, typeDefsByKey],
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
    () => computeInsurerSummaries(policies, claims, claimEventsById, financialDocs, typeDefsByKey),
    [policies, claims, claimEventsById, financialDocs, typeDefsByKey],
  )
  const productiveUnitSummaries = useMemo(
    () => computeProductiveUnitSummaries(assets, policies, financialDocs, typeDefsByKey),
    [assets, policies, financialDocs, typeDefsByKey],
  )
  const insuranceTypeSummaries = useMemo(
    () => computeInsuranceTypeSummaries(policies, claims, financialDocs, typeDefsByKey),
    [policies, claims, financialDocs, typeDefsByKey],
  )

  const isError =
    isErrorAssets ||
    isErrorPolicies ||
    isErrorClaims ||
    isErrorDocs ||
    isErrorTypes ||
    isErrorCompanies
  const isLoading =
    isLoadingAssets ||
    isLoadingPolicies ||
    isLoadingClaims ||
    isLoadingDocs ||
    isLoadingTypes ||
    isLoadingCompanies

  const activeTabHasData =
    tab === 'productive-units'
      ? productiveUnitSummaries.length > 0
      : tab === 'insurance-types'
        ? insuranceTypeSummaries.length > 0
        : tab === 'insurers'
          ? insurerSummaries.length > 0
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
          {tab === 'single' && <SingleAssetView key={`single:${scopeKey}`} summaries={summaries} />}
          {tab === 'compare' && <CompareAssetsView key={`compare:${scopeKey}`} summaries={summaries} />}
          {tab === 'fleet' && <FleetRiskView key={`fleet:${scopeKey}`} summaries={summaries} />}
          {tab === 'productive-units' && (
            <ProductiveUnitsView key={`productive-units:${scopeKey}`} summaries={productiveUnitSummaries} />
          )}
          {tab === 'insurance-types' && (
            <InsuranceTypesView key={`insurance-types:${scopeKey}`} summaries={insuranceTypeSummaries} />
          )}
          {tab === 'insurers' && <InsurersView key={`insurers:${scopeKey}`} summaries={insurerSummaries} />}
        </>
      )}
    </PageContent>
  )
}
