import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Receipt, Pencil, Trash2, X, Loader2 } from 'lucide-react'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { ConfirmDialog } from '../../shared/components/dialogs/ConfirmDialog'
import { FormField, FormInput } from '../../shared/components/forms/FormSection'
import { claimsApi } from '../../shared/api/claims.api'
import { formatCurrencyFull, formatDate } from '../../shared/utils/format'
import type { ClaimExpense } from '../../shared/types'

interface ClaimExpensesCardProps {
  claimId: string
  claimedAmountArs: number
}

function rowTotal(e: ClaimExpense): number {
  return e.netAmount + e.vatAmount + e.otherTaxesAmount
}

export function ClaimExpensesCard({ claimId, claimedAmountArs }: ClaimExpensesCardProps) {
  const queryClient = useQueryClient()
  const expensesKey = ['claims', claimId, 'expenses'] as const

  const { data: expenses = [] } = useQuery({
    queryKey: expensesKey,
    queryFn: () => claimsApi.findExpenses(claimId),
    enabled: !!claimId,
  })

  const [showModal, setShowModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ClaimExpense | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: expensesKey })
    queryClient.invalidateQueries({ queryKey: ['claims', claimId, 'events'] })
  }

  const deleteMutation = useMutation({
    mutationFn: (expenseId: string) => claimsApi.deleteExpense(claimId, expenseId),
    onSuccess: invalidate,
  })

  const totalGastos = expenses.reduce((sum, e) => sum + rowTotal(e), 0)
  const exceedsClaimed = totalGastos > claimedAmountArs

  return (
    <SectionCard
      title="Gastos del Siniestro"
      subtitle="Mano de obra, repuestos y otros gastos reales del siniestro"
      actions={
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={14} />
          Agregar gasto
        </button>
      }
    >
      {expenses.length === 0 ? (
        <EmptyState
          title="Sin gastos cargados"
          description="Registrá los gastos reales para comparar contra el monto denunciado al seguro."
          icon={Receipt}
          action={
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Plus size={14} />
              Agregar primer gasto
            </button>
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/80">
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Fecha</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Proveedor</th>
                  <th className="text-left px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Comprobante</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Neto</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">IVA</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Impuestos</th>
                  <th className="text-right px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total</th>
                  <th className="px-4 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50/60 transition-colors group">
                    <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDate(e.date)}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{e.provider}</td>
                    <td className="px-4 py-3 text-slate-500">{e.receiptNumber || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatCurrencyFull(e.netAmount, 'ARS')}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatCurrencyFull(e.vatAmount, 'ARS')}</td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">{formatCurrencyFull(e.otherTaxesAmount, 'ARS')}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{formatCurrencyFull(rowTotal(e), 'ARS')}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          title="Editar gasto"
                          onClick={() => setEditingExpense(e)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar gasto"
                          onClick={() => setPendingDeleteId(e.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Gastos</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{formatCurrencyFull(totalGastos, 'ARS')}</span>
            </div>
            <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
              exceedsClaimed ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
            }`}>
              <span className={`text-xs font-semibold uppercase tracking-wider ${exceedsClaimed ? 'text-red-600' : 'text-emerald-600'}`}>
                {exceedsClaimed ? 'Excede lo reclamado' : 'Dentro de lo reclamado'}
              </span>
              <span className={`text-sm font-bold tabular-nums ${exceedsClaimed ? 'text-red-700' : 'text-emerald-700'}`}>
                {exceedsClaimed
                  ? `+${formatCurrencyFull(totalGastos - claimedAmountArs, 'ARS')}`
                  : formatCurrencyFull(claimedAmountArs - totalGastos, 'ARS')}
              </span>
            </div>
          </div>
        </>
      )}

      {(showModal || editingExpense) && (
        <ExpenseFormModal
          claimId={claimId}
          expense={editingExpense}
          onClose={() => { setShowModal(false); setEditingExpense(null) }}
          onSuccess={invalidate}
        />
      )}

      <ConfirmDialog
        open={!!pendingDeleteId}
        title="Eliminar gasto"
        description="Esta acción no se puede deshacer. Si el monto es incorrecto, podés cargarlo de nuevo."
        confirmLabel="Eliminar"
        danger
        onCancel={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId) deleteMutation.mutate(pendingDeleteId)
          setPendingDeleteId(null)
        }}
      />
    </SectionCard>
  )
}

// ── Add/Edit Expense Modal ─────────────────────────────────────────────────────

interface ExpenseFormModalProps {
  claimId: string
  expense: ClaimExpense | null
  onClose: () => void
  onSuccess: () => void
}

function todayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function ExpenseFormModal({ claimId, expense, onClose, onSuccess }: ExpenseFormModalProps) {
  const isEditing = !!expense
  const [date, setDate] = useState(expense?.date ?? todayLocal())
  const [provider, setProvider] = useState(expense?.provider ?? '')
  const [receiptNumber, setReceiptNumber] = useState(expense?.receiptNumber ?? '')
  const [netAmount, setNetAmount] = useState(expense ? String(expense.netAmount) : '')
  const [vatAmount, setVatAmount] = useState(expense ? String(expense.vatAmount) : '0')
  const [otherTaxesAmount, setOtherTaxesAmount] = useState(expense ? String(expense.otherTaxesAmount) : '0')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const total = (parseFloat(netAmount) || 0) + (parseFloat(vatAmount) || 0) + (parseFloat(otherTaxesAmount) || 0)

  const validate = (): boolean => {
    const e: Record<string, string> = {}
    if (!date) e.date = 'Ingresá la fecha.'
    if (!provider.trim()) e.provider = 'Ingresá el proveedor.'
    if (!netAmount || isNaN(Number(netAmount)) || Number(netAmount) < 0) e.netAmount = 'Ingresá un monto neto válido.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setSubmitting(true)
    setSubmitError(null)
    const payload = {
      date,
      provider: provider.trim(),
      receiptNumber: receiptNumber.trim() || undefined,
      netAmount: parseFloat(netAmount) || 0,
      vatAmount: parseFloat(vatAmount) || 0,
      otherTaxesAmount: parseFloat(otherTaxesAmount) || 0,
    }
    try {
      if (isEditing) {
        await claimsApi.updateExpense(claimId, expense!.id, payload)
      } else {
        await claimsApi.addExpense(claimId, payload)
      }
      onSuccess()
      onClose()
    } catch {
      setSubmitError('No se pudo guardar el gasto. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <Receipt size={16} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">{isEditing ? 'Editar gasto' : 'Agregar gasto'}</h3>
              <p className="text-xs text-slate-500">
                {isEditing ? 'Corregí los datos del gasto' : 'Cargá un gasto real del siniestro'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Fecha" required error={errors.date}>
              <FormInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Proveedor" required error={errors.provider}>
              <FormInput
                type="text"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="Ej: Taller Scania Cordoba"
              />
            </FormField>
            <FormField label="N° de Comprobante" fullWidth>
              <FormInput
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="Ej: FC-0001-00023456"
              />
            </FormField>
            <FormField label="Monto Neto" required error={errors.netAmount}>
              <FormInput type="number" min="0" step="0.01" placeholder="0" value={netAmount} onChange={(e) => setNetAmount(e.target.value)} />
            </FormField>
            <FormField label="IVA">
              <FormInput type="number" min="0" step="0.01" placeholder="0" value={vatAmount} onChange={(e) => setVatAmount(e.target.value)} />
            </FormField>
            <FormField label="Otros Impuestos">
              <FormInput type="number" min="0" step="0.01" placeholder="0" value={otherTaxesAmount} onChange={(e) => setOtherTaxesAmount(e.target.value)} />
            </FormField>
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{formatCurrencyFull(total, 'ARS')}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50">
          {submitError && (
            <div className="px-6 pt-3 text-xs text-red-600">{submitError}</div>
          )}
          <div className="flex items-center justify-end gap-2.5 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {submitting ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Guardar gasto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
