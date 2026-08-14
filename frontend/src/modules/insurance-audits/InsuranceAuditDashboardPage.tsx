import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Gauge, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { AuditorProgressPanel } from '../../shared/components/audit-dashboard/AuditorProgressPanel'
import { insuranceAuditQueries } from '../../shared/api/insurance-audits.api'
import { CATEGORY_LABEL } from '../../shared/constants/asset-categories'
import type { AssetCategory } from '../../shared/types'
import { ROUTES } from '../../app/routes'
import { currentPeriod } from '../../shared/utils/period'
import { LevelBar } from '../../shared/components/audit-wizard/LevelBar'

export default function InsuranceAuditDashboardPage() {
  const [period, setPeriod] = useState(currentPeriod())
  const { data, isLoading } = useQuery(insuranceAuditQueries.auditDashboard(period))
  const { data: progress } = useQuery(insuranceAuditQueries.auditorProgress(period))

  return (
    <PageContent>
      <PageHeader
        title="Dashboard de Auditoría de Seguros"
        subtitle="Cobertura de la auditoría mensual, por categoría"
        category="Auditoría de Seguros"
        backTo={ROUTES.INSURANCE_AUDITS}
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
          <p className="text-sm text-slate-400 text-center py-8">Cargando dashboard…</p>
        </SectionCard>
      ) : !data || data.totalRegistered === 0 ? (
        <SectionCard>
          <EmptyState title="Sin activos para mostrar" description="No hay activos habilitados para auditoría en este período." />
        </SectionCard>
      ) : (
        <div className="space-y-5">
          <MetricGrid cols={3}>
            <KpiCard
              icon={Gauge}
              label="Cobertura general"
              value={data.percentAudited != null ? `${data.percentAudited}%` : '—'}
              description={`${data.totalAudited} de ${data.totalRegistered} activos`}
              variant={data.percentAudited != null && data.percentAudited < 50 ? 'danger' : 'default'}
            />
            <KpiCard icon={ClipboardCheck} label="Activos auditados" value={String(data.totalAudited)} description={`de ${data.totalRegistered} habilitados`} />
            <KpiCard icon={AlertTriangle} label="Pendientes" value={String(data.totalPending)} description="sin auditar este período" variant={data.totalPending > 0 ? 'warning' : 'default'} />
          </MetricGrid>

          <SectionCard title="Cobertura por categoría">
            <div className="space-y-2.5">
              {data.categories.map((c) => (
                <LevelBar
                  key={c.category}
                  label={CATEGORY_LABEL[c.category as AssetCategory] ?? c.category}
                  level={c.percentAudited}
                />
              ))}
            </div>
          </SectionCard>

          {progress && progress.auditors.length > 0 && (
            <AuditorProgressPanel
              auditors={progress.auditors}
              subtitle="Activos auditados este período dentro de las categorías asignadas a cada persona"
            />
          )}
        </div>
      )}
    </PageContent>
  )
}
