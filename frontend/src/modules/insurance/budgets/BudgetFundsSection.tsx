import { useMemo } from 'react'
import { Wallet } from 'lucide-react'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { buildFundsSeries, type BudgetMonthCell } from '../../../shared/utils/budgetComparisonCalc'
import { monthLabel } from '../renewal-projections/renewalProjectionFormat'
import { BudgetFundsChart } from './BudgetCharts'
import { FUNDS_NOTICE, usd } from './budgetFormat'

// Sección de FONDOS (D5), separada de la tabla de costo: presupuesto
// acumulado vs. vencimientos + proyección financiera acumulados. Usa
// «Diferencia de fondos» (nunca «desvío») y no alimenta ningún KPI de costo.

export function BudgetFundsSection({ cells }: { cells: BudgetMonthCell[] }) {
  const points = useMemo(() => buildFundsSeries(cells), [cells])
  const last = points[points.length - 1]
  return (
    <SectionCard
      title="Necesidad de fondos (financiero) — no es gasto económico"
      subtitle="Presupuesto acumulado vs. cuotas por vencimiento (pagadas + pendientes) + proyección financiera, acumuladas"
      className="mb-6"
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs text-sky-900">
        <Wallet size={14} className="mt-0.5 flex-shrink-0" />
        <span>{FUNDS_NOTICE}</span>
      </div>
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-5">
        <div className="2xl:col-span-3">
          <BudgetFundsChart points={points} />
          {last && (
            <p className="mt-2 text-xs text-slate-500">
              Diferencia de fondos acumulada al cierre del rango:{' '}
              <span className={`font-semibold ${last.fundsDifference < -0.005 ? 'text-red-600' : 'text-emerald-700'}`}>{usd(last.fundsDifference)}</span>
              {last.fundsDifference < -0.005 ? ' (la necesidad supera lo presupuestado)' : ''}
            </p>
          )}
        </div>
        <div className="table-container 2xl:col-span-2 max-h-[300px] overflow-y-auto rounded-lg border border-slate-100">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th className="text-left">Mes</th>
                <th className="text-right">Presup. acum.</th>
                <th className="text-right">Necesidad acum.</th>
                <th className="text-right">Diferencia de fondos</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.month}>
                  <td className="text-xs text-slate-600 whitespace-nowrap">{monthLabel(p.month)}</td>
                  <td className="text-right text-xs tabular-nums whitespace-nowrap">{usd(p.cumulativeBudget)}</td>
                  <td className="text-right text-xs tabular-nums whitespace-nowrap">
                    {usd(p.cumulativeNeed)}
                    {p.incomplete && <span className="ml-0.5 text-amber-600" title="Excluye cuotas sin cierre USD confiable">*</span>}
                  </td>
                  <td className={`text-right text-xs tabular-nums whitespace-nowrap ${p.fundsDifference < -0.005 ? 'text-red-600' : 'text-slate-700'}`}>{usd(p.fundsDifference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  )
}
