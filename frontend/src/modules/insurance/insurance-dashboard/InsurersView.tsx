import { useMemo } from 'react'
import { Building2, ShieldX, Percent, Clock } from 'lucide-react'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { formatCurrencyCompact } from '../../../shared/utils/format'
import type { TableColumn } from '../../../shared/types'
import type { InsurerSummary } from '../../../shared/utils/insuranceDashboardCalc'

interface InsurersViewProps {
  summaries: InsurerSummary[]
}

function pct(v: number | null, digits = 0): string {
  return v == null ? '—' : `${v.toFixed(digits)}%`
}

function rejectionColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v <= 10) return 'text-emerald-600'
  if (v <= 25) return 'text-amber-600'
  return 'text-red-600'
}

function fulfillmentColor(v: number | null): string {
  if (v == null) return 'text-slate-400'
  if (v >= 90) return 'text-emerald-600'
  if (v >= 70) return 'text-amber-600'
  return 'text-red-600'
}

export function InsurersView({ summaries }: InsurersViewProps) {
  const totals = useMemo(() => {
    const primaTotal = summaries.reduce((s, a) => s + a.primaVigenteUsd, 0)
    const decided = summaries.reduce((s, a) => s + a.decidedClaimsCount, 0)
    const rejected = summaries.reduce((s, a) => s + a.rejectedClaimsCount, 0)
    const resDaysSum = summaries.reduce((s, a) => s + a.resolutionDaysSum, 0)
    const resDaysCount = summaries.reduce((s, a) => s + a.resolutionDaysCount, 0)
    return {
      primaTotal,
      rejectionRatePct: decided > 0 ? (rejected / decided) * 100 : null,
      avgResolutionDays: resDaysCount > 0 ? resDaysSum / resDaysCount : null,
    }
  }, [summaries])

  const rejectionRanking = useMemo(
    () => summaries.filter((s) => s.rejectionRatePct != null).sort((a, b) => (b.rejectionRatePct ?? 0) - (a.rejectionRatePct ?? 0)),
    [summaries],
  )
  const resolutionRanking = useMemo(
    () => summaries.filter((s) => s.avgResolutionDays != null).sort((a, b) => (b.avgResolutionDays ?? 0) - (a.avgResolutionDays ?? 0)),
    [summaries],
  )

  if (summaries.length === 0) {
    return <EmptyState title="Sin aseguradoras" description="No hay pólizas ni siniestros con aseguradora asignada." />
  }

  const columns: TableColumn<InsurerSummary>[] = [
    { id: 'insuranceCompany', key: 'insuranceCompany', label: 'Aseguradora', sortable: true, className: 'font-medium text-slate-800' },
    { id: 'activePolicyCount', key: 'activePolicyCount', label: 'Pólizas vigentes', sortable: true, headerClassName: 'text-right', className: 'text-right tabular-nums' },
    { id: 'assetsCoveredCount', key: 'assetsCoveredCount', label: 'Activos cubiertos', sortable: true, headerClassName: 'text-right', className: 'text-right tabular-nums' },
    {
      id: 'primaVigenteUsd', key: 'primaVigenteUsd', label: 'Prima vigente', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => formatCurrencyCompact(v as number, 'USD'),
    },
    {
      id: 'facturadoVigenteUsd', key: 'facturadoVigenteUsd', label: 'Facturado', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => formatCurrencyCompact(v as number, 'USD'),
    },
    { id: 'upcomingExpirations30d', key: 'upcomingExpirations30d', label: 'Vencen ≤30d', sortable: true, headerClassName: 'text-right', className: 'text-right tabular-nums' },
    { id: 'claimsCount', key: 'claimsCount', label: 'Siniestros', sortable: true, headerClassName: 'text-right', className: 'text-right tabular-nums' },
    {
      id: 'resolutionRatePct', key: 'resolutionRatePct', label: '% Liquidado', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => pct(v as number | null),
    },
    {
      id: 'rejectionRatePct', key: 'rejectionRatePct', label: '% Rechazo', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums font-semibold',
      render: (v, row) => <span className={rejectionColor(row.rejectionRatePct)}>{pct(v as number | null)}</span>,
    },
    {
      id: 'fulfillmentPct', key: 'fulfillmentPct', label: '% Cumplimiento pago', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums font-semibold',
      render: (v, row) => <span className={fulfillmentColor(row.fulfillmentPct)}>{pct(v as number | null)}</span>,
    },
    {
      id: 'avgResolutionDays', key: 'avgResolutionDays', label: 'Días prom. resolución', sortable: true,
      headerClassName: 'text-right', className: 'text-right tabular-nums',
      render: (v) => (v == null ? '—' : `${Math.round(v as number)}d`),
    },
  ]

  return (
    <div className="space-y-5">
      <MetricGrid cols={3}>
        <KpiCard
          label="Aseguradoras"
          value={summaries.length}
          description={`Prima vigente total: ${formatCurrencyCompact(totals.primaTotal, 'USD')}`}
          icon={Building2}
          variant="default"
        />
        <KpiCard
          label="% Rechazo global"
          value={pct(totals.rejectionRatePct)}
          description="Sobre siniestros ya decididos (liquidados o rechazados)"
          icon={ShieldX}
          variant={totals.rejectionRatePct == null ? 'default' : totals.rejectionRatePct > 25 ? 'danger' : totals.rejectionRatePct > 10 ? 'warning' : 'success'}
        />
        <KpiCard
          label="Días prom. de resolución"
          value={totals.avgResolutionDays != null ? `${Math.round(totals.avgResolutionDays)}d` : '—'}
          description="Desde la denuncia hasta Liquidado/Rechazado"
          icon={Clock}
          variant="info"
        />
      </MetricGrid>

      <SectionCard title="Comparativa por aseguradora" subtitle="Cartera sobre pólizas vigentes · siniestros sin ese filtro (importa la historia completa)" noPadding>
        <DataTable columns={columns} data={summaries} rowKey="insuranceCompany" />
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SectionCard title="% de rechazo por aseguradora" subtitle="De mayor a menor — sobre siniestros ya decididos">
          {rejectionRanking.length === 0 ? (
            <EmptyState title="Sin datos" description="Todavía no hay siniestros liquidados o rechazados." />
          ) : (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {rejectionRanking.map((s) => (
                <div key={s.insuranceCompany} className="grid grid-cols-[140px_1fr_56px] items-center gap-3">
                  <span className="text-xs font-medium text-slate-600 truncate">{s.insuranceCompany}</span>
                  <span className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.min(100, s.rejectionRatePct ?? 0)}%`,
                        backgroundColor: (s.rejectionRatePct ?? 0) > 25 ? '#C0392B' : (s.rejectionRatePct ?? 0) > 10 ? '#B7791F' : '#0F9D58',
                      }}
                    />
                  </span>
                  <span className="text-xs font-bold text-right tabular-nums text-slate-700">{pct(s.rejectionRatePct)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Tiempo de resolución por aseguradora" subtitle="Días promedio desde la denuncia — de más lenta a más rápida">
          {resolutionRanking.length === 0 ? (
            <EmptyState title="Sin datos" description="Todavía no hay siniestros liquidados, rechazados o cerrados." />
          ) : (
            <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
              {(() => {
                const max = Math.max(...resolutionRanking.map((s) => s.avgResolutionDays ?? 0), 1)
                return resolutionRanking.map((s) => (
                  <div key={s.insuranceCompany} className="grid grid-cols-[140px_1fr_56px] items-center gap-3">
                    <span className="text-xs font-medium text-slate-600 truncate">{s.insuranceCompany}</span>
                    <span className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${((s.avgResolutionDays ?? 0) / max) * 100}%` }} />
                    </span>
                    <span className="text-xs font-bold text-right tabular-nums text-slate-700">{Math.round(s.avgResolutionDays ?? 0)}d</span>
                  </div>
                ))
              })()}
            </div>
          )}
        </SectionCard>
      </div>

      <p className="text-xs text-slate-400 px-1">
        <Percent size={11} className="inline -mt-0.5 mr-1" />
        % Cumplimiento pago = monto liquidado / monto reclamado sobre siniestros ya liquidados — una aseguradora puede "responder" y aun así pagar menos de lo pedido.
      </p>
    </div>
  )
}
