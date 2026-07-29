import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Sigma, ShieldAlert, CalendarClock, Percent } from 'lucide-react'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { formatCurrencyCompact, formatDate } from '../../../shared/utils/format'
import { ROUTES } from '../../../app/routes'
import { CATEGORY_GROUPS } from '../../../shared/constants/asset-categories'
import type { AssetInsuranceSummary } from '../../../shared/utils/insuranceDashboardCalc'

interface FleetRiskViewProps {
  summaries: AssetInsuranceSummary[]
}

const UNDER_INSURED_THRESHOLD = 80
const ALL_GROUPS = CATEGORY_GROUPS.map((g) => g.label)

function severityColor(pct: number): string {
  if (pct >= 85) return '#0F9D58'
  if (pct >= 70) return '#B7791F'
  return '#C0392B'
}

export function FleetRiskView({ summaries }: FleetRiskViewProps) {
  const navigate = useNavigate()

  // Solo se ofrecen como pestaña los grupos que realmente tienen algún activo
  // en la flota — evitar mostrar "Producción animal" vacío si nunca se cargó
  // hacienda, por ejemplo.
  const availableGroups = useMemo(
    () => ALL_GROUPS.filter((g) => summaries.some((s) => s.group === g)),
    [summaries],
  )
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const scoped = useMemo(
    () => (selectedGroup ? summaries.filter((s) => s.group === selectedGroup) : summaries),
    [summaries, selectedGroup],
  )

  const totals = useMemo(() => {
    const primaTotal = scoped.reduce((s, a) => s + a.sumaAseguradaUsd, 0)
    const claimsTotal = scoped.reduce((s, a) => s + a.claimsCostUsd, 0)
    const underInsured = scoped.filter((a) => a.coveragePct != null && a.coveragePct < UNDER_INSURED_THRESHOLD).length
    const uninsured = scoped.filter((a) => a.sumaAseguradaUsd === 0).length
    const soon = scoped.filter((a) => a.nextExpiration != null && a.nextExpiration.daysUntil >= 0 && a.nextExpiration.daysUntil <= 30).length
    const globalLossRatio = primaTotal > 0 ? (claimsTotal / primaTotal) * 100 : null
    return { primaTotal, claimsTotal, underInsured, uninsured, soon, globalLossRatio }
  }, [scoped])

  const ranking = useMemo(() => {
    const withCoverage = scoped.filter((a) => a.coveragePct != null)
    const withoutCoverage = scoped.filter((a) => a.coveragePct == null)
    withCoverage.sort((a, b) => (a.coveragePct as number) - (b.coveragePct as number))
    return [...withCoverage, ...withoutCoverage]
  }, [scoped])

  const expirations = useMemo(
    () =>
      scoped
        .filter((a) => a.nextExpiration != null)
        .sort((a, b) => a.nextExpiration!.daysUntil - b.nextExpiration!.daysUntil),
    [scoped],
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedGroup(null)}
          className={clsx(
            'px-3.5 py-1.5 text-sm font-medium rounded-lg border transition-colors',
            selectedGroup === null ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
          )}
        >
          Todas ({summaries.length})
        </button>
        {availableGroups.map((g) => {
          const count = summaries.filter((s) => s.group === g).length
          return (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGroup(g)}
              className={clsx(
                'px-3.5 py-1.5 text-sm font-medium rounded-lg border transition-colors',
                selectedGroup === g ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300',
              )}
            >
              {g} ({count})
            </button>
          )
        })}
      </div>

      <MetricGrid cols={4}>
        <KpiCard
          label="Prima total"
          value={formatCurrencyCompact(totals.primaTotal, 'USD')}
          description={`${scoped.length} activo${scoped.length !== 1 ? 's' : ''}${selectedGroup ? ` en ${selectedGroup}` : ''}`}
          icon={Sigma}
          variant="default"
        />
        <KpiCard
          label="Activos sub-asegurados"
          value={`${totals.underInsured} de ${scoped.length}`}
          description={`Cobertura < ${UNDER_INSURED_THRESHOLD}%${totals.uninsured > 0 ? ` · ${totals.uninsured} sin ninguna póliza` : ''}`}
          icon={ShieldAlert}
          variant={totals.underInsured > 0 ? 'danger' : 'success'}
        />
        <KpiCard
          label="Vencen en 30 días"
          value={totals.soon}
          description="Pólizas activas que requieren renovación pronto"
          icon={CalendarClock}
          variant={totals.soon > 0 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Siniestralidad"
          value={totals.globalLossRatio != null ? `${totals.globalLossRatio.toFixed(0)}%` : '—'}
          description="Siniestros pagados sobre prima total"
          icon={Percent}
          variant={totals.globalLossRatio == null ? 'default' : totals.globalLossRatio > 60 ? 'warning' : 'default'}
        />
      </MetricGrid>

      {scoped.length === 0 ? (
        <EmptyState title="Sin activos" description="No hay activos en esta categoría." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard
            title="Cobertura por activo — de menor a mayor"
            subtitle={`Suma asegurada / valor a nuevo. Por debajo del ${UNDER_INSURED_THRESHOLD}% queda en zona de riesgo.`}
          >
            <div className="space-y-0.5 max-h-[420px] overflow-y-auto pr-1">
              {ranking.map((a) => (
                <button
                  key={a.assetId}
                  type="button"
                  onClick={() => navigate(ROUTES.ASSETS_DETAIL(a.assetId))}
                  className="w-full grid grid-cols-[1fr_90px] items-center gap-3 py-2 text-left hover:bg-slate-50/60 rounded-lg px-1.5 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">{a.name}</span>
                    <span className="block text-[11px] text-slate-400 truncate mb-1">{a.assetType}</span>
                    <span className="block h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, a.coveragePct ?? 0)}%`,
                          backgroundColor: a.coveragePct == null ? '#cbd5e1' : severityColor(a.coveragePct),
                        }}
                      />
                    </span>
                  </span>
                  <span
                    className="text-sm font-bold text-right tabular-nums"
                    style={{ color: a.coveragePct == null ? '#94a3b8' : severityColor(a.coveragePct) }}
                  >
                    {a.coveragePct == null ? 'Sin datos' : `${a.coveragePct.toFixed(0)}%`}
                  </span>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Próximos vencimientos" subtitle="Pólizas activas de esta selección, ordenadas por urgencia" noPadding>
            {expirations.length === 0 ? (
              <EmptyState title="Sin pólizas activas" description="Ningún activo de esta categoría tiene una póliza vigente con vencimiento." />
            ) : (
              <div className="table-container max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-2.5 font-medium">Activo</th>
                      <th className="px-4 py-2.5 font-medium">Compañía</th>
                      <th className="px-4 py-2.5 font-medium text-right">Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expirations.map((a) => {
                      const exp = a.nextExpiration!
                      const urgent = exp.daysUntil <= 15
                      const soon = exp.daysUntil <= 30
                      return (
                        <tr
                          key={a.assetId}
                          onClick={() => navigate(ROUTES.ASSETS_DETAIL(a.assetId))}
                          className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer transition-colors"
                        >
                          <td className="px-4 py-2.5 font-medium text-slate-800">{a.name}</td>
                          <td className="px-4 py-2.5 text-slate-500">{exp.insuranceCompany}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span
                              className={
                                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ' +
                                (urgent
                                  ? 'bg-red-50 text-red-700'
                                  : soon
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-emerald-50 text-emerald-700')
                              }
                            >
                              {formatDate(exp.endDate)} · {exp.daysUntil}d
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </div>
      )}
    </div>
  )
}
