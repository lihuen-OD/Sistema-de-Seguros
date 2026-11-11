import { useState } from 'react'
import { CalendarClock, Eye, EyeOff, FileSpreadsheet, History, RotateCcw, TrendingUp, AlertTriangle } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { FinancialDataWarning } from '../../../shared/components/feedback/FinancialDataWarning'
import { DataWarning } from '../../../shared/components/feedback/DataWarning'
import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import { hasExcludedNative } from '../../../shared/utils/renewalProjectionCalc'
import type { Currency } from '../../../shared/types'
import { RenewalProjectionTable } from './RenewalProjectionTable'
import { RenewalHorizonPicker } from './RenewalHorizonPicker'
import { RenewalFieldSelectorPopover } from './RenewalFieldSelectorPopover'
import { RenewalLegacyOverridesModal } from './RenewalLegacyOverridesModal'
import type { useRenewalProjectionData } from './useRenewalProjectionData'
import { formatNativeAmounts } from './renewalProjectionFormat'

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

// Lista corta de nombres para un aviso: los primeros N y "y N más".
function nameList(names: string[], max = 5): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} y ${names.length - max} más`
}

export function RenewalProjectionLayout({
  title,
  subtitle,
  tableSubtitle,
  legend,
  exportFilenamePrefix,
  showInstallmentsColumn,
  isError,
  financialDocsResult,
  currency, setCurrency,
  horizonYears, setHorizonYears,
  customEnd, setCustomEnd,
  breakdownFields, toggleBreakdownField,
  hideAssetPanel, setHideAssetPanel,
  manualRateInput, setManualRateInput,
  projectionRate,
  overridesVersion,
  rows,
  matrix,
  rowTotals,
  axis,
  lastRealMonthKey,
  maxMonthKey,
  horizonEndMonthKey,
  kpis,
  warnings,
  isConvertingLegacy,
  handleCommitField,
  handleResetRow,
  handleResetAll,
  handleConvertLegacy,
  handleExportExcel,
  filteredAbsurdDates,
}: RenewalProjectionLayoutProps) {
  const [legacyAssetId, setLegacyAssetId] = useState<string | null>(null)
  const legacyRow = legacyAssetId ? rows.find((r) => r.assetId === legacyAssetId) ?? null : null

  if (isError) return <PageContent><ErrorState /></PageContent>

  const projectedTotals = kpis.projected
  const projectedIncomplete = projectedTotals.incomplete
  const projectedLabel = `Proyectado a ${customEnd ? horizonEndMonthKey : `${horizonYears} año${horizonYears > 1 ? 's' : ''}`}`
  const projectedValue = kpis.projectedAvailable
    ? `${formatCurrencyCompact(projectedTotals.total, currency)}${projectedIncomplete ? '*' : ''}`
    : 'Sin TC'
  const projectedDescription = !kpis.projectedAvailable
    ? 'Ingresá un tipo de cambio (ARS por USD) para ver la proyección en ARS'
    : projectedIncomplete
      ? `Incompleto${hasExcludedNative(projectedTotals.excludedNative) ? ` — excluye ${formatNativeAmounts(projectedTotals.excludedNative)}` : ''}`
      : `${formatCurrencyFull(projectedTotals.total, currency)}${currency === 'ARS' ? ' · base USD × TC ingresado' : ''}`

  return (
    <PageContent>
      <PageHeader title={title} subtitle={subtitle} />
      <FinancialDataWarning result={financialDocsResult} />

      {filteredAbsurdDates > 0 && (
        <div className="mb-4 flex items-start gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Se ignoraron {filteredAbsurdDates} registro{filteredAbsurdDates !== 1 ? 's' : ''} con fechas fuera de rango esperado (mayor a {new Date().getFullYear() + 10}). Los datos históricos normales no se afectaron.
          </span>
        </div>
      )}

      {currency === 'ARS' && projectionRate === null && (
        <DataWarning>
          <strong>{manualRateInput.trim() === '' ? 'Sin TC para la proyección en ARS.' : 'El TC ingresado no es válido (tiene que ser mayor a 0).'}</strong>{' '}
          La proyección se calcula en USD: ingresá un tipo de cambio (ARS por USD) para verla en pesos. Mientras tanto
          los importes futuros se muestran como «Sin TC». Los importes reales conservan su valor histórico registrado.
        </DataWarning>
      )}

      {warnings.blockedAssets.length > 0 && (
        <DataWarning>
          <strong>
            {warnings.blockedAssets.length} activo{warnings.blockedAssets.length !== 1 ? 's' : ''} sin proyección:
          </strong>{' '}
          su última renovación no tiene un tipo de cambio histórico confiable ({nameList(warnings.blockedAssets)}). Sus
          importes reales se conservan; para proyectarlos, cambiá a USD y cargá el Neto de la renovación.
        </DataWarning>
      )}

      {kpis.incompleteRealCells > 0 && (
        <DataWarning>
          <strong>
            {kpis.incompleteRealCells} celda{kpis.incompleteRealCells !== 1 ? 's' : ''} real{kpis.incompleteRealCells !== 1 ? 'es' : ''} con importes
            sin tipo de cambio histórico confiable en {currency}:
          </strong>{' '}
          se muestran en su moneda original y no se suman. Los totales marcados con * están incompletos.
        </DataWarning>
      )}

      {warnings.legacyPendingAssets.length > 0 && (
        <DataWarning>
          <strong>
            {warnings.legacyPendingAssets.length} activo{warnings.legacyPendingAssets.length !== 1 ? 's' : ''} con valores anteriores en ARS:
          </strong>{' '}
          {nameList(warnings.legacyPendingAssets)}. Se conservan sin cambios pero no se aplican a la proyección en USD —
          revisalos con «ARS anterior · revisar».
        </DataWarning>
      )}

      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label={projectedLabel}
          value={projectedValue}
          description={projectedDescription}
          icon={TrendingUp}
          variant={!kpis.projectedAvailable || projectedIncomplete ? 'warning' : 'info'}
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

        {currency === 'ARS' && (
          <>
            <div className="w-px h-5 bg-slate-200 hidden sm:block" />
            <label className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">TC proyección</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={manualRateInput}
                onChange={(e) => setManualRateInput(e.target.value)}
                placeholder="ARS por USD"
                aria-invalid={manualRateInput.trim() !== '' && projectionRate === null}
                title="Solo convierte a ARS los importes futuros (proyectados). No se guarda y no cambia el tipo de cambio del sistema. Los importes reales usan su valor histórico registrado."
                className={`w-32 text-right text-xs border rounded-lg px-2 py-1.5 tabular-nums focus:outline-none focus:ring-1 ${
                  manualRateInput.trim() !== '' && projectionRate === null
                    ? 'border-red-300 bg-red-50/50 focus:ring-red-400 focus:border-red-400'
                    : 'border-slate-200 focus:ring-brand-400 focus:border-brand-400'
                }`}
              />
            </label>
          </>
        )}

        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Proyectar</span>
          <RenewalHorizonPicker
            horizonYears={horizonYears}
            customEndMonthKey={customEnd}
            lastRealMonthKey={lastRealMonthKey}
            maxMonthKey={maxMonthKey}
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 border-b border-slate-100">
          {legend.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${item.colorClass}`} />
              {item.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" />
            Sin TC confiable (moneda original, no se suma)
          </span>
          <span className="text-xs text-slate-400">
            Real: TC histórico de cada documento · Proyectado: base USD{currency === 'ARS' ? ' × TC ingresado' : ''} · * = total incompleto
          </span>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            Ningún activo tiene todavía una línea de cobertura en una póliza.
          </div>
        ) : (
          <RenewalProjectionTable
            rows={rows}
            matrix={matrix}
            rowTotals={rowTotals}
            axis={axis}
            lastRealMonthKey={lastRealMonthKey}
            currency={currency}
            projectionRate={projectionRate}
            breakdownFields={breakdownFields}
            hideAssetPanel={hideAssetPanel}
            showInstallmentsColumn={showInstallmentsColumn}
            overridesVersion={overridesVersion}
            onCommitField={handleCommitField}
            onResetRow={handleResetRow}
            onOpenLegacy={setLegacyAssetId}
          />
        )}
      </SectionCard>

      {legacyRow && (
        <RenewalLegacyOverridesModal
          row={legacyRow}
          modeLabel={title}
          isConverting={isConvertingLegacy}
          onConfirm={(expectedRate, fields) => handleConvertLegacy(legacyRow.assetId, expectedRate, fields)}
          onClose={() => setLegacyAssetId(null)}
        />
      )}
    </PageContent>
  )
}
