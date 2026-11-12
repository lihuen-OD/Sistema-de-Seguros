import { Fragment, useState } from 'react'
import { ChevronRight, History, PencilLine, Plus } from 'lucide-react'
import { Badge } from '../../../shared/components/badges/Badge'
import {
  deviationEstimateOrNull,
  deviationRealOrNull,
  isIncomplete,
  realFinancial,
  type BudgetAmounts,
  type BudgetRow,
} from '../../../shared/utils/budgetComparisonCalc'
import { monthLabel } from '../renewal-projections/renewalProjectionFormat'
import { percentLabel, statusOf, usd, usdInteger } from './budgetFormat'

// Tabla Presupuesto vs real: una fila por entidad del nivel con los 7
// conceptos del período; cada fila se despliega con el detalle mensual.
// «Real financiero» va en su propio grupo («Referencia de fondos — no es
// costo») y nunca entra en Estimado ni en los desvíos.

const STICKY = { boxShadow: '1px 0 0 0 #e2e8f0' }

function Money({ value, incomplete = false, muted = false }: { value: number | null; incomplete?: boolean; muted?: boolean }) {
  if (value === null) return <span className="text-xs text-slate-300">—</span>
  return (
    <span className={`text-xs tabular-nums ${muted ? 'text-slate-500' : 'text-slate-800'}`} title={usd(value)}>
      {usdInteger(value)}
      {incomplete && <span className="ml-0.5 text-amber-600" title="Incompleto: excluye importes sin cierre USD confiable">*</span>}
    </span>
  )
}

function Deviation({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-300">—</span>
  const tone = value > 0.005 ? 'text-red-600' : value < -0.005 ? 'text-emerald-700' : 'text-slate-600'
  return <span className={`text-xs font-medium tabular-nums ${tone}`} title={usd(value)}>{value > 0.005 ? '+' : ''}{usdInteger(value)}</span>
}

function AmountCells({ a, budgetMonths }: { a: BudgetAmounts; budgetMonths?: { defined: number; total: number } }) {
  const incomplete = isIncomplete(a)
  const status = statusOf(a)
  const hasBudget = a.budgetDefined > 0
  return (
    <>
      <td className="text-right whitespace-nowrap">
        {hasBudget ? <Money value={a.budget} /> : <span className="text-xs text-slate-400">Sin presupuesto</span>}
        {budgetMonths && hasBudget && budgetMonths.defined < budgetMonths.total && (
          <div className="text-[10px] text-amber-700">Incompleto: {budgetMonths.defined} de {budgetMonths.total} meses</div>
        )}
      </td>
      <td className="text-right whitespace-nowrap">
        <Money value={a.realEconomic} incomplete={a.excludedEconomic > 0} />
        {a.realWithoutBudget !== 0 && hasBudget && (
          <div className="text-[10px] text-slate-400">sin presup.: {usdInteger(a.realWithoutBudget)}</div>
        )}
      </td>
      <td className="text-right whitespace-nowrap"><Money value={a.projection} muted /></td>
      <td className="text-right whitespace-nowrap bg-slate-50/60"><Money value={a.estimate} incomplete={a.excludedEconomic > 0} /></td>
      <td className="text-right whitespace-nowrap"><Deviation value={deviationRealOrNull(a)} /></td>
      <td className="text-right whitespace-nowrap"><Deviation value={deviationEstimateOrNull(a)} /></td>
      <td className="text-right whitespace-nowrap text-xs tabular-nums text-slate-700">{percentLabel(a)}</td>
      <td className="whitespace-nowrap">
        <span className="flex flex-wrap gap-1">
          <Badge variant={status.variant}>{status.label}</Badge>
          {incomplete && <Badge variant="warning">Incompleto</Badge>}
        </span>
      </td>
      <td className="text-right whitespace-nowrap border-l border-slate-200 bg-sky-50/40">
        <Money value={realFinancial(a)} incomplete={a.excludedFinancial > 0} muted />
      </td>
    </>
  )
}

interface Props {
  rows: BudgetRow[]
  levelLabel: string
  canEdit: boolean
  filtersApplied: boolean
  visibleTotals: BudgetAmounts
  levelTotals: BudgetAmounts
  unassignedTotals: BudgetAmounts
  onEdit: (row: BudgetRow) => void
  onHistory: (row: BudgetRow) => void
}

export function BudgetComparisonTable({ rows, levelLabel, canEdit, filtersApplied, visibleTotals, levelTotals, unassignedTotals, onEdit, onHistory }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="table-container">
      <table className="enterprise-table">
        <thead>
          <tr>
            <th rowSpan={2} className="text-left sticky left-0 bg-slate-50 z-10 min-w-[220px]" style={STICKY}>{levelLabel}</th>
            <th colSpan={8} className="text-center text-[11px] uppercase tracking-wide text-slate-500">Costo (económico)</th>
            <th className="text-center text-[11px] uppercase tracking-wide text-sky-700 border-l border-slate-200 bg-sky-50/60">Referencia de fondos</th>
          </tr>
          <tr>
            <th className="text-right min-w-[104px]">Presupuesto</th>
            <th className="text-right min-w-[104px]">Real económico</th>
            <th className="text-right min-w-[96px]">Proyección<span className="block text-[10px] font-normal normal-case text-slate-400">futura</span></th>
            <th className="text-right min-w-[104px] bg-slate-100/70">Estimado<span className="block text-[10px] font-normal normal-case text-slate-400">de cierre</span></th>
            <th className="text-right min-w-[104px]" title="Real económico − Presupuesto, solo meses transcurridos con presupuesto">Desvío real<span className="block text-[10px] font-normal normal-case text-slate-400">a la fecha</span></th>
            <th className="text-right min-w-[104px]" title="Estimado de cierre − Presupuesto, meses con presupuesto">Desvío estimado</th>
            <th className="text-right min-w-[70px]">%</th>
            <th className="text-left min-w-[110px]">Estado</th>
            <th className="text-right min-w-[112px] border-l border-slate-200 bg-sky-50/60" title="Cuotas por vencimiento (pagadas + pendientes). No es costo: nunca se suma al estimado.">Real financiero<span className="block text-[10px] font-normal normal-case text-sky-700">no es costo</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = expanded.has(row.id)
            return (
              <Fragment key={row.id}>
                <tr className={row.synthetic ? 'bg-slate-50/50' : undefined}>
                  <td className="sticky left-0 bg-white z-10" style={STICKY}>
                    <div className="flex items-start gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggle(row.id)}
                        className="mt-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? `Ocultar meses de ${row.label}` : `Ver meses de ${row.label}`}
                      >
                        <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                      </button>
                      <div className="min-w-0">
                        <div className={`text-sm truncate ${row.synthetic ? 'italic text-slate-500' : 'font-medium text-slate-800'}`}>{row.label}</div>
                        {row.sublabel && <div className="text-[11px] text-slate-400 truncate">{row.sublabel}</div>}
                        {/* Acciones en la columna fija: siempre visibles aunque la tabla tenga scroll horizontal. */}
                        {!row.synthetic && (canEdit || row.hasBudgetLine) && (
                          <div className="mt-1 flex gap-1">
                            {canEdit && (
                              <button
                                type="button"
                                onClick={() => onEdit(row)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-brand-700"
                              >
                                {row.hasBudgetLine ? <PencilLine size={11} /> : <Plus size={11} />}
                                {row.hasBudgetLine ? 'Editar' : 'Cargar'}
                              </button>
                            )}
                            {row.hasBudgetLine && (
                              <button
                                type="button"
                                onClick={() => onHistory(row)}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                aria-label={`Historial de ${row.label}`}
                              >
                                <History size={11} />
                                Historial
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <AmountCells a={row.totals} budgetMonths={{ defined: row.totals.budgetDefined, total: row.totals.monthCount }} />
                </tr>
                {isOpen &&
                  row.months.map((cell) => (
                    <tr key={`${row.id}-${cell.month}`} className="bg-slate-50/40">
                      <td className="sticky left-0 bg-slate-50 z-10 pl-10 text-xs text-slate-600" style={STICKY}>
                        {monthLabel(cell.month)}
                        {!cell.isElapsed && <span className="ml-1.5 text-[10px] text-slate-400">futuro</span>}
                      </td>
                      <AmountCells a={cell} />
                    </tr>
                  ))}
              </Fragment>
            )
          })}

          {filtersApplied && (
            <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
              <td className="sticky left-0 bg-slate-50 z-10 text-xs font-semibold text-slate-700" style={STICKY}>Total filas visibles</td>
              <AmountCells a={visibleTotals} />
            </tr>
          )}
          <tr className={`bg-slate-100 font-semibold ${filtersApplied ? '' : 'border-t-2 border-slate-200'}`}>
            <td className="sticky left-0 bg-slate-100 z-10 text-xs font-semibold text-slate-800" style={STICKY}>
              Total del nivel
              {(unassignedTotals.realEconomic !== 0 || realFinancial(unassignedTotals) !== 0) && (
                <div className="text-[10px] font-normal text-slate-500">
                  incluye «Sin asignar» y filas «Sin …»: {usdInteger(unassignedTotals.realEconomic)} real económico
                </div>
              )}
            </td>
            <AmountCells a={levelTotals} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
