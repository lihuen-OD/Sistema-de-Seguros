import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { PieChart, Pie, Cell } from 'recharts'
import { CalendarDays, FileDown, Loader2, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { buildFindingsReportPdf } from '../../../shared/utils/buildFindingsReportPdf'
import { fireExtinguisherAuditQueries } from '../../../shared/api/fire-extinguisher-audits.api'
import type {
  FireExtinguisherFindingBucket,
  FireExtinguisherFindingsEstablishment,
} from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'
import {
  PRIMARY_FIELDS,
  SECONDARY_FIELDS,
  TIER_COLORS,
  sectorKey,
  formatPeriodLabel,
  type FindingsFieldDef,
} from './findingsReportFields'

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

const EMPTY_BUCKET: FireExtinguisherFindingBucket = { count: 0, items: [] }

export default function FireExtinguisherFindingsReportPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState(searchParams.get('period') || currentPeriod())
  const [downloading, setDownloading] = useState(false)
  const [collapsedEstablishments, setCollapsedEstablishments] = useState<Set<string>>(new Set())
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(new Set())

  const { data, isLoading } = useQuery(fireExtinguisherAuditQueries.findingsReport(period))

  // Cada vez que cambian los datos (nuevo período, refetch), por defecto se
  // seleccionan todos los sectores — descargar sin tocar nada da el informe
  // completo, igual que antes.
  useEffect(() => {
    if (!data) return
    setSelectedSectors(
      new Set(data.establishments.flatMap((est) => est.sectors.map((s) => sectorKey(est.establishment, s.locationType)))),
    )
  }, [data])

  const selectedCount = selectedSectors.size

  function toggleCollapse(establishment: string) {
    setCollapsedEstablishments((prev) => {
      const next = new Set(prev)
      if (next.has(establishment)) next.delete(establishment)
      else next.add(establishment)
      return next
    })
  }

  function toggleSector(key: string) {
    setSelectedSectors((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleEstablishment(est: FireExtinguisherFindingsEstablishment, checked: boolean) {
    setSelectedSectors((prev) => {
      const next = new Set(prev)
      est.sectors.forEach((s) => {
        const key = sectorKey(est.establishment, s.locationType)
        if (checked) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }

  // Solo lo tildado entra al PDF — se arma directo desde los datos (nada de
  // capturar pantalla), así que no hace falta ningún árbol oculto ni ref.
  const selectedEstablishments = useMemo(() => {
    if (!data) return []
    return data.establishments
      .map((est) => ({
        ...est,
        sectors: est.sectors.filter((s) => selectedSectors.has(sectorKey(est.establishment, s.locationType))),
      }))
      .filter((est) => est.sectors.length > 0)
  }, [data, selectedSectors])

  async function handleDownload() {
    setDownloading(true)
    try {
      await buildFindingsReportPdf(period, selectedEstablishments)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PageContent>
      <PageHeader
        title="Informe de auditoría"
        subtitle="Desglose por establecimiento y sector de la auditoría mensual"
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS_AUDITS}
        backLabel="Volver a Auditorías"
        actions={
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || selectedCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
            {downloading ? 'Generando…' : `Descargar PDF${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        }
      />

      <SectionCard noPadding className="mb-5">
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Período</span>
          </div>
          <input
            type="month"
            value={period}
            onChange={(e) => e.target.value && setPeriod(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {data && data.establishments.length > 0 && (
            <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
              {selectedCount} sector{selectedCount !== 1 ? 'es' : ''} seleccionado{selectedCount !== 1 ? 's' : ''} para el PDF
            </span>
          )}
        </div>
      </SectionCard>

      {isLoading ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">Cargando informe…</p>
        </SectionCard>
      ) : !data || data.establishments.length === 0 ? (
        <SectionCard>
          <EmptyState
            title="Sin datos para este período"
            description="No hay matafuegos activos para mostrar en este período."
          />
        </SectionCard>
      ) : (
        <div className="space-y-4">
          <div className="px-1 pb-1">
            <p className="text-xs text-slate-400">Período informado</p>
            <p className="text-lg font-bold text-slate-900">{formatPeriodLabel(period)}</p>
          </div>

          {data.establishments.map((est) => (
            <EstablishmentBlock
              key={est.establishment}
              est={est}
              collapsed={collapsedEstablishments.has(est.establishment)}
              onToggleCollapse={() => toggleCollapse(est.establishment)}
              selectedSectors={selectedSectors}
              onToggleSector={toggleSector}
              onToggleEstablishment={(checked) => toggleEstablishment(est, checked)}
              onCodeClick={(id) => navigate(ROUTES.FIRE_EXTINGUISHERS_DETAIL(id))}
            />
          ))}
        </div>
      )}
    </PageContent>
  )
}

function EstablishmentBlock({
  est,
  collapsed,
  onToggleCollapse,
  selectedSectors,
  onToggleSector,
  onToggleEstablishment,
  onCodeClick,
}: {
  est: FireExtinguisherFindingsEstablishment
  collapsed: boolean
  onToggleCollapse: () => void
  selectedSectors: Set<string>
  onToggleSector: (key: string) => void
  onToggleEstablishment: (checked: boolean) => void
  onCodeClick: (id: string) => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  const sectorKeys = est.sectors.map((s) => sectorKey(est.establishment, s.locationType))
  const allSelected = sectorKeys.length > 0 && sectorKeys.every((k) => selectedSectors.has(k))
  const someSelected = sectorKeys.some((k) => selectedSectors.has(k))

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = someSelected && !allSelected
  }, [someSelected, allSelected])

  return (
    <SectionCard noPadding>
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <input
            ref={checkboxRef}
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleEstablishment(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
            title="Incluir todos los sectores de este establecimiento en el PDF"
          />
          <Building2 size={15} className="text-slate-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-800 truncate">{est.establishment}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
            {est.total} matafuego{est.total !== 1 ? 's' : ''} · {est.audited} auditado{est.audited !== 1 ? 's' : ''} ·{' '}
            {est.total - est.audited} sin auditar
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
            title={collapsed ? 'Mostrar sectores' : 'Ocultar sectores'}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-slate-100">
          {est.sectors.map((sector) => {
            const key = sectorKey(est.establishment, sector.locationType)
            const isSelected = selectedSectors.has(key)
            return (
              <div key={sector.locationType} className={clsx('px-5 py-4', !isSelected && 'opacity-40')}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSector(key)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      title="Incluir este sector en el PDF"
                    />
                    <h3 className="text-sm font-semibold text-slate-700">{sector.locationType}</h3>
                  </div>
                  <span className="text-xs text-slate-400">
                    {sector.total} matafuego{sector.total !== 1 ? 's' : ''} · {sector.audited} auditado
                    {sector.audited !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="space-y-3">
                  {PRIMARY_FIELDS.map((field) => (
                    <PrimaryFieldBlock
                      key={field.key}
                      field={field}
                      breakdown={sector.fields[field.key]}
                      onCodeClick={onCodeClick}
                    />
                  ))}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SECONDARY_FIELDS.map((field) => (
                      <SecondaryFieldBlock key={field.key} field={field} breakdown={sector.fields[field.key]} />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

function PrimaryFieldBlock({
  field,
  breakdown,
  onCodeClick,
}: {
  field: FindingsFieldDef
  breakdown: Record<string, FireExtinguisherFindingBucket>
  onCodeClick: (id: string) => void
}) {
  const chartData = field.tierOrder
    .map((tier, i) => ({
      name: tier,
      value: (breakdown?.[tier] ?? EMPTY_BUCKET).count,
      color: TIER_COLORS[i % TIER_COLORS.length],
    }))
    .filter((d) => d.value > 0)
  const showChart = chartData.length >= 2

  return (
    <div className="border border-slate-200 rounded-lg p-3.5">
      <p className="text-sm font-semibold text-slate-700 mb-2.5">{field.label}</p>
      <div className={clsx('flex gap-4', showChart ? 'items-center' : '')}>
        <div className="flex-1 space-y-2">
          {field.tierOrder.map((tier) => {
            const bucket = breakdown?.[tier] ?? EMPTY_BUCKET
            const isGood = tier === field.goodTier
            const hasIssue = !isGood && bucket.count > 0
            return (
              <div key={tier}>
                <div className="flex items-center justify-between text-xs">
                  <span className={isGood ? 'text-slate-500' : 'text-slate-600 font-medium'}>{tier}</span>
                  <span className={clsx('font-semibold tabular-nums', hasIssue ? 'text-amber-700' : 'text-slate-700')}>
                    {bucket.count}
                  </span>
                </div>
                {hasIssue && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {bucket.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onCodeClick(item.id)
                        }}
                        className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                      >
                        {item.code}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {showChart && (
          <div className="flex-shrink-0">
            <PieChart width={90} height={90}>
              <Pie data={chartData} cx="50%" cy="50%" outerRadius={40} dataKey="value">
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
            </PieChart>
          </div>
        )}
      </div>
    </div>
  )
}

function SecondaryFieldBlock({
  field,
  breakdown,
}: {
  field: FindingsFieldDef
  breakdown: Record<string, FireExtinguisherFindingBucket>
}) {
  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <p className="text-xs font-semibold text-slate-600 mb-1.5">{field.label}</p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {field.tierOrder.map((tier) => {
          const bucket = breakdown?.[tier] ?? EMPTY_BUCKET
          const isGood = tier === field.goodTier
          return (
            <span key={tier} className="text-xs">
              <span className={isGood ? 'text-slate-500' : 'text-slate-600'}>{tier}: </span>
              <span className={clsx('font-semibold tabular-nums', !isGood && bucket.count > 0 ? 'text-amber-700' : 'text-slate-700')}>
                {bucket.count}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
