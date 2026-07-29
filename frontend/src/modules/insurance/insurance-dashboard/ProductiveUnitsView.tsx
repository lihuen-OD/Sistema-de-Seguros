import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Factory, Gauge, Layers3, WalletCards } from 'lucide-react'
import { ChartCard } from '../../../shared/components/cards/ChartCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { formatCurrencyCompact } from '../../../shared/utils/format'
import {
  SHARED_PRODUCTIVE_UNIT_LABEL,
  type ProductiveUnitInsuranceSummary,
} from '../../../shared/utils/insuranceDashboardCalc'
import type { TableColumn } from '../../../shared/types'
import { ChartMeasureToggle, type ChartMeasure } from './ChartMeasureToggle'

interface ProductiveUnitsViewProps {
  summaries: ProductiveUnitInsuranceSummary[]
}

function percentage(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`
}

function compactLabel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 21)}…` : value
}

function barColor(kind: ProductiveUnitInsuranceSummary['kind'], index: number): string {
  if (kind === 'shared') return '#d97706'
  if (kind === 'unassigned') return '#94a3b8'
  return index === 0 ? '#1d4ed8' : '#60a5fa'
}

function deviationLabel(value: number | null): string {
  if (value == null) return '—'
  if (Math.abs(value) < 0.05) return 'En promedio'
  return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`
}

export function ProductiveUnitsView({ summaries }: ProductiveUnitsViewProps) {
  const [chartMeasure, setChartMeasure] = useState<ChartMeasure>('amount')

  const metrics = useMemo(() => {
    const totalSpend = summaries.reduce((total, item) => total + item.facturado12mUsd, 0)
    const productiveUnits = summaries.filter((item) => item.kind === 'unit')
    const assetBuckets = summaries.filter((item) => item.kind !== 'shared')
    const totalAssets = assetBuckets.reduce((total, item) => total + item.assetCount, 0)
    const leadingUnit = productiveUnits.find((item) => item.facturado12mUsd > 0) ?? null
    const shared = summaries.find((item) => item.label === SHARED_PRODUCTIVE_UNIT_LABEL) ?? null
    return {
      totalSpend,
      actualUnitsCount: productiveUnits.length,
      totalAssets,
      averagePerAsset: totalAssets > 0 ? totalSpend / totalAssets : 0,
      leadingUnit,
      shared,
    }
  }, [summaries])

  const chartData = [...summaries]
    .filter((item) => chartMeasure === 'count' || item.facturado12mUsd > 0)
    .sort((a, b) =>
      chartMeasure === 'amount'
        ? b.facturado12mUsd - a.facturado12mUsd
        : b.policyCount - a.policyCount || b.assetCount - a.assetCount,
    )
  const hasChartData = chartMeasure === 'amount'
    ? chartData.length > 0
    : chartData.some((item) => item.policyCount > 0)

  const columns: TableColumn<ProductiveUnitInsuranceSummary>[] = [
    {
      id: 'label',
      key: 'label',
      label: 'Unidad productiva',
      sortable: true,
      render: (_, row) => (
        <div className="min-w-0">
          <span className="font-medium text-slate-800">{row.label}</span>
          {row.kind !== 'unit' && (
            <span className={
              'ml-2 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ' +
              (row.kind === 'shared'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-slate-100 text-slate-500')
            }>
              {row.kind === 'shared' ? 'Sin prorratear' : 'Dato pendiente'}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'assetCount',
      key: 'assetCount',
      label: 'Activos',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
    },
    {
      id: 'insuredAssetCount',
      key: 'insuredAssetCount',
      label: 'Con póliza vigente',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (_, row) => `${row.insuredAssetCount} de ${row.assetCount}`,
    },
    {
      id: 'policyCount',
      key: 'policyCount',
      label: 'Pólizas vinculadas',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
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
      id: 'spendPerAssetUsd',
      key: 'spendPerAssetUsd',
      label: 'Gasto / activo',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (value) => formatCurrencyCompact(value as number, 'USD'),
    },
    {
      id: 'deviationFromAveragePct',
      key: 'deviationFromAveragePct',
      label: 'Vs. promedio',
      sortable: true,
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      render: (_, row) => (
        <span className={
          row.deviationFromAveragePct == null
            ? 'text-slate-400'
            : row.deviationFromAveragePct > 20
              ? 'text-amber-700 font-semibold'
              : row.deviationFromAveragePct < -20
                ? 'text-emerald-700 font-semibold'
                : 'text-slate-600'
        }>
          {deviationLabel(row.deviationFromAveragePct)}
        </span>
      ),
    },
  ]

  if (summaries.length === 0) {
    return (
      <EmptyState
        title="Sin unidades productivas"
        description="No hay activos disponibles para construir esta comparación."
      />
    )
  }

  return (
    <div className="space-y-5">
      <MetricGrid cols={4}>
        <KpiCard
          label="Gasto facturado"
          value={formatCurrencyCompact(metrics.totalSpend, 'USD')}
          description="Documentos de los últimos 12 meses vinculados a activos"
          icon={WalletCards}
          variant="info"
        />
        <KpiCard
          label="Unidades productivas"
          value={metrics.actualUnitsCount}
          description={`${metrics.totalAssets} activo${metrics.totalAssets !== 1 ? 's' : ''} analizado${metrics.totalAssets !== 1 ? 's' : ''}`}
          icon={Factory}
        />
        <KpiCard
          label="Mayor gasto directo"
          value={metrics.leadingUnit?.label ?? '—'}
          description={
            metrics.leadingUnit
              ? `${formatCurrencyCompact(metrics.leadingUnit.facturado12mUsd, 'USD')} · ${percentage(metrics.leadingUnit.sharePct)} del total`
              : 'Todavía no hay gasto facturado'
          }
          icon={Gauge}
          variant={metrics.leadingUnit ? 'warning' : 'default'}
        />
        <KpiCard
          label="Gasto promedio por activo"
          value={formatCurrencyCompact(metrics.averagePerAsset, 'USD')}
          description={
            metrics.shared && metrics.shared.facturado12mUsd > 0
              ? `${percentage(metrics.shared.sharePct)} requiere distribución entre unidades`
              : 'Todo el gasto quedó asignado a una unidad'
          }
          icon={Layers3}
          variant={metrics.shared && metrics.shared.facturado12mUsd > 0 ? 'warning' : 'success'}
        />
      </MetricGrid>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ChartCard
          title={
            chartMeasure === 'amount'
              ? 'Gasto de seguros por unidad productiva'
              : 'Cantidad de pólizas por unidad productiva'
          }
          subtitle={
            chartMeasure === 'amount'
              ? 'Facturado en los últimos 12 meses · USD · sin duplicar pólizas compartidas'
              : 'Vigentes, próximas a vencer y vencidas · excluye pólizas dadas de baja'
          }
          actions={<ChartMeasureToggle value={chartMeasure} onChange={setChartMeasure} />}
          className="xl:col-span-2"
          height={Math.max(290, chartData.length * 44 + 70)}
        >
          {!hasChartData ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-slate-400">
                {chartMeasure === 'amount'
                  ? 'No hay documentos facturados en los últimos 12 meses.'
                  : 'No hay pólizas vinculadas a unidades productivas.'}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: chartMeasure === 'count' ? 40 : 24, left: 8, bottom: 4 }}
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
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  width={150}
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  tickFormatter={compactLabel}
                />
                <Tooltip
                  formatter={(value: number) => [
                    chartMeasure === 'amount'
                      ? formatCurrencyCompact(value, 'USD')
                      : `${value} póliza${value !== 1 ? 's' : ''}`,
                    chartMeasure === 'amount' ? 'Gasto 12 meses' : 'Pólizas vinculadas',
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
                />
                <Bar
                  dataKey={chartMeasure === 'amount' ? 'facturado12mUsd' : 'policyCount'}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={22}
                >
                  {chartData.map((item, index) => (
                    <Cell key={item.id} fill={barColor(item.kind, index)} />
                  ))}
                  {chartMeasure === 'count' && (
                    <LabelList
                      dataKey="policyCount"
                      position="right"
                      fill="#64748b"
                      fontSize={11}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <SectionCard
          title="Lectura comparativa"
          subtitle="Cómo interpretar las diferencias entre unidades"
        >
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Concentración</p>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                {metrics.leadingUnit
                  ? <><strong className="text-slate-900">{metrics.leadingUnit.label}</strong> concentra {percentage(metrics.leadingUnit.sharePct)} del gasto total.</>
                  : 'Todavía no hay gasto suficiente para comparar.'}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Comparación justa</p>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                “Gasto / activo” permite comparar unidades de distinto tamaño. “Vs. promedio” muestra cuánto se aleja cada una del promedio general.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pólizas compartidas</p>
              <p className="mt-1 text-sm text-slate-700 leading-relaxed">
                {metrics.shared && metrics.shared.facturado12mUsd > 0
                  ? <>Hay {formatCurrencyCompact(metrics.shared.facturado12mUsd, 'USD')} sin prorratear porque cubre activos de unidades diferentes.</>
                  : 'No hay gasto compartido pendiente de distribución entre unidades.'}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Comparación detallada"
        subtitle="Ordená cualquier columna para detectar concentración, cobertura y desvíos"
        noPadding
      >
        <DataTable
          tableKey="insurance-dashboard-productive-units"
          columns={columns}
          data={summaries}
          rowKey="id"
          minWidth={980}
          emptyTitle="Sin datos"
          emptyDescription="No hay unidades productivas para comparar."
        />
      </SectionCard>
    </div>
  )
}
