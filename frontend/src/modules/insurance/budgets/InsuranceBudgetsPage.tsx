import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CircleHelp, FileSpreadsheet, Info, PiggyBank, Plus, Scale, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { LoadingState } from '../../../shared/components/empty-states/LoadingState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { DataWarning } from '../../../shared/components/feedback/DataWarning'
import { FinancialDataWarning } from '../../../shared/components/feedback/FinancialDataWarning'
import { ObservationsPanel } from '../../../shared/components/feedback/ObservationsPanel'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import { hasModule } from '../../../app/auth/roleScope'
import { downloadXLSX } from '../../../shared/utils/export'
import {
  BUDGET_LEVELS,
  levelAffectedByCurrentAllocations,
  type BudgetLevel,
} from '../../../shared/utils/budgetAttribution'
import {
  deviationEstimateOrNull,
  deviationRealOrNull,
  type BudgetRow,
  type BudgetRowFilters,
} from '../../../shared/utils/budgetComparisonCalc'
import { monthsBetweenKeys, todayMonthKey } from '../../../shared/utils/renewalProjectionCalc'
import { BudgetComparisonTable } from './BudgetComparisonTable'
import { BudgetCostChart } from './BudgetCharts'
import { BudgetFundsSection } from './BudgetFundsSection'
import { BudgetReconciliationPanel } from './BudgetReconciliationPanel'
import { BudgetEditorModal } from './BudgetEditorModal'
import { BudgetHistoryModal } from './BudgetHistoryModal'
import { buildBudgetExport } from './budgetExport'
import {
  HISTORICAL_ALLOCATION_WARNING,
  LEVEL_LABELS,
  LEVEL_PLURAL,
  RECONCILIATION_NOTE,
  percentLabel,
  usd,
  usdCompact,
  usdMarked,
} from './budgetFormat'
import { useInsuranceBudgetData } from './useInsuranceBudgetData'

// Análisis → Presupuestos de Seguros (plan A–J rev. 2). Un nivel por vez
// (Empresa / Centro de costo / Bien de uso / Activo, nunca sumados), rango
// libre de meses, presupuesto USD vs. Real económico, Proyección y Estimado
// de cierre; el Real financiero va como referencia de fondos y en su propia
// sección. Todo cálculo vive en shared/utils/budget* (puro y testeado).

const MAX_RANGE_MONTHS = 60
const EMPTY_FILTERS: BudgetRowFilters = { entityIds: [], companyIds: [], costCenterIds: [], fixedAssetIds: [] }

function rangePresets(today: string) {
  const [y, m] = today.split('-').map(Number)
  const fiscalStart = m >= 7 ? y : y - 1
  return [
    { label: `Ejercicio ${fiscalStart}/${String(fiscalStart + 1).slice(2)}`, from: `${fiscalStart}-07`, to: `${fiscalStart + 1}-06` },
    { label: `Año ${y + 1}`, from: `${y + 1}-01`, to: `${y + 1}-12` },
  ]
}

const LEVEL_HELP =
  'Cada nivel tiene su propio presupuesto y nunca se suma con otro: una empresa, sus centros de costo y sus activos se comparan por separado. En Empresa y Centro de costo cada activo se reparte según el % de sus asignaciones.'

export default function InsuranceBudgetsPage() {
  const { user } = useCurrentUser()
  const canEdit = hasModule(user, 'insurance_budgets_edit')
  const today = todayMonthKey()
  const presets = useMemo(() => rangePresets(today), [today])

  const [level, setLevel] = useState<BudgetLevel>('COMPANY')
  // Por defecto el año calendario en curso (el selector de rango ya ofrece «Este año»).
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01`)
  const [to, setTo] = useState(`${today.slice(0, 4)}-12`)
  const [filters, setFilters] = useState<BudgetRowFilters>(EMPTY_FILTERS)
  const [editor, setEditor] = useState<{ scope: { id: string; label: string } | null } | null>(null)
  const [history, setHistory] = useState<{ budgetId: string; label: string } | null>(null)

  const data = useInsuranceBudgetData(level, from, to, filters)
  const { result, visibleRows, visibleTotals } = data
  const levelTotalsReady = !!result

  function changeLevel(next: BudgetLevel) {
    setLevel(next)
    // Los filtros son entidades del nivel anterior: se limpian en el mismo evento (sin efectos).
    setFilters(EMPTY_FILTERS)
  }

  function changeRange(nextFrom: string, nextTo: string) {
    if (!nextFrom || !nextTo || nextFrom > nextTo) {
      toast.error('El mes final no puede ser anterior al inicial')
      return
    }
    if (monthsBetweenKeys(nextFrom, nextTo) + 1 > MAX_RANGE_MONTHS) {
      toast.error(`El rango no puede superar ${MAX_RANGE_MONTHS} meses`)
      return
    }
    setFrom(nextFrom)
    setTo(nextTo)
  }

  // ── Opciones de filtros y del alta ──
  const entityOptions = useMemo(() => {
    switch (level) {
      case 'COMPANY': return data.companies.map((c) => ({ value: c.id, label: c.name }))
      case 'COST_CENTER': return data.costCenters.map((c) => ({ value: c.id, label: c.code ? `${c.code} · ${c.name}` : c.name }))
      case 'FIXED_ASSET': return data.fixedAssets.map((f) => ({ value: f.id, label: f.code ? `${f.code} · ${f.name}` : f.name }))
      case 'ASSET': return data.assets.map((a) => ({ value: a.id, label: `${a.internalCode} · ${a.name}` }))
    }
  }, [level, data.companies, data.costCenters, data.fixedAssets, data.assets])

  // Alta: entidades ACTIVAS del nivel que todavía no tienen línea (una por alcance).
  const newScopeOptions = useMemo(() => {
    const active = (() => {
      switch (level) {
        case 'COMPANY': return data.companies.filter((c) => c.status === 'activo').map((c) => c.id)
        case 'COST_CENTER': return data.costCenters.filter((c) => c.status === 'activo').map((c) => c.id)
        case 'FIXED_ASSET': return data.fixedAssets.filter((f) => f.status === 'activo').map((f) => f.id)
        case 'ASSET': return data.assets.filter((a) => a.status !== 'baja' && a.status !== 'vendido').map((a) => a.id)
      }
    })()
    const activeSet = new Set(active)
    return entityOptions.filter((o) => activeSet.has(o.value) && !data.budgetByScopeId.has(o.value))
  }, [level, data.companies, data.costCenters, data.fixedAssets, data.assets, data.budgetByScopeId, entityOptions])

  const filterDescriptions = useMemo(() => {
    const name = (options: { value: string; label: string }[], ids: string[] = []) => ids.map((id) => options.find((o) => o.value === id)?.label ?? id).join(', ')
    const out: string[] = []
    if (filters.entityIds.length) out.push(`${LEVEL_PLURAL[level]}: ${name(entityOptions, filters.entityIds)}`)
    if (filters.companyIds?.length) out.push(`Empresas: ${name(data.companies.map((c) => ({ value: c.id, label: c.name })), filters.companyIds)}`)
    if (filters.costCenterIds?.length) out.push(`Centros de costo: ${name(data.costCenters.map((c) => ({ value: c.id, label: c.name })), filters.costCenterIds)}`)
    if (filters.fixedAssetIds?.length) out.push(`Bienes de uso: ${name(data.fixedAssets.map((f) => ({ value: f.id, label: f.name })), filters.fixedAssetIds)}`)
    return out
  }, [filters, level, entityOptions, data.companies, data.costCenters, data.fixedAssets])

  async function handleExport() {
    if (!result || !visibleTotals) return
    const xlsx = buildBudgetExport(level, {
      result,
      visibleRows,
      visibleTotals,
      filtersApplied: data.filtersApplied,
      filterDescriptions,
      reconciliations: data.reconciliations,
      observations: data.observations,
      truncated: !!data.financialDocsResult?.truncated,
      generatedAt: new Date(),
    })
    await downloadXLSX(xlsx.rows, xlsx.filename, xlsx.options)
  }

  function openEditor(row: BudgetRow | null) {
    setEditor({ scope: row ? { id: row.id, label: row.label } : null })
  }

  function openHistory(row: BudgetRow) {
    const budget = data.budgetByScopeId.get(row.id)
    if (budget) setHistory({ budgetId: budget.id, label: row.label })
  }

  const header = (
    <PageHeader
      title="Presupuestos de Seguros"
      subtitle="Presupuesto en USD vs. gasto real (Económico), proyección de renovaciones y necesidad de fondos"
      actions={
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Plus size={15} /> Nuevo presupuesto
            </button>
          )}
          <button
            type="button"
            onClick={handleExport}
            disabled={!levelTotalsReady}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            <FileSpreadsheet size={15} /> Exportar a Excel
          </button>
        </div>
      }
    />
  )

  if (data.isError) {
    return (
      <PageContent>
        {header}
        <ErrorState
          description="No se pudieron cargar los datos de presupuestos, documentos o pólizas."
          action={<button type="button" onClick={data.refetchAll} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">Reintentar</button>}
        />
      </PageContent>
    )
  }

  const totals = visibleTotals?.totals
  const devReal = totals ? deviationRealOrNull(totals) : null
  const devEst = totals ? deviationEstimateOrNull(totals) : null
  const economicIncomplete = !!totals && totals.excludedEconomic > 0

  return (
    <PageContent>
      {header}
      <FinancialDataWarning result={data.financialDocsResult} />

      <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" role="note">
        <Info size={16} className="mt-0.5 flex-shrink-0 text-slate-500" />
        <div className="min-w-0">
          {RECONCILIATION_NOTE}{' '}
          <a href="#conciliacion" className="font-medium text-brand-700 hover:underline">Ver conciliación</a>
        </div>
      </div>

      {levelAffectedByCurrentAllocations(level) && <DataWarning>{HISTORICAL_ALLOCATION_WARNING}</DataWarning>}

      <ObservationsPanel observations={data.observations} ariaLabel="Observaciones de presupuestos" />

      {/* Controles */}
      <div className="mb-6 space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Nivel</span>
            <div className="flex overflow-hidden rounded-lg border border-slate-200">
              {BUDGET_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => changeLevel(l)}
                  className={`border-r border-slate-200 px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0 ${level === l ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {LEVEL_LABELS[l]}
                </button>
              ))}
            </div>
            <span title={LEVEL_HELP} aria-label={LEVEL_HELP} className="text-slate-400 hover:text-slate-600"><CircleHelp size={15} /></span>
          </div>

          <div className="hidden h-5 w-px bg-slate-200 sm:block" />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Rápido</span>
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => changeRange(p.from, p.to)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${from === p.from && to === p.to ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5">
          <DateRangeMonthPicker from={from} to={to} onChange={changeRange} />
          <div className="hidden h-5 w-px bg-slate-200 md:block" />
          <MultiSelectFilter
            label={LEVEL_PLURAL[level]}
            options={entityOptions}
            value={filters.entityIds}
            onChange={(entityIds) => setFilters((f) => ({ ...f, entityIds }))}
          />
          {level === 'ASSET' && (
            <>
              <MultiSelectFilter label="Empresa" options={data.companies.map((c) => ({ value: c.id, label: c.name }))} value={filters.companyIds ?? []} onChange={(companyIds) => setFilters((f) => ({ ...f, companyIds }))} />
              <MultiSelectFilter label="Centro de costo" options={data.costCenters.map((c) => ({ value: c.id, label: c.name }))} value={filters.costCenterIds ?? []} onChange={(costCenterIds) => setFilters((f) => ({ ...f, costCenterIds }))} />
              <MultiSelectFilter label="Bien de uso" options={data.fixedAssets.map((f) => ({ value: f.id, label: f.name }))} value={filters.fixedAssetIds ?? []} onChange={(fixedAssetIds) => setFilters((f) => ({ ...f, fixedAssetIds }))} />
            </>
          )}
          {data.filtersApplied && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="text-xs font-medium text-brand-700 hover:underline">Limpiar filtros</button>
          )}
        </div>
      </div>

      {data.isLoading || !result || !visibleTotals || !totals || !data.unassignedTotals ? (
        <LoadingState rows={6} />
      ) : (
        <>
          <MetricGrid cols={5} className="mb-6">
            <KpiCard
              label="Presupuesto"
              value={usdCompact(totals.budget)}
              description={totals.budgetDefined > 0 ? `${usd(totals.budget)} · solo meses presupuestados` : 'Sin presupuesto en el rango'}
              icon={Target}
              variant="default"
            />
            <KpiCard
              label="Real económico"
              value={usdMarked(totals.realEconomic, economicIncomplete, true)}
              description={economicIncomplete
                ? `Incompleto — excluye ${result.excludedEconomic.length} comprobante(s) sin cierre USD`
                : totals.realWithoutBudget !== 0 ? `Real sin presupuesto: ${usd(totals.realWithoutBudget)}` : 'Por fecha de emisión'}
              icon={PiggyBank}
              variant={economicIncomplete ? 'warning' : 'info'}
            />
            <KpiCard
              label="Estimado de cierre"
              value={usdMarked(totals.estimate, economicIncomplete, true)}
              description={`Real + proyección futura (${usdCompact(totals.projection)})`}
              icon={Scale}
              variant={economicIncomplete ? 'warning' : 'default'}
            />
            <KpiCard
              label="Desvío real a la fecha"
              value={devReal === null ? '—' : `${devReal > 0.005 ? '+' : ''}${usdCompact(devReal)}`}
              description={devReal === null ? 'Sin meses transcurridos con presupuesto' : 'Real − presupuesto, meses transcurridos'}
              icon={devReal !== null && devReal > 0.005 ? TrendingUp : TrendingDown}
              variant={devReal === null ? 'default' : devReal > 0.005 ? 'danger' : 'success'}
            />
            <KpiCard
              label="Desvío estimado"
              value={devEst === null ? '—' : `${devEst > 0.005 ? '+' : ''}${usdCompact(devEst)}`}
              description={devEst === null ? 'Sin presupuesto en el rango' : `Ejecución estimada: ${percentLabel(totals)}`}
              icon={devEst !== null && devEst > 0.005 ? TrendingUp : TrendingDown}
              variant={devEst === null ? 'default' : devEst > 0.005 ? 'danger' : 'success'}
            />
          </MetricGrid>

          <SectionCard
            title="Presupuesto vs. costo mensual"
            subtitle={`${data.filtersApplied ? 'Filas visibles' : `Total del nivel ${LEVEL_LABELS[level].toLowerCase()}`} · Real económico + proyección futura (apiladas, nunca sumadas dos veces) vs. presupuesto · USD`}
            className="mb-6"
          >
            <BudgetCostChart cells={visibleTotals.months} />
          </SectionCard>

          <SectionCard
            title={`Presupuesto vs. real por ${LEVEL_LABELS[level].toLowerCase()}`}
            subtitle="Importes del rango en USD · desplegá una fila para ver cada mes · * = incompleto (excluye importes sin cierre USD confiable)"
            noPadding
            className="mb-6"
          >
            {visibleRows.length === 0 && !data.filtersApplied && result.rows.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Sin presupuestos ni movimientos"
                description={`No hay presupuestos cargados ni gastos para ${LEVEL_PLURAL[level].toLowerCase()} en este rango.`}
                action={canEdit ? (
                  <button type="button" onClick={() => openEditor(null)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Nuevo presupuesto</button>
                ) : undefined}
              />
            ) : visibleRows.length === 0 ? (
              <EmptyState title="Ninguna fila coincide con los filtros" description="Los totales del nivel siguen incluyendo todos los movimientos." />
            ) : (
              <BudgetComparisonTable
                rows={visibleRows}
                levelLabel={LEVEL_LABELS[level]}
                canEdit={canEdit}
                filtersApplied={data.filtersApplied}
                visibleTotals={visibleTotals.totals}
                levelTotals={result.levelTotals.totals}
                unassignedTotals={data.unassignedTotals}
                onEdit={openEditor}
                onHistory={openHistory}
              />
            )}
          </SectionCard>

          <BudgetFundsSection cells={visibleTotals.months} />

          <BudgetReconciliationPanel reconciliations={data.reconciliations} />
        </>
      )}

      {editor && canEdit && (
        <BudgetEditorModal
          level={level}
          scope={editor.scope}
          scopeOptions={newScopeOptions}
          defaultStartMonth={from}
          onClose={() => setEditor(null)}
        />
      )}
      {history && (
        <BudgetHistoryModal
          budgetId={history.budgetId}
          label={history.label}
          defaultFrom={from}
          defaultTo={to}
          onClose={() => setHistory(null)}
        />
      )}
    </PageContent>
  )
}
