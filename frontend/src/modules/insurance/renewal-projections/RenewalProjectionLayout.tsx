import { CalendarClock, Eye, EyeOff, FileSpreadsheet, History, RotateCcw, TrendingUp } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import type { Currency } from '../../../shared/types'
import { RenewalProjectionTable } from './RenewalProjectionTable'
import { RenewalHorizonPicker } from './RenewalHorizonPicker'
import { RenewalFieldSelectorPopover } from './RenewalFieldSelectorPopover'
import type { useRenewalProjectionData } from './useRenewalProjectionData'

interface LegendItem {
  label: string
  colorClass: string
}

interface RenewalProjectionLayoutProps extends ReturnType<typeof useRenewalProjectionData> {
  title: string
  subtitle: string
  tableSubtitle: string
  legend: LegendItem[]
  exportFilenamePrefix: string
  showInstallmentsColumn: boolean
}

export function RenewalProjectionLayout({
  title,
  subtitle,
  tableSubtitle,
  legend,
  exportFilenamePrefix,
  showInstallmentsColumn,
  isError,
  currency, setCurrency,
  horizonYears, setHorizonYears,
  customEnd, setCustomEnd,
  breakdownFields, toggleBreakdownField,
  hideAssetPanel, setHideAssetPanel,
  exchangeRate,
  overridesVersion,
  rows,
  axis,
  lastRealMonthKey,
  horizonEndMonthKey,
  kpis,
  projectedDisplay,
  handleCommitField,
  handleResetRow,
  handleResetAll,
  handleExportExcel,
}: RenewalProjectionLayoutProps) {
  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader title={title} subtitle={subtitle} />

      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label={`Proyectado a ${customEnd ? horizonEndMonthKey : `${horizonYears} año${horizonYears > 1 ? 's' : ''}`}`}
          value={formatCurrencyCompact(projectedDisplay, currency)}
          description={formatCurrencyFull(projectedDisplay, currency)}
          icon={TrendingUp}
          variant="info"
        />
        <KpiCard
          label="Activos con historial real"
          value={kpis.withHistory}
          description="Tienen al menos un documento real para basar la proyección"
          icon={History}
          variant="success"
        />
        <KpiCard
          label="Sin historial real"
          value={kpis.withoutHistory}
          description="Proyección en continuidad simple hasta que se edite a mano"
          icon={CalendarClock}
          variant={kpis.withoutHistory > 0 ? 'warning' : 'default'}
        />
      </MetricGrid>

      {/* Controles — separados del header de la tarjeta para que el título nunca se aplaste */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Moneda</span>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['ARS', 'USD'] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  currency === c ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Proyectar</span>
          <RenewalHorizonPicker
            horizonYears={horizonYears}
            customEndMonthKey={customEnd}
            lastRealMonthKey={lastRealMonthKey}
            onSelectPreset={(years) => {
              setHorizonYears(years)
              setCustomEnd(null)
            }}
            onSelectCustomEnd={setCustomEnd}
          />
        </div>

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        <RenewalFieldSelectorPopover selected={breakdownFields} onToggle={toggleBreakdownField} />

        <button
          onClick={() => setHideAssetPanel((v) => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            hideAssetPanel ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {hideAssetPanel ? <Eye size={13} /> : <EyeOff size={13} />}
          {hideAssetPanel ? 'Mostrar datos del activo' : 'Ocultar datos del activo'}
        </button>
      </div>

      <SectionCard
        title="Matriz de renovaciones — real + proyectada"
        subtitle={tableSubtitle}
        noPadding
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={handleResetAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
            >
              <RotateCcw size={13} />
              Volver todo al automático
            </button>
            <button
              onClick={() => handleExportExcel(exportFilenamePrefix)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <FileSpreadsheet size={13} />
              Exportar a Excel
            </button>
          </div>
        }
      >
        <div className="flex items-center gap-4 px-5 py-2.5 border-b border-slate-100">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${item.colorClass}`} />
              {item.label}
            </span>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Ningún activo tiene todavía una línea de cobertura en una póliza.
          </div>
        ) : (
          <RenewalProjectionTable
            rows={rows}
            axis={axis}
            lastRealMonthKey={lastRealMonthKey}
            currency={currency}
            exchangeRate={exchangeRate}
            breakdownFields={breakdownFields}
            hideAssetPanel={hideAssetPanel}
            showInstallmentsColumn={showInstallmentsColumn}
            overridesVersion={overridesVersion}
            onCommitField={handleCommitField}
            onResetRow={handleResetRow}
          />
        )}
      </SectionCard>
    </PageContent>
  )
}
