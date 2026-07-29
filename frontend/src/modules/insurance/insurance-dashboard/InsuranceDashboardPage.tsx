import { useMemo, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import clsx from 'clsx'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { assetQueries } from '../../../shared/api/assets.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { claimQueries } from '../../../shared/api/claims.api'
import { documentQueries } from '../../../shared/api/documents.api'
import { computeFleetSummaries, computeInsurerSummaries, TERMINAL_CLAIM_STATUSES } from '../../../shared/utils/insuranceDashboardCalc'
import type { ClaimEvent } from '../../../shared/types'
import { SingleAssetView } from './SingleAssetView'
import { CompareAssetsView } from './CompareAssetsView'
import { FleetRiskView } from './FleetRiskView'
import { InsurersView } from './InsurersView'

type Tab = 'single' | 'compare' | 'fleet' | 'insurers'

const TABS: { key: Tab; label: string }[] = [
  { key: 'single', label: 'Un activo' },
  { key: 'compare', label: 'Comparar activos' },
  { key: 'fleet', label: 'Riesgo de la flota' },
  { key: 'insurers', label: 'Aseguradoras' },
]

export default function InsuranceDashboardPage() {
  const [tab, setTab] = useState<Tab>('single')

  // Fuentes de verdad: los mismos endpoints que ya usan Análisis Financiero/
  // Económico y las fichas de Póliza/Activo — el dashboard no agrega nada del
  // lado del backend, solo compone lo que ya existe (mismo criterio ya
  // documentado para economic_analysis).
  const { data: assets = [], isError: isErrorAssets } = useQuery(assetQueries.list({ isActive: true, limit: 500 }))
  const { data: policies = [], isError: isErrorPolicies } = useQuery(policyQueries.list({ limit: 500 }))
  const { data: claims = [], isError: isErrorClaims } = useQuery(claimQueries.list({ limit: 500 }))
  const { data: financialDocs = [], isError: isErrorDocs } = useQuery(documentQueries.financial())
  const { data: documentTypesData, isError: isErrorTypes } = useQuery(documentQueries.types())

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

  const isError = isErrorAssets || isErrorPolicies || isErrorClaims || isErrorDocs || isErrorTypes
  const isLoading = !assets.length && !isError

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

      <div className="inline-flex gap-0.5 p-0.5 bg-slate-100 border border-slate-200 rounded-lg mb-5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={clsx(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-colors',
              tab === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400 py-10 text-center">Cargando dashboard…</p>
      ) : tab !== 'insurers' && summaries.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">No hay activos activos para mostrar.</p>
      ) : (
        <>
          {tab === 'single' && <SingleAssetView summaries={summaries} />}
          {tab === 'compare' && <CompareAssetsView summaries={summaries} />}
          {tab === 'fleet' && <FleetRiskView summaries={summaries} />}
          {tab === 'insurers' && <InsurersView summaries={insurerSummaries} />}
        </>
      )}
    </PageContent>
  )
}
