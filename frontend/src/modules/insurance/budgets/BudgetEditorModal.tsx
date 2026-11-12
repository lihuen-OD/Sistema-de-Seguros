import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarRange, PiggyBank } from 'lucide-react'
import { Modal } from '../../../shared/components/modals/Modal'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import { LoadingState } from '../../../shared/components/empty-states/LoadingState'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { SearchableSelect, type SearchableSelectOption } from '../../../shared/components/forms/SearchableSelect'
import { apiErrorCode } from '../../../shared/api/client'
import {
  BUDGET_VERSION_CONFLICT,
  insuranceBudgetKeys,
  insuranceBudgetQueries,
  insuranceBudgetsApi,
  type InsuranceBudget,
} from '../../../shared/api/insurance-budgets.api'
import type { BudgetLevel } from '../../../shared/utils/budgetAttribution'
import {
  distributeAnnualAmount,
  monthsToOverwrite,
  parseBudgetAmount,
  sumMonthAmounts,
  toCents,
} from '../../../shared/utils/budgetDistribution'
import { addMonthsToKey, buildMonthRange } from '../../../shared/utils/renewalProjectionCalc'
import { monthLabel } from '../renewal-projections/renewalProjectionFormat'
import { LEVEL_LABELS, usd } from './budgetFormat'

// Alta / edición de un presupuesto. Se edita una VENTANA de 12 meses desde
// el mes de inicio elegido (año calendario, ejercicio julio–junio o
// cualquier otro); los meses fuera de la ventana no se tocan. Vacío = sin
// presupuesto, 0 = presupuesto cero. El total anual es siempre Σ meses.
// Concurrencia: se guarda con la versión cargada; si otro usuario guardó
// antes, el backend responde 409, se recargan los datos y el formulario se
// reinicia con lo vigente (key = id + versión) — nunca se pisa en silencio.

const WINDOW_MONTHS = 12

interface BudgetEditorModalProps {
  level: BudgetLevel
  /** Alcance fijo (editar/cargar desde una fila) o null (nuevo: se elige). */
  scope: { id: string; label: string } | null
  scopeOptions: SearchableSelectOption[]
  defaultStartMonth: string
  onClose: () => void
}

export function BudgetEditorModal({ level, scope, scopeOptions, defaultStartMonth, onClose }: BudgetEditorModalProps) {
  const [scopeId, setScopeId] = useState(scope?.id ?? '')
  const [startMonth, setStartMonth] = useState(defaultStartMonth)
  const endMonth = addMonthsToKey(startMonth, WINDOW_MONTHS - 1)
  const listQuery = useQuery({ ...insuranceBudgetQueries.list(level, startMonth, endMonth), enabled: !!scopeId })
  const budget = listQuery.data?.find((b) => b.scopeId === scopeId) ?? null
  const scopeLabel = scope?.label ?? scopeOptions.find((o) => o.value === scopeId)?.label ?? ''

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      icon={PiggyBank}
      title={budget ? `Editar presupuesto · ${scopeLabel}` : `Nuevo presupuesto${scopeLabel ? ` · ${scopeLabel}` : ''}`}
      description={`${LEVEL_LABELS[level]} · importes en USD por mes`}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!scope && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">{LEVEL_LABELS[level]}</span>
            <SearchableSelect
              options={scopeOptions}
              value={scopeId}
              onChange={setScopeId}
              placeholder={`Elegí ${LEVEL_LABELS[level].toLowerCase()}…`}
              noResultsMessage="Sin resultados (los que ya tienen presupuesto se editan desde la tabla)"
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600"><CalendarRange size={13} /> Mes de inicio de la ventana de 12 meses</span>
          <input
            type="month"
            value={startMonth}
            onChange={(e) => e.target.value && setStartMonth(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <span className="mt-1 block text-[11px] text-slate-400">{monthLabel(startMonth)} – {monthLabel(endMonth)} · enero para año calendario, julio para ejercicio jul–jun</span>
        </label>
      </div>

      {!scopeId ? (
        <p className="py-6 text-center text-sm text-slate-400">Elegí a qué {LEVEL_LABELS[level].toLowerCase()} corresponde el presupuesto.</p>
      ) : listQuery.isLoading ? (
        <LoadingState rows={3} />
      ) : listQuery.isError ? (
        <ErrorState description="No se pudo cargar el presupuesto vigente." />
      ) : (
        <BudgetEditorForm
          // Datos nuevos (otra versión, otra ventana u otro alcance) reinician el formulario sin efectos.
          key={`${scopeId}-${budget?.id ?? 'new'}-${budget?.version ?? 0}-${startMonth}`}
          level={level}
          scopeId={scopeId}
          budget={budget}
          months={buildMonthRange(startMonth, endMonth)}
          onClose={onClose}
        />
      )}
    </Modal>
  )
}

interface FormProps {
  level: BudgetLevel
  scopeId: string
  budget: InsuranceBudget | null
  months: string[]
  onClose: () => void
}

function BudgetEditorForm({ level, scopeId, budget, months, onClose }: FormProps) {
  const queryClient = useQueryClient()
  const stored = useMemo(() => new Map((budget?.months ?? []).map((m) => [m.month, m.amountUsd])), [budget])
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(months.map((m) => [m, stored.has(m) ? String(stored.get(m)) : ''])),
  )
  const [annual, setAnnual] = useState('')
  const [notes, setNotes] = useState(budget?.notes ?? '')
  const [reason, setReason] = useState('')
  const [distributed, setDistributed] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const parsed = months.map((m) => ({ month: m, parsed: parseBudgetAmount(values[m] ?? '') }))
  const errors = parsed.filter((p) => p.parsed.kind === 'invalid')
  const windowTotal = sumMonthAmounts(parsed.map((p) => (p.parsed.kind === 'value' ? p.parsed.amountUsd : null)))
  const annualParsed = parseBudgetAmount(annual)
  const annualDiff = annualParsed.kind === 'value' ? windowTotal - annualParsed.amountUsd : null
  const definedCount = parsed.filter((p) => p.parsed.kind === 'value').length

  // Cambios contra lo guardado: alta, cambio o vaciado (null) de cada mes.
  const changes = parsed.flatMap(({ month, parsed: p }) => {
    const previous = stored.get(month)
    if (p.kind === 'empty') return previous !== undefined ? [{ month, amountUsd: null as number | null }] : []
    if (p.kind === 'value' && (previous === undefined || toCents(previous) !== toCents(p.amountUsd))) return [{ month, amountUsd: p.amountUsd as number | null }]
    return []
  })
  const notesValue = notes.trim() === '' ? null : notes.trim()
  const notesChanged = (notesValue ?? null) !== (budget?.notes ?? null)
  // Meses ya guardados que este guardado reemplaza o vacía.
  const overwritten = changes.filter((c) => stored.has(c.month))

  function distribute() {
    if (annualParsed.kind !== 'value') {
      toast.error('Ingresá un total anual válido (≥ 0, hasta 2 decimales)')
      return
    }
    const next = distributeAnnualAmount(annualParsed.amountUsd, months[0], WINDOW_MONTHS)
    setValues(Object.fromEntries(next.map((m) => [m.month, String(m.amountUsd)])))
    setDistributed(true)
    const replaced = monthsToOverwrite(next, stored)
    if (replaced.length > 0) toast.info(`La distribución reemplaza ${replaced.length} mes(es) ya cargado(s) — se confirma antes de guardar`)
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (budget) {
        return insuranceBudgetsApi.update(budget.id, {
          expectedVersion: budget.version,
          ...(changes.length ? { months: changes } : {}),
          ...(notesChanged ? { notes: notesValue } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        })
      }
      return insuranceBudgetsApi.create({
        scopeType: level,
        scopeId,
        notes: notesValue,
        months: changes.filter((c): c is { month: string; amountUsd: number } => c.amountUsd !== null),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: insuranceBudgetKeys.all })
      toast.success('Presupuesto guardado — el cambio quedó registrado en el historial')
      onClose()
    },
    onError: (err: Error) => {
      const code = apiErrorCode(err)
      toast.error(err.message || 'No se pudo guardar el presupuesto')
      // Conflicto de versión o alta duplicada: recargar lo vigente. El
      // formulario se reinicia con la versión nueva (key) para revisar.
      if (code === BUDGET_VERSION_CONFLICT || code === 'BUDGET_ALREADY_EXISTS') {
        setConfirmOpen(false)
        queryClient.invalidateQueries({ queryKey: insuranceBudgetKeys.all })
      }
    },
  })

  function handleSave() {
    if (errors.length > 0) {
      toast.error('Corregí los importes marcados antes de guardar')
      return
    }
    if (changes.length === 0 && !notesChanged && budget) {
      toast.info('No hay cambios para guardar')
      return
    }
    if (distributed && overwritten.length > 0) {
      setConfirmOpen(true)
      return
    }
    mutation.mutate()
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Total anual a distribuir (USD)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={annual}
            onChange={(e) => setAnnual(e.target.value)}
            placeholder="Ej. 120000"
            className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button
          type="button"
          onClick={distribute}
          className="rounded-lg border border-brand-200 bg-white px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
        >
          Distribuir en 12 meses
        </button>
        <p className="text-[11px] text-slate-500">Reparte en partes iguales al centavo; el resto va al último mes. Después podés ajustar cada mes.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {parsed.map(({ month, parsed: p }) => {
          const previous = stored.get(month)
          const changed = changes.some((c) => c.month === month)
          return (
            <label key={month} className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                {monthLabel(month)}
                {changed && <span className="text-[10px] font-normal text-amber-700">modificado</span>}
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={values[month] ?? ''}
                onChange={(e) => setValues((prev) => ({ ...prev, [month]: e.target.value }))}
                placeholder="Sin presupuesto"
                aria-invalid={p.kind === 'invalid'}
                className={`w-full rounded-lg border px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 ${
                  p.kind === 'invalid' ? 'border-red-300 focus:ring-red-100' : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'
                }`}
              />
              {p.kind === 'invalid' ? (
                <span className="mt-0.5 block text-[11px] text-red-600">{p.message}</span>
              ) : changed && previous !== undefined ? (
                <span className="mt-0.5 block text-[11px] text-slate-400">antes: {usd(previous)}</span>
              ) : null}
            </label>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-slate-100 px-4 py-2.5 text-xs">
        <span className="text-slate-600">Total de la ventana (Σ meses): <span className="font-semibold text-slate-800 tabular-nums">{usd(windowTotal)}</span></span>
        <span className="text-slate-500">{definedCount} de {months.length} meses con presupuesto</span>
        {annualDiff !== null && (
          <span className={Math.abs(annualDiff) < 0.005 ? 'text-emerald-700' : 'text-amber-700'}>
            {Math.abs(annualDiff) < 0.005 ? 'Coincide con el total anual cargado' : `Diferencia con el total anual cargado: ${usd(annualDiff)}`}
          </span>
        )}
        <span className="text-slate-400">Vacío = sin presupuesto · 0 = presupuesto cero · los meses fuera de la ventana no se modifican</span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Notas del presupuesto</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Motivo del cambio (queda en el historial)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Opcional — ej. ajuste por renovación de flota"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {mutation.isPending ? 'Guardando…' : budget ? 'Guardar cambios' : 'Crear presupuesto'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reemplazar meses ya cargados"
        description={`La distribución reemplaza ${overwritten.length} mes(es) que ya tenían presupuesto. El valor anterior queda en el historial.`}
        confirmLabel="Reemplazar y guardar"
        danger={false}
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setConfirmOpen(false)}
      >
        <ul className="mt-2 max-h-48 overflow-y-auto text-xs text-slate-600">
          {overwritten.map((c) => (
            <li key={c.month} className="flex justify-between gap-4 py-0.5">
              <span>{monthLabel(c.month)}</span>
              <span className="tabular-nums">{usd(stored.get(c.month) ?? 0)} → {c.amountUsd === null ? 'sin presupuesto' : usd(c.amountUsd)}</span>
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </>
  )
}
