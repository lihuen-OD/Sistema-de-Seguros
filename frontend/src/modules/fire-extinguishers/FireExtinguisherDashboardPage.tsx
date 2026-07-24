import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Flame, ShieldCheck, ShieldOff, AlertTriangle, CalendarOff, ClipboardCheck, ClipboardList, FileDown, Loader2, Car, Cog } from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { ChartCard } from '../../shared/components/cards/ChartCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatDate } from '../../shared/utils/format'
import { buildFireExtinguisherDashboardPdf } from '../../shared/utils/buildFireExtinguisherDashboardPdf'
import { fireExtinguisherQueries } from '../../shared/api/fire-extinguishers.api'
import { ROUTES } from '../../app/routes'
import { EstablishmentZoneCard } from './EstablishmentZoneCard'
import { VehicleMachineryCoverageBlock } from './VehicleMachineryCoverageBlock'

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function FireExtinguisherDashboardPage() {
  const navigate = useNavigate()
  const [pdfLoading, setPdfLoading] = useState(false)

  const { data, isLoading } = useQuery(fireExtinguisherQueries.dashboardSummary())

  async function handleExportPDF() {
    if (!data) return
    setPdfLoading(true)
    try {
      await buildFireExtinguisherDashboardPdf(data)
    } finally {
      setPdfLoading(false)
    }
  }

  if (isLoading || !data) {
    return (
      <PageContent>
        <p className="text-sm text-slate-400 py-10 text-center">Cargando dashboard…</p>
      </PageContent>
    )
  }

  const statusData = [
    { name: 'Vigentes', value: data.totals.vigente, color: '#10b981' },
    { name: 'Próx. a Vencer', value: data.totals.proximo_vencer, color: '#f59e0b' },
    { name: 'Vencidos', value: data.totals.vencido, color: '#ef4444' },
    { name: 'Sin fecha', value: data.totals.sin_fecha, color: '#94a3b8' },
  ]

  const byTypeData = data.byType.map((t) => ({ name: t.type, value: t.count }))

  return (
    <PageContent>
      <PageHeader
        title="Dashboard de Matafuegos"
        subtitle="Estado del parque, distribución por zona y cobertura de auditoría"
        actions={
          <button
            onClick={handleExportPDF}
            disabled={pdfLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            title="Exportar a PDF"
          >
            {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
            {pdfLoading ? 'Generando…' : 'Descargar PDF'}
          </button>
        }
      />

      <MetricGrid cols={5} className="mb-5">
        <KpiCard label="Total" value={data.totals.total} description="Matafuegos activos" icon={Flame} variant="default" />
        <KpiCard label="Vigentes" value={data.totals.vigente} description="Con carga al día" icon={ShieldCheck} variant="success" />
        <KpiCard label="Próximos a Vencer" value={data.totals.proximo_vencer} description="Vencen en 30 días o menos" icon={AlertTriangle} variant="warning" />
        <KpiCard label="Vencidos" value={data.totals.vencido} description="Requieren recarga inmediata" icon={ShieldOff} variant={data.totals.vencido > 0 ? 'danger' : 'default'} />
        <KpiCard label="Sin Fecha" value={data.totals.sin_fecha} description="Sin vencimiento cargado" icon={CalendarOff} variant={data.totals.sin_fecha > 0 ? 'warning' : 'default'} />
      </MetricGrid>

      <MetricGrid cols={3} className="mb-5">
        <KpiCard
          label="Cobertura de auditoría"
          value={`${data.audits.coveragePercent}%`}
          description={`Período ${data.audits.currentPeriod} · ${data.audits.auditedThisPeriod} de ${data.audits.totalActive}`}
          icon={ClipboardCheck}
          variant="info"
        />
        <KpiCard
          label="Pendientes de revisión"
          value={data.audits.pendingReview}
          description="Auditorías esperando decisión"
          icon={ClipboardList}
          variant={data.audits.pendingReview > 0 ? 'warning' : 'default'}
          onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_AUDITS)}
        />
        <KpiCard
          label="Necesitan corrección"
          value={data.audits.needsCorrection}
          description="Devueltas al auditor"
          icon={AlertTriangle}
          variant={data.audits.needsCorrection > 0 ? 'danger' : 'default'}
          onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_AUDITS)}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        <ChartCard title="Estado del Parque" subtitle="Vigente / próximo / vencido" height={240}>
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={60} paddingAngle={2} dataKey="value">
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4">
              {statusData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-slate-600">
                    {d.name}: <strong>{d.value}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Distribución por Tipo" subtitle="Cantidad de matafuegos" className="lg:col-span-2" height={240}>
          {byTypeData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Sin datos</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTypeData} layout="vertical" margin={{ top: 4, right: 24, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={140} />
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {byTypeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <SectionCard title="Mapa de Establecimientos" subtitle="Vista esquemática — no geográfica" className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.byEstablishment.map((zone) => (
            <EstablishmentZoneCard key={zone.establishment} zone={zone} />
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Cobertura en Vehículos y Maquinaria"
        subtitle="Qué activos tienen matafuego asignado y cuáles no"
        className="mb-5"
      >
        <MetricGrid cols={4} className="mb-5">
          <KpiCard
            label="Vehículos con matafuego"
            value={data.vehicleMachineryCoverage.vehiculos.conMatafuego}
            description={`de ${data.vehicleMachineryCoverage.vehiculos.total} vehículos`}
            icon={Car}
            variant="success"
          />
          <KpiCard
            label="Vehículos sin matafuego"
            value={data.vehicleMachineryCoverage.vehiculos.sinMatafuego}
            description="Requieren asignación"
            icon={ShieldOff}
            variant={data.vehicleMachineryCoverage.vehiculos.sinMatafuego > 0 ? 'danger' : 'default'}
          />
          <KpiCard
            label="Maquinaria con matafuego"
            value={data.vehicleMachineryCoverage.maquinaria.conMatafuego}
            description={`de ${data.vehicleMachineryCoverage.maquinaria.total} unidades`}
            icon={Cog}
            variant="success"
          />
          <KpiCard
            label="Maquinaria sin matafuego"
            value={data.vehicleMachineryCoverage.maquinaria.sinMatafuego}
            description="Requieren asignación"
            icon={ShieldOff}
            variant={data.vehicleMachineryCoverage.maquinaria.sinMatafuego > 0 ? 'danger' : 'default'}
          />
        </MetricGrid>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <VehicleMachineryCoverageBlock
            title="Vehículos"
            icon={Car}
            group={data.vehicleMachineryCoverage.vehiculos}
            onSelectAsset={(assetId) => navigate(ROUTES.ASSETS_DETAIL(assetId))}
          />
          <VehicleMachineryCoverageBlock
            title="Maquinaria"
            icon={Cog}
            group={data.vehicleMachineryCoverage.maquinaria}
            onSelectAsset={(assetId) => navigate(ROUTES.ASSETS_DETAIL(assetId))}
          />
        </div>
      </SectionCard>

      <SectionCard title="Actividad reciente de auditorías" noPadding>
        {data.recentAudits.length === 0 ? (
          <EmptyState title="Sin actividad reciente" description="Todavía no se registraron auditorías." />
        ) : (
          <div className="table-container">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-5 py-3 font-medium">Matafuego</th>
                  <th className="px-5 py-3 font-medium">Período</th>
                  <th className="px-5 py-3 font-medium">Auditor</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAudits.map((audit) => (
                  <tr
                    key={audit.id}
                    onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL(audit.id))}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-slate-800">{audit.extinguisherCode}</td>
                    <td className="px-5 py-3 text-slate-600">{audit.auditPeriod}</td>
                    <td className="px-5 py-3 text-slate-600">{audit.auditedBy}</td>
                    <td className="px-5 py-3 text-slate-500 tabular-nums">{formatDate(audit.createdAt)}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={audit.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </PageContent>
  )
}
