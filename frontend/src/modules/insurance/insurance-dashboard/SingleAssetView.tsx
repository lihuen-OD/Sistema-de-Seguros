import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { DollarSign, ShieldCheck, Receipt, AlertTriangle, CalendarClock, ExternalLink } from 'lucide-react'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { ChartCard } from '../../../shared/components/cards/ChartCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { SearchableSelect } from '../../../shared/components/forms/SearchableSelect'
import { formatCurrencyCompact, formatDate } from '../../../shared/utils/format'
import { ROUTES } from '../../../app/routes'
import type { AssetInsuranceSummary } from '../../../shared/utils/insuranceDashboardCalc'

interface SingleAssetViewProps {
  summaries: AssetInsuranceSummary[]
}

function severityFromCoverage(pct: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (pct == null) return 'default'
  if (pct >= 85) return 'success'
  if (pct >= 70) return 'warning'
  return 'danger'
}

function severityFromLossRatio(pct: number | null): 'success' | 'warning' | 'danger' | 'default' {
  if (pct == null) return 'default'
  if (pct === 0) return 'success'
  if (pct <= 60) return 'default'
  if (pct <= 100) return 'warning'
  return 'danger'
}

export function SingleAssetView({ summaries }: SingleAssetViewProps) {
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(summaries[0]?.assetId ?? '')
  const summary = useMemo(
    () => summaries.find((s) => s.assetId === selectedId) ?? summaries[0],
    [summaries, selectedId],
  )

  const options = useMemo(
    () => summaries.map((s) => ({ value: s.assetId, label: s.name, sublabel: `${s.code} · ${s.assetType}` })),
    [summaries],
  )

  if (!summary) return null

  const maxMonthly = Math.max(...summary.monthlySeries.map((m) => m.totalUsd), 1)

  return (
    <div className="space-y-5">
      <SectionCard>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[260px]">
            <p className="text-xs font-medium text-slate-500 mb-1.5">Activo</p>
            <SearchableSelect
              options={options}
              value={summary.assetId}
              onChange={setSelectedId}
              placeholder="Elegir activo…"
              searchPlaceholder="Buscar por nombre o código…"
            />
          </div>
          <button
            type="button"
            onClick={() => navigate(ROUTES.ASSETS_DETAIL(summary.assetId))}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-600 border border-brand-200 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors"
          >
            <ExternalLink size={14} />
            Ver ficha del activo
          </button>
        </div>
      </SectionCard>

      <MetricGrid cols={4}>
        <KpiCard
          label="Valor patrimonial"
          value={summary.valorRealUsd != null ? formatCurrencyCompact(summary.valorRealUsd, 'USD') : '—'}
          description={summary.valorNuevoUsd != null ? `A nuevo: ${formatCurrencyCompact(summary.valorNuevoUsd, 'USD')}` : 'Sin valor a nuevo cargado'}
          icon={DollarSign}
          variant="default"
        />
        <KpiCard
          label="Suma asegurada"
          value={formatCurrencyCompact(summary.sumaAseguradaUsd, 'USD')}
          description={
            summary.coveragePct == null
              ? 'Sin valuación cargada'
              : summary.sumaAseguradaUsd === 0
                ? 'Sin pólizas activas'
                : `${summary.coveragePct.toFixed(1)}% cubierto sobre valor a nuevo`
          }
          icon={ShieldCheck}
          variant={severityFromCoverage(summary.coveragePct)}
        />
        <KpiCard
          label="Gasto facturado (12m)"
          value={formatCurrencyCompact(summary.facturado12mUsd, 'USD')}
          description={`Histórico total: ${formatCurrencyCompact(summary.facturadoTotalUsd, 'USD')}`}
          icon={Receipt}
          variant="info"
        />
        <KpiCard
          label="Siniestralidad"
          value={summary.claimsCount === 0 ? 'Sin siniestros' : formatCurrencyCompact(summary.claimsCostUsd, 'USD')}
          description={
            summary.claimsCount === 0
              ? 'Sin eventos registrados'
              : `${summary.claimsCount} evento${summary.claimsCount !== 1 ? 's' : ''}` +
                (summary.lossRatioPct != null ? ` · ${summary.lossRatioPct.toFixed(0)}% de la suma asegurada` : '')
          }
          icon={AlertTriangle}
          variant={severityFromLossRatio(summary.lossRatioPct)}
        />
      </MetricGrid>

      {summary.nextExpiration && (
        <div className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl">
          <CalendarClock size={16} className="text-slate-400 flex-shrink-0" />
          <p className="text-sm text-slate-600">
            Próximo vencimiento: <strong className="text-slate-800">{summary.nextExpiration.policyNumber}</strong>
            {' '}({summary.nextExpiration.insuranceCompany}) el {formatDate(summary.nextExpiration.endDate)}
            {' — '}
            <span className={summary.nextExpiration.daysUntil <= 15 ? 'text-red-600 font-medium' : summary.nextExpiration.daysUntil <= 30 ? 'text-amber-600 font-medium' : 'text-slate-500'}>
              {summary.nextExpiration.daysUntil >= 0 ? `en ${summary.nextExpiration.daysUntil} días` : `vencida hace ${Math.abs(summary.nextExpiration.daysUntil)} días`}
            </span>
          </p>
        </div>
      )}

      {summary.hasSharedPolicy && (
        <p className="text-xs text-slate-400 px-1">
          * Este activo tiene al menos una póliza compartida con otros activos — el monto se muestra completo, sin prorratear.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ChartCard title="Gasto facturado por mes" subtitle="Últimos 12 meses, en USD" className="lg:col-span-2" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.monthlySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
                formatter={(v: number) => [formatCurrencyCompact(v, 'USD'), 'Facturado']}
              />
              <Bar dataKey="totalUsd" radius={[4, 4, 0, 0]}>
                {summary.monthlySeries.map((m, i) => (
                  <Cell key={i} fill={m.totalUsd === maxMonthly && maxMonthly > 0 ? '#B08A4E' : '#2C5530'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <SectionCard title="Pólizas" subtitle={`${summary.allPolicies.length} en total`} noPadding>
          {summary.allPolicies.length === 0 ? (
            <EmptyState title="Sin pólizas" description="Este activo no tiene pólizas asociadas." />
          ) : (
            <div className="table-container">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-2.5 font-medium">Compañía</th>
                    <th className="px-4 py-2.5 font-medium">Estado</th>
                    <th className="px-4 py-2.5 font-medium text-right">Facturado</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.allPolicies.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 text-slate-700">
                        {p.insuranceCompany}
                        {p.isShared && <span className="text-slate-400" title="Póliza compartida con otros activos"> ⚭</span>}
                      </td>
                      <td className="px-4 py-2.5"><StatusPill status={p.status} size="sm" /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrencyCompact(p.invoicedTotalUsd, 'USD')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Siniestros" subtitle={`${summary.claimsList.length} registrados`} noPadding>
        {summary.claimsList.length === 0 ? (
          <EmptyState title="Sin siniestros" description="Este activo no tiene siniestros registrados." />
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Fecha</th>
                  <th className="px-4 py-2.5 font-medium">Tipo</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 font-medium text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {summary.claimsList.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums">{formatDate(c.occurrenceDate)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{c.claimType}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.status}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{formatCurrencyCompact(c.costUsd, 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
