import { Bar, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BudgetMonthCell, FundsPoint } from '../../../shared/utils/budgetComparisonCalc'
import { monthLabel } from '../renewal-projections/renewalProjectionFormat'
import { usd, usdCompact } from './budgetFormat'

// Gráficos de Presupuestos — misma estética que los Análisis (recharts, grilla
// tenue, ejes sin líneas, tooltip blanco). Colores: real = azul de los
// Análisis, proyección = mismo azul aclarado (siempre separada del real),
// presupuesto = línea gris oscura; fondos usa su propio color (celeste) para
// no leerse como costo.

const COLORS = {
  real: '#3b82f6',
  projection: '#93c5fd',
  budget: '#334155',
  need: '#0284c7',
}

interface TooltipEntry { name: string; value: number | null; color: string }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[190px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-600">{entry.name}</span>
          </span>
          <span className="font-medium text-slate-800">{entry.value == null ? 'Sin presupuesto' : usd(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

const axisTick = { fontSize: 10, fill: '#94a3b8' }

export function BudgetCostChart({ cells }: { cells: BudgetMonthCell[] }) {
  const data = cells.map((c) => ({
    label: monthLabel(c.month),
    real: c.realEconomic,
    projection: c.projection,
    // null = mes sin presupuesto: la línea se corta, nunca se dibuja como 0.
    budget: c.budgetDefined > 0 ? c.budget : null,
  }))
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={84} tickFormatter={(v: number) => usdCompact(v)} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload as TooltipEntry[]} label={label as string} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          <Bar dataKey="real" name="Real económico" stackId="cost" fill={COLORS.real} />
          <Bar dataKey="projection" name="Proyección futura" stackId="cost" fill={COLORS.projection} radius={[3, 3, 0, 0]} />
          <Line dataKey="budget" name="Presupuesto" stroke={COLORS.budget} strokeWidth={2} dot={{ r: 2.5 }} connectNulls={false} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BudgetFundsChart({ points }: { points: FundsPoint[] }) {
  const data = points.map((p) => ({ label: monthLabel(p.month), cumulativeBudget: p.cumulativeBudget, cumulativeNeed: p.cumulativeNeed }))
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={84} tickFormatter={(v: number) => usdCompact(v)} />
          <Tooltip content={({ active, payload, label }) => <ChartTooltip active={active} payload={payload as TooltipEntry[]} label={label as string} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
          <Line dataKey="cumulativeBudget" name="Presupuesto acumulado" stroke={COLORS.budget} strokeWidth={2} dot={false} type="monotone" />
          <Line dataKey="cumulativeNeed" name="Necesidad de fondos acumulada" stroke={COLORS.need} strokeWidth={2} strokeDasharray="5 3" dot={false} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
