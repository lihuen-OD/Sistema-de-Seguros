import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, Gauge, ClipboardCheck, AlertTriangle, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { AuditorProgressPanel } from '../../shared/components/audit-dashboard/AuditorProgressPanel'
import { assetAuditQueries, type AssetAuditDashboardGroup } from '../../shared/api/asset-audits.api'
import { CATEGORY_LABEL, AUDITABLE_CATEGORY_GROUPS } from '../../shared/constants/asset-categories'
import type { AssetCategory } from '../../shared/types'
import { ROUTES } from '../../app/routes'
import { currentPeriod } from '../../shared/utils/period'
import { classifyLevel } from '../../shared/utils/auditLevel'
import { LevelBar } from '../../shared/components/audit-wizard/LevelBar'

const CATEGORY_ICON = Object.fromEntries(
  AUDITABLE_CATEGORY_GROUPS.flatMap((g) => g.items).map((item) => [item.key, item.icon]),
) as Record<string, typeof Package>

export default function AssetAuditDashboardPage() {
  const [searchParams] = useSearchParams()
  const [period, setPeriod] = useState(searchParams.get('period') || currentPeriod())
  const { data, isLoading } = useQuery(assetAuditQueries.auditDashboard(period))
  const { data: progress } = useQuery(assetAuditQueries.auditorProgress(period))

  const pointsBelow50 = data ? data.controlPoints.filter((c) => c.level != null && c.level < 50).length : 0

  return (
    <PageContent>
      <PageHeader
        title="Informe de Auditoría de Rodados"
        subtitle="Nivel de la auditoría mensual de matafuegos montados en vehículos y maquinaria, por categoría"
        category="Auditoría de Rodados"
        backTo={ROUTES.ASSET_AUDITS}
        backLabel="Volver a Auditorías"
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
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
      </SectionCard>

      {isLoading ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">Cargando informe…</p>
        </SectionCard>
      ) : !data || data.totalRegistered === 0 ? (
        <SectionCard>
          <EmptyState title="Sin datos para este período" description="No hay matafuegos de vehículos/maquinaria para mostrar en este período." />
        </SectionCard>
      ) : (
        <div className="space-y-5">
          <MetricGrid cols={3}>
            <KpiCard
              icon={Gauge}
              label="Nivel general"
              value={data.overallLevel != null ? `${data.overallLevel.toFixed(1)}%` : '—'}
              description={classifyLevel(data.overallLevel) ?? 'Sin datos'}
              variant={data.overallLevel != null && data.overallLevel < 50 ? 'danger' : 'default'}
            />
            <KpiCard
              icon={ClipboardCheck}
              label="Matafuegos auditados"
              value={String(data.totalAudited)}
              description={`de ${data.totalRegistered} en alcance`}
            />
            <KpiCard
              icon={AlertTriangle}
              label="Puntos bajo 50%"
              value={String(pointsBelow50)}
              description="de los 7 controles"
              variant={pointsBelow50 > 0 ? 'danger' : 'default'}
            />
          </MetricGrid>

          <SectionCard title="Nivel por punto de control">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
              {data.controlPoints.map((cp) => (
                <LevelBar key={cp.key} label={cp.label} level={cp.level} />
              ))}
            </div>
          </SectionCard>

          {progress && progress.auditors.length > 0 && (
            <AuditorProgressPanel
              auditors={progress.auditors}
              subtitle="Matafuegos auditados este período dentro de las categorías asignadas a cada persona"
            />
          )}

          <CategoryBreakdown key={period} groups={data.groups} />
        </div>
      )}
    </PageContent>
  )
}

// Recibe key={period} del padre — se remonta entero al cambiar de período,
// así que collapsedCategories puede inicializarse directo desde los datos
// sin useEffect (categorías cerradas por defecto en cada período nuevo).
function CategoryBreakdown({ groups }: { groups: AssetAuditDashboardGroup[] }) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set(groups.map((g) => g.category)),
  )

  function toggleCollapse(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const collapsed = collapsedCategories.has(group.category)
        const Icon = CATEGORY_ICON[group.category] ?? Package
        return (
          <SectionCard key={group.category} noPadding>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleCollapse(group.category)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(group.category) } }}
              className="px-5 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors flex items-center justify-between gap-3 flex-wrap"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Icon size={15} className="text-slate-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800 truncate">
                  {CATEGORY_LABEL[group.category as AssetCategory] ?? group.category}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                  {group.total} matafuego{group.total !== 1 ? 's' : ''} · {group.audited} auditado{group.audited !== 1 ? 's' : ''}
                </span>
                <span className={clsx('text-sm font-bold tabular-nums', group.level != null && group.level < 50 ? 'text-red-600' : 'text-slate-900')}>
                  {group.level != null ? `${group.level.toFixed(1)}%` : '—'}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(group.category) }}
                  className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                  title={collapsed ? 'Mostrar detalle' : 'Ocultar detalle'}
                >
                  {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </button>
              </div>
            </div>

            {!collapsed && (
              <div className="px-5 py-4 space-y-2">
                {group.controlPoints.map((cp) => (
                  <LevelBar key={cp.key} label={cp.label} level={cp.level} compact />
                ))}
              </div>
            )}
          </SectionCard>
        )
      })}
    </div>
  )
}
