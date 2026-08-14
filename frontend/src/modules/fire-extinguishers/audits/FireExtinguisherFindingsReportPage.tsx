import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, FileDown, Loader2, Building2, ChevronDown, ChevronUp, Gauge, ClipboardCheck, TrendingDown, AlertTriangle } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { AuditorProgressPanel } from '../../../shared/components/audit-dashboard/AuditorProgressPanel'
import { buildAuditDashboardPdf } from '../../../shared/utils/buildAuditDashboardPdf'
import { fireExtinguisherAuditQueries } from '../../../shared/api/fire-extinguisher-audits.api'
import type { AuditControlPointLevel, AuditDashboardSector, AuditDashboard, AuditorProgressReport } from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'
import { currentPeriod } from '../../../shared/utils/period'
import { classifyLevel } from '../../../shared/utils/auditLevel'
import { sectorKey, formatPeriodLabel } from './findingsReportFields'
import { LevelBar } from '../../../shared/components/audit-wizard/LevelBar'

function averageOfLevels(levels: (number | null)[]): number | null {
  const values = levels.filter((v): v is number => v != null)
  if (values.length === 0) return null
  return +(values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)
}

function byLevelAscending<T extends { level: number | null }>(a: T, b: T): number {
  if (a.level == null) return 1
  if (b.level == null) return -1
  return a.level - b.level
}

interface EstablishmentGroup {
  establishment: string
  total: number
  audited: number
  sectors: AuditDashboardSector[]
}

function groupByEstablishment(sectors: AuditDashboardSector[]): EstablishmentGroup[] {
  const map = new Map<string, AuditDashboardSector[]>()
  for (const s of sectors) {
    if (!map.has(s.establishment)) map.set(s.establishment, [])
    map.get(s.establishment)!.push(s)
  }
  return [...map.entries()].map(([establishment, secs]) => ({
    establishment,
    total: secs.reduce((sum, s) => sum + s.total, 0),
    audited: secs.reduce((sum, s) => sum + s.audited, 0),
    sectors: secs,
  }))
}

function PeriodPickerBar({
  period,
  onPeriodChange,
  trailing,
}: {
  period: string
  onPeriodChange: (period: string) => void
  trailing?: React.ReactNode
}) {
  return (
    <SectionCard noPadding className="mb-5">
      <div className="px-5 py-4 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays size={14} className="text-slate-400" />
          <span className="text-xs font-medium text-slate-500">Período</span>
        </div>
        <input
          type="month"
          value={period}
          onChange={(e) => e.target.value && onPeriodChange(e.target.value)}
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
        />
        {trailing}
      </div>
    </SectionCard>
  )
}

export default function FireExtinguisherFindingsReportPage() {
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState(searchParams.get('period') || currentPeriod())

  const { data, isLoading } = useQuery(fireExtinguisherAuditQueries.auditDashboard(period))
  const { data: progress } = useQuery(fireExtinguisherAuditQueries.auditorProgress(period))

  if (!isLoading && data && data.sectors.length > 0) {
    return <FindingsReportBody key={period} period={period} onPeriodChange={setPeriod} data={data} progress={progress} />
  }

  return (
    <PageContent>
      <PageHeader
        title="Informe de auditoría"
        subtitle="Nivel de la auditoría mensual, por establecimiento y sector"
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS_AUDITS}
        backLabel="Volver a Auditorías"
        actions={
          <button
            type="button"
            disabled
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg font-medium"
          >
            <FileDown size={15} />
            Descargar PDF
          </button>
        }
      />

      <PeriodPickerBar period={period} onPeriodChange={setPeriod} />

      {isLoading ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">Cargando informe…</p>
        </SectionCard>
      ) : (
        <SectionCard>
          <EmptyState
            title="Sin datos para este período"
            description="No hay matafuegos activos para mostrar en este período."
          />
        </SectionCard>
      )}
    </PageContent>
  )
}

interface FindingsReportBodyProps {
  period: string
  onPeriodChange: (period: string) => void
  data: AuditDashboard
  progress: AuditorProgressReport | undefined
}

// Con key={period} en el caller — selección y colapso manual del usuario
// sobreviven a cualquier refetch en segundo plano del MISMO período (ej.
// después de auditar un matafuego), y solo se reinician al cambiar de
// período de verdad. Efecto secundario aceptado: un sector nuevo que
// aparezca en un refetch del mismo período ya no se autoselecciona — hay
// que tildarlo a mano.
function FindingsReportBody({ period, onPeriodChange, data, progress }: FindingsReportBodyProps) {
  const [downloading, setDownloading] = useState(false)
  const [collapsedEstablishments, setCollapsedEstablishments] = useState<Set<string>>(
    // Los establecimientos vienen cerrados por defecto — el usuario expande
    // solo los que quiere revisar, en vez de arrancar con todo abierto.
    () => new Set(groupByEstablishment(data.sectors).map((e) => e.establishment)),
  )
  const [selectedSectors, setSelectedSectors] = useState<Set<string>>(
    // Por defecto se seleccionan todos los sectores — descargar sin tocar
    // nada da el informe completo, igual que antes.
    () => new Set(data.sectors.map((s) => sectorKey(s.establishment, s.locationType))),
  )

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

  function toggleEstablishment(est: EstablishmentGroup, checked: boolean) {
    setSelectedSectors((prev) => {
      const next = new Set(prev)
      est.sectors.forEach((s) => {
        const key = sectorKey(s.establishment, s.locationType)
        if (checked) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }

  const establishments = useMemo(() => groupByEstablishment(data.sectors), [data])

  // Todo lo que se ve (KPIs, "Nivel por punto de control") se recalcula a
  // partir de los sectores tildados, no de todos los datos — el PDF exporta
  // exactamente este mismo subconjunto.
  const selectedSectorsFlat = useMemo(
    () => data.sectors.filter((s) => selectedSectors.has(sectorKey(s.establishment, s.locationType))),
    [data, selectedSectors],
  )

  const controlPoints: AuditControlPointLevel[] = useMemo(
    () =>
      data.controlPoints.map((cp) => ({
        key: cp.key,
        label: cp.label,
        level: averageOfLevels(selectedSectorsFlat.map((s) => s.controlPoints.find((c) => c.key === cp.key)?.level ?? null)),
        levelLabel: null,
      })),
    [data, selectedSectorsFlat],
  )

  const sortedControlPoints = [...controlPoints].sort(byLevelAscending)
  const sortedSelectedSectors = [...selectedSectorsFlat].sort(byLevelAscending)
  const lowestSector = sortedSelectedSectors[0]
  const overallLevel = averageOfLevels(selectedSectorsFlat.map((s) => s.level))
  const totalAudited = selectedSectorsFlat.reduce((sum, s) => sum + s.audited, 0)
  const totalRegistered = selectedSectorsFlat.reduce((sum, s) => sum + s.total, 0)
  const pointsBelow50 = controlPoints.filter((c) => c.level != null && c.level < 50).length
  const singleSector = selectedSectorsFlat.length === 1
  const kpiCount = singleSector ? 3 : 4

  async function handleDownload() {
    setDownloading(true)
    try {
      await buildAuditDashboardPdf(period, selectedSectorsFlat)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PageContent>
      <PageHeader
        title="Informe de auditoría"
        subtitle="Nivel de la auditoría mensual, por establecimiento y sector"
        category="Matafuegos"
        backTo={ROUTES.FIRE_EXTINGUISHERS_AUDITS}
        backLabel="Volver a Auditorías"
        actions={
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || selectedCount === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
          >
            {downloading ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
            {downloading ? 'Generando…' : `Descargar PDF${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </button>
        }
      />

      <PeriodPickerBar
        period={period}
        onPeriodChange={onPeriodChange}
        trailing={
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {selectedCount} sector{selectedCount !== 1 ? 'es' : ''} seleccionado{selectedCount !== 1 ? 's' : ''} para el PDF
          </span>
        }
      />

      <div className="space-y-5">
        <div className="px-1">
          <p className="text-xs text-slate-400">Período informado</p>
          <p className="text-lg font-bold text-slate-900">{formatPeriodLabel(period)}</p>
        </div>

        <div className={clsx('grid gap-4', kpiCount === 4 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
          <KpiCard
            icon={Gauge}
            label="Nivel general"
            value={overallLevel != null ? `${overallLevel.toFixed(1)}%` : '—'}
            description={classifyLevel(overallLevel) ?? 'Sin datos'}
            variant={overallLevel != null && overallLevel < 50 ? 'danger' : 'default'}
          />
          <KpiCard
            icon={ClipboardCheck}
            label="Matafuegos auditados"
            value={String(totalAudited)}
            description={`de ${totalRegistered} seleccionados`}
          />
          {!singleSector && lowestSector && (
            <KpiCard
              icon={TrendingDown}
              label="Sector más bajo"
              value={lowestSector.level != null ? `${lowestSector.level.toFixed(1)}%` : '—'}
              description={`${lowestSector.locationType} · ${lowestSector.establishment}`}
              variant={lowestSector.level != null && lowestSector.level < 50 ? 'danger' : 'default'}
            />
          )}
          <KpiCard
            icon={AlertTriangle}
            label="Puntos bajo 50%"
            value={String(pointsBelow50)}
            description="de los 7 controles"
            variant={pointsBelow50 > 0 ? 'danger' : 'default'}
          />
        </div>

        <SectionCard title="Nivel por punto de control">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            {sortedControlPoints.map((cp) => (
              <LevelBar key={cp.key} label={cp.label} level={cp.level} />
            ))}
          </div>
        </SectionCard>

        {progress && progress.auditors.length > 0 && (
          <AuditorProgressPanel
            auditors={progress.auditors}
            subtitle="Matafuegos auditados este período dentro del alcance asignado a cada persona"
          />
        )}

        <div className="space-y-4">
          {establishments.map((est) => (
            <EstablishmentBlock
              key={est.establishment}
              est={est}
              collapsed={collapsedEstablishments.has(est.establishment)}
              onToggleCollapse={() => toggleCollapse(est.establishment)}
              selectedSectors={selectedSectors}
              onToggleSector={toggleSector}
              onToggleEstablishment={(checked) => toggleEstablishment(est, checked)}
            />
          ))}
        </div>
      </div>
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
}: {
  est: EstablishmentGroup
  collapsed: boolean
  onToggleCollapse: () => void
  selectedSectors: Set<string>
  onToggleSector: (key: string) => void
  onToggleEstablishment: (checked: boolean) => void
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)
  const sectorKeys = est.sectors.map((s) => sectorKey(s.establishment, s.locationType))
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
            className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 flex-shrink-0"
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
            const key = sectorKey(sector.establishment, sector.locationType)
            const isSelected = selectedSectors.has(key)
            return (
              <div key={sector.locationType} className={clsx('px-5 py-4', !isSelected && 'opacity-40')}>
                <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSector(key)}
                      className="w-3.5 h-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      title="Incluir este sector en el PDF"
                    />
                    <h3 className="text-sm font-semibold text-slate-700">{sector.locationType}</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">
                      {sector.total} matafuego{sector.total !== 1 ? 's' : ''} · {sector.audited} auditado
                      {sector.audited !== 1 ? 's' : ''}
                    </span>
                    <span
                      className={clsx(
                        'text-sm font-bold tabular-nums',
                        sector.level != null && sector.level < 50 ? 'text-red-600' : 'text-slate-900',
                      )}
                    >
                      {sector.level != null ? `${sector.level.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  {sector.controlPoints.map((cp) => (
                    <LevelBar key={cp.key} label={cp.label} level={cp.level} compact />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
