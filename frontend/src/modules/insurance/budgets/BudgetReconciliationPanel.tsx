import { useState } from 'react'
import { AlertTriangle, ChevronRight, Scale } from 'lucide-react'
import type { Reconciliation } from '../../../shared/utils/budgetReconciliation'
import { usd } from './budgetFormat'

// Conciliación con los Análisis (D7): Según el Análisis ± cierre USD ±
// prorrateo = Real en Presupuestos, por fila y en total. Plegable, cerrada
// por defecto. Nunca corrige nada: una diferencia sin explicar se marca.

function Signed({ value, na = false }: { value: number; na?: boolean }) {
  if (na) return <span className="text-xs text-slate-400">no aplica</span>
  if (Math.abs(value) < 0.005) return <span className="text-xs text-slate-300">—</span>
  return <span className="text-xs tabular-nums text-slate-700">{value > 0 ? '+' : ''}{usd(value)}</span>
}

export function BudgetReconciliationPanel({ reconciliations }: { reconciliations: Reconciliation[] }) {
  const [tab, setTab] = useState<Reconciliation['kind']>('ECONOMIC')
  const rec = reconciliations.find((r) => r.kind === tab)
  const anyMismatch = reconciliations.some((r) => r.mismatch)
  return (
    <details id="conciliacion" className={`group mb-6 rounded-lg border bg-white scroll-mt-20 ${anyMismatch ? 'border-amber-200' : 'border-slate-200'}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight size={16} className="flex-shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
        <Scale size={16} className="flex-shrink-0 text-slate-500" />
        <span className="text-sm font-semibold text-slate-800">Conciliación con Análisis Económico y Financiero</span>
        {anyMismatch && (
          <span className="flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={13} /> hay una diferencia sin explicar</span>
        )}
        <span className="ml-auto text-xs text-slate-400">Explica por qué los importes difieren de esas pantallas</span>
      </summary>
      <div className="border-t border-slate-100 px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
            {(['ECONOMIC', 'FINANCIAL'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setTab(kind)}
                className={`px-3 py-1.5 text-xs font-medium border-r border-slate-200 last:border-r-0 transition-colors ${tab === kind ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {kind === 'ECONOMIC' ? 'Económico (costo)' : 'Financiero (fondos)'}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">
            Según el Análisis ± ajuste por cierre USD ± ajuste por prorrateo = Real en Presupuestos
          </span>
        </div>
        {rec && (
          <>
            {rec.mismatch && rec.mismatchDetail && (
              <p className="mb-2 flex items-start gap-1.5 text-xs text-amber-800"><AlertTriangle size={13} className="mt-0.5" />{rec.mismatchDetail}</p>
            )}
            {rec.lines.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Sin movimientos en el período.</p>
            ) : (
              <div className="table-container max-h-[360px] overflow-y-auto">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th className="text-left min-w-[200px]">Fila</th>
                      <th className="text-right min-w-[140px]">Según el Análisis</th>
                      <th className="text-right min-w-[140px]" title="Lo que el Análisis suma con un cierre USD no confiable y Presupuestos excluye">Ajuste por cierre USD</th>
                      <th className="text-right min-w-[140px]" title="Reparto por % de asignación del activo (solo Empresa y Centro de costo)">Ajuste por prorrateo</th>
                      <th className="text-right min-w-[140px]">Real en Presupuestos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rec.lines.map((l) => (
                      <tr key={l.rowId}>
                        <td className="text-xs text-slate-700">{l.label}</td>
                        <td className="text-right text-xs tabular-nums">{usd(l.accordingToAnalysis)}</td>
                        <td className="text-right"><Signed value={l.closureAdjustment} /></td>
                        <td className="text-right"><Signed value={l.prorationAdjustment} na={!rec.prorationApplies} /></td>
                        <td className="text-right text-xs font-medium tabular-nums">{usd(l.budgetModule)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                      <td className="text-xs">Total del nivel</td>
                      <td className="text-right text-xs tabular-nums">{usd(rec.total.accordingToAnalysis)}</td>
                      <td className="text-right"><Signed value={rec.total.closureAdjustment} /></td>
                      <td className="text-right"><Signed value={rec.total.prorationAdjustment} na={!rec.prorationApplies} /></td>
                      <td className="text-right text-xs tabular-nums">{usd(rec.total.budgetModule)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-slate-400">
              {rec.prorationApplies
                ? 'El prorrateo solo redistribuye entre filas: en el total del nivel suma 0.'
                : 'En este nivel no hay prorrateo: cada fila coincide con el Análisis salvo por el cierre USD.'}
            </p>
          </>
        )}
      </div>
    </details>
  )
}
