import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarClock, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react'
import { ChartCard } from '../../../shared/components/cards/ChartCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { formatCurrencyCompact } from '../../../shared/utils/format'
import type { InsuranceTypeSummary } from '../../../shared/utils/insuranceDashboardCalc'
import type { TableColumn } from '../../../shared/types'
import { ChartMeasureToggle, type ChartMeasure } from './ChartMeasureToggle'

interface InsuranceTypesViewProps {
  summaries: InsuranceTypeSummary[]
}

function percentage(value: number): string {
  return `${value.toFixed(1)}%`
}

function compactLabel(value: string): string {
  return value.length > 18 ? `${value.slice(0, 17)}…` : value
}

export function InsuranceTypesView({ summaries }: InsuranceTypesViewProps) {
  const [chartMeasure, setChartMeasure] = useState<ChartMeasure>('amount')

  const metrics = useMemo(() => {
    const totalSpend = summaries.reduce((total, item) => total + item.facturado12mUsd, 0)
    const activeTypes = summaries.filter((item) => item.activePolicyCount > 0)
    const leadingType = summaries.find((item) => item.facturado12mUsd > 0) ?? null
    return {
      totalSpend,
      activeTypesCount: activeTypes.length,
      leadingType,
      upcomingExpirations30d: summaries.reduce((total, item) => total + item.upcomingExpirations30d, 0),
      policiesWithoutAssets: summaries.reduce((total, item) => total + item.policiesWithoutAssetsCount, 0),
      activeTypesWithoutSpend: activeTypes.filter((item) => item.facturado12mUsd === 0),
    }
  }, [summaries])

  const chartData = [...summaries]
    .filter((item) => chartMeasure === 'count' || item.facturado12mUsd > 0)
    .sort((a, b) =>
      chartMeasure === 'amount'
        ? b.facturado12mUsd - a.facturado12mUsd
        : b.totalPolicyCount - a.totalPolicyCount ||
          b.activePolicyCount - a.activePolicyCount,
    )
  const hasChartData = chartMeasure === 'amount'
    ? chartData.length > 0
    : chartData.some((item) => item.totalPolicyCount > 0)
  const expirationAlerts = summaries
    .filter((item) => item.upcomingExpirations30d > 0)
    .sort((a, b) => b.upcomingExpirations30d - a.upcomingExpirations30d)

  const columns: TableColumn<InsuranceTypeSummary>[] = [
    {
      id: 'insuranceType',
      key: 'insuranceType',
      label: 'Tipo de seguro',
      sortable: true,
      className: 'font-medium text-slate-800',
    },
    {
      id: 'activePolicyCount',
      key: 'activePolicyCount',
      label: 'Vigentes / total',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (_, row) => `${row.activePolicyCount} / ${row.totalPolicyCount}`,
    },
    {
      id: 'assetsCoveredCount',
      key: 'assetsCoveredCount',
      label: 'Activos cubiertos',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
    },
    {
      id: 'activePremiumUsd',
      key: 'activePremiumUsd',
      label: 'Prima vigente',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (value) => formatCurrencyCompact(value as number, 'USD'),
    },
    {
      id: 'facturado12mUsd',
      key: 'facturado12mUsd',
      label: 'Gasto 12 meses',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums font-semibold text-slate-800',
      render: (value) => formatCurrencyCompact(value as number, 'USD'),
    },
    {
      id: 'sharePct',
      key: 'sharePct',
      label: 'Participación',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (value) => percentage(value as number),
    },
    {
      id: 'averageSpendPerPolicyUsd',
      key: 'averageSpendPerPolicyUsd',
      label: 'Gasto / póliza',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (value) => formatCurrencyCompact(value as number, 'USD'),
    },
    {
      id: 'upcomingExpirations30d',
      key: 'upcomingExpirations30d',
      label: 'Vencen ≤30d',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (value) => (
        <span className={(value as number) > 0 ? 'text-amber-700 font-semibold' : 'text-slate-500'}>
          {String(value)}
        </span>
      ),
    },
    {
      id: 'claims12mCount',
      key: 'claims12mCount',
      label: 'Siniestros 12m',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
    },
    {
      id: 'settledClaims12mUsd',
      key: 'settledClaims12mUsd',
      label: 'Liquidado 12m',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (value) => formatCurrencyCompact(value as number, 'USD'),
    },
  ]

  if (summaries.length === 0) {
    return (
      <EmptyState
        title="Sin tipos de seguro"
        description="No hay pólizas disponibles para construir esta comparación."
      />
    )
  }

  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <KpiCard
          label="Tipos con cobertura vigente"
          value={metrics.activeTypesCount}
          description={`${summaries.length} tipo${summaries.length !== 1 ? 's' : ''} con historial de pólizas`}
          icon={ShieldCheck}
          variant="success"
        />
        <KpiCard
          label="Gasto facturado"
          value={formatCurrencyCompact(metrics.totalSpend, 'USD')}
          description="Documentos netos vinculados durante los últimos 12 meses"
          icon={WalletCards}
          variant="info"
        />
        <KpiCard
          label="Mayor concentración"
          value={metrics.leadingType?.insuranceType ?? '—'}
          description={
            metrics.leadingType
              ? `${formatCurrencyCompact(metrics.leadingType.facturado12mUsd, 'USD')} · ${percentage(metrics.leadingType.sharePct)} del total`
              : 'Todavía no hay gasto facturado'
          }
          icon={TrendingUp}
          variant={metrics.leadingType ? 'warning' : 'default'}
        />
        <KpiCard
          label="Vencimientos próximos"
          value={metrics.upcomingExpirations30d}
          description="Pólizas vigentes que vencen dentro de 30 días"
          icon={CalendarClock}
          variant={metrics.upcomingExpirations30d > 0 ? 'warning' : 'success'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ChartCard
          title={
            chartMeasure === 'amount'
              ? 'Gasto por tipo de seguro'
              : 'Cantidad de pólizas por tipo de seguro'
          }
          subtitle={
            chartMeasure === 'amount'
              ? 'Facturación neta de los últimos 12 meses · USD'
              : 'Vigentes incluye próximas a vencer · total excluye las dadas de baja'
          }
          actions={<ChartMeasureToggle value={chartMeasure} onChange={setChartMeasure} />}
          className="xl:col-span-2"
          height={Math.max(290, chartData.length * 44 + 70)}
        >
          {!hasChartData ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-slate-400">
                {chartMeasure === 'amount'
                  ? 'No hay gasto facturado en los últimos 12 meses.'
                  : 'No hay pólizas disponibles para comparar.'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 24, left: 4, bottom: 4 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  allowDecimals={chartMeasure === 'amount'}
                  tickFormatter={(value) =>
                    chartMeasure === 'amount'
                      ? formatCurrencyCompact(value, 'USD')
                      : String(Math.round(value))
                  }
                />
                <YAxis
                  type="category"
                  dataKey="insuranceType"
                  axisLine={false}
                  tickLine={false}
                  width={124}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={compactLabel}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    chartMeasure === 'amount'
                      ? formatCurrencyCompact(value, 'USD')
                      : `${value} póliza${value !== 1 ? 's' : ''}`,
                    name,
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
                />
                {chartMeasure === 'amount' ? (
                  <Bar
                    dataKey="facturado12mUsd"
                    name="Gasto 12 meses"
                    radius={[0, 4, 4, 0]}
                    maxBarSize={22}
                  >
                    {chartData.map((item, index) => (
                      <Cell key={item.id} fill={index === 0 ? '#1d4ed8' : '#60a5fa'} />
                    ))}
                  </Bar>
                ) : (
                  <>
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: 11 }}
                    />
                    <Bar
                      dataKey="totalPolicyCount"
                      name="Pólizas totales"
                      fill="#93c5fd"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={16}
                    />
                    <Bar
                      dataKey="activePolicyCount"
                      name="Pólizas vigentes"
                      fill="#1d4ed8"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={16}
                    />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <SectionCard
          title="Alertas para gestionar"
          subtitle="Datos que requieren revisión operativa"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">Vencimientos en 30 días</span>
                <span className={
                  'text-sm font-bold tabular-nums ' +
                  (metrics.upcomingExpirations30d > 0 ? 'text-amber-700' : 'text-emerald-700')
                }>
                  {metrics.upcomingExpirations30d}
                </span>
              </div>
              {expirationAlerts.length > 0 && (
                <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                  {expirationAlerts.slice(0, 3).map((item) => (
                    `${item.insuranceType} (${item.upcomingExpirations30d})`
                  )).join(' · ')}
                </p>
              )}
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">Pólizas vigentes sin activos</span>
                <span className="text-sm font-bold text-slate-800 tabular-nums">{metrics.policiesWithoutAssets}</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                Pueden ser seguros generales válidos; conviene confirmar que la ausencia de activos sea intencional.
              </p>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-600">Tipos vigentes sin gasto 12m</span>
                <span className={
                  'text-sm font-bold tabular-nums ' +
                  (metrics.activeTypesWithoutSpend.length > 0 ? 'text-amber-700' : 'text-emerald-700')
                }>
                  {metrics.activeTypesWithoutSpend.length}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
                {metrics.activeTypesWithoutSpend.length > 0
                  ? metrics.activeTypesWithoutSpend.slice(0, 3).map((item) => item.insuranceType).join(' · ')
                  : 'Todos los tipos vigentes tienen documentos registrados.'}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Comparación detallada por tipo"
        subtitle="Cartera, gasto, vencimientos y siniestros recientes en una sola lectura"
        noPadding
      >
        <DataTable
          tableKey="insurance-dashboard-insurance-types"
          columns={columns}
          data={summaries}
          rowKey="id"
          minWidth={1220}
          emptyTitle="Sin datos"
          emptyDescription="No hay tipos de seguro disponibles para comparar."
        />
      </SectionCard>
    </div>
  )
}
