import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { Modal } from '../../../shared/components/modals/Modal'
import { LoadingState } from '../../../shared/components/empty-states/LoadingState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { insuranceBudgetQueries, type InsuranceBudgetAuditEntry } from '../../../shared/api/insurance-budgets.api'
import { formatDate } from '../../../shared/utils/format'
import { monthLabel } from '../renewal-projections/renewalProjectionFormat'
import { usd } from './budgetFormat'

// Historial permanente de un presupuesto (sin retención): quién cambió qué
// importe, cuándo, de cuánto a cuánto y por qué. Filtrable por rango de
// meses para consultar ejercicios anteriores.

const ACTION_LABEL: Record<InsuranceBudgetAuditEntry['action'], string> = {
  CREATE: 'Alta del presupuesto',
  UPDATE_MONTHS: 'Importe mensual',
  UPDATE_NOTES: 'Notas',
}

function changeText(e: InsuranceBudgetAuditEntry): string {
  if (e.action === 'UPDATE_NOTES') return `${e.previousData?.notes || '(sin notas)'} → ${e.newData?.notes || '(sin notas)'}`
  if (e.action === 'CREATE') return e.newData?.notes ? `Notas: ${e.newData.notes}` : '—'
  const before = e.previousAmountUsd === null ? 'sin presupuesto' : usd(e.previousAmountUsd)
  const after = e.newAmountUsd === null ? 'sin presupuesto' : usd(e.newAmountUsd)
  return `${before} → ${after}`
}

export function BudgetHistoryModal({ budgetId, label, defaultFrom, defaultTo, onClose }: {
  budgetId: string
  label: string
  defaultFrom: string
  defaultTo: string
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const [rangeEnabled, setRangeEnabled] = useState(false)
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const query = useQuery(insuranceBudgetQueries.auditLog(budgetId, page, rangeEnabled ? from : undefined, rangeEnabled ? to : undefined))
  const totalPages = query.data?.pagination.totalPages ?? 1

  return (
    <Modal open onClose={onClose} size="xl" icon={History} title={`Historial · ${label}`} description="Todos los cambios quedan registrados de forma permanente.">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={rangeEnabled} onChange={(e) => { setRangeEnabled(e.target.checked); setPage(1) }} />
          Solo cambios de importes de estos meses
        </label>
        {rangeEnabled && (
          <DateRangeMonthPicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); setPage(1) }} />
        )}
      </div>

      {query.isLoading ? (
        <LoadingState rows={4} />
      ) : query.isError ? (
        <ErrorState description="No se pudo cargar el historial." />
      ) : !query.data || query.data.data.length === 0 ? (
        <EmptyState title="Sin cambios registrados" description={rangeEnabled ? 'No hubo cambios de importes en esos meses.' : 'Todavía no hay cambios.'} />
      ) : (
        <>
          <div className="table-container max-h-[420px] overflow-y-auto">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th className="text-left min-w-[140px]">Fecha</th>
                  <th className="text-left min-w-[160px]">Usuario</th>
                  <th className="text-left min-w-[130px]">Cambio</th>
                  <th className="text-left min-w-[80px]">Mes</th>
                  <th className="text-left min-w-[220px]">Anterior → nuevo</th>
                  <th className="text-left min-w-[160px]">Motivo</th>
                  <th className="text-right">Versión</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((e) => (
                  <tr key={e.id}>
                    <td className="text-xs text-slate-600 whitespace-nowrap">{formatDate(e.createdAt)} {new Date(e.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="text-xs text-slate-700 break-all">{e.performedBy}</td>
                    <td className="text-xs text-slate-700">{ACTION_LABEL[e.action]}</td>
                    <td className="text-xs text-slate-600 whitespace-nowrap">{e.month ? monthLabel(e.month) : '—'}</td>
                    <td className="text-xs tabular-nums text-slate-800">{changeText(e)}</td>
                    <td className="text-xs text-slate-500">{e.reason || '—'}</td>
                    <td className="text-right text-xs tabular-nums text-slate-500">{e.versionAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-xs">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-md border border-slate-200 px-2.5 py-1 disabled:opacity-40">Anterior</button>
              <span className="text-slate-500">Página {page} de {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-md border border-slate-200 px-2.5 py-1 disabled:opacity-40">Siguiente</button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
