import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Clock, AlertTriangle, Check, X } from 'lucide-react'
import clsx from 'clsx'
import { formatDate } from '../../utils/format'
import { exchangeRateQueries } from '../../api/exchange-rate.api'
import { catalogQueries } from '../../api/catalogs.api'
import type { Installment, InstallmentUpdate } from '../../types'

interface InstallmentRowProps {
  inst: Installment
  currency: string
  today: string
  defaultPaymentMethod?: string | null
  indent?: boolean
  onUpdate: (updates: InstallmentUpdate) => void
}

export function InstallmentRow({
  inst,
  currency,
  today,
  defaultPaymentMethod,
  indent = false,
  onUpdate,
}: InstallmentRowProps) {
  const { data: currentRate } = useQuery(exchangeRateQueries.current())
  const { data: paymentMethods = [] } = useQuery(catalogQueries.byCategory('document_payment_method'))

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editAmount, setEditAmount] = useState(String(Math.abs(inst.amount)))
  const [editStatus, setEditStatus] = useState<Installment['paymentStatus']>(inst.paymentStatus)
  const [editPaidAt, setEditPaidAt] = useState(inst.paidAt ?? today)
  const [editDueDate, setEditDueDate] = useState(inst.dueDate)
  const [editExchangeRate, setEditExchangeRate] = useState(currentRate?.rate != null ? String(currentRate.rate) : '')
  const [editPaymentMethod, setEditPaymentMethod] = useState(
    inst.paymentMethod ?? defaultPaymentMethod ?? '',
  )

  const isPaid = inst.paymentStatus === 'PAID'
  const isOverdue = !isPaid && inst.dueDate < today

  const openEdit = () => {
    setEditAmount(String(Math.abs(inst.amount)))
    setEditStatus(inst.paymentStatus)
    setEditPaidAt(inst.paidAt ?? today)
    setEditDueDate(inst.dueDate)
    setEditExchangeRate(currentRate?.rate != null ? String(currentRate.rate) : '')
    setEditPaymentMethod(inst.paymentMethod ?? defaultPaymentMethod ?? '')
    setMode('edit')
  }

  const handleConfirm = () => {
    const parsedAmount = parseFloat(editAmount) || Math.abs(inst.amount)
    onUpdate({
      amount: inst.amount < 0 ? -parsedAmount : parsedAmount,
      paymentStatus: editStatus,
      paidAt: editStatus === 'PAID' ? editPaidAt : null,
      dueDate: editDueDate,
      paymentMethod: editStatus === 'PAID' ? editPaymentMethod : null,
      exchangeRate: editStatus === 'PAID' ? parseFloat(editExchangeRate) : undefined,
    })
    setMode('view')
  }

  if (mode === 'edit') {
    return (
      <div className={clsx('px-5 py-3 bg-brand-50/60 border-b border-brand-100', indent && 'pl-14')}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-2.5">
          Cuota {String(inst.installmentNumber).padStart(2, '0')} — editar
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Vencimiento</label>
            <input
              type="date"
              value={editDueDate}
              onChange={(e) => setEditDueDate(e.target.value)}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Importe</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                {currency.replace('$', '')}$
              </span>
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                min="0"
                step="0.01"
                className="w-full text-xs pl-10 pr-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 block mb-1">Estado</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as Installment['paymentStatus'])}
              className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="PENDING">Pendiente</option>
              <option value="PAID">Pagado</option>
              <option value="PARTIALLY_PAID">Parcial</option>
            </select>
          </div>
          {editStatus === 'PAID' && (
            <>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Fecha de pago</label>
                <input
                  type="date"
                  value={editPaidAt}
                  onChange={(e) => setEditPaidAt(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Tipo de Cambio</label>
                <input
                  type="number"
                  value={editExchangeRate}
                  onChange={(e) => setEditExchangeRate(e.target.value)}
                  min="0.01"
                  step="0.01"
                  required
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Medio de pago</label>
                <select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  required
                  className="w-full text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">Seleccionar…</option>
                  {paymentMethods.map((method) => (
                    <option key={method.id} value={method.label}>{method.label}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={editStatus === 'PAID' && (!editPaymentMethod || !editExchangeRate || parseFloat(editExchangeRate) <= 0)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Check size={11} />
            Confirmar
          </button>
          <button
            type="button"
            onClick={() => setMode('view')}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-white text-xs font-medium rounded-lg transition-colors"
          >
            <X size={11} />
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('group flex items-center justify-between gap-3 px-5 py-2.5', indent && 'pl-14')}>
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[11px] font-mono font-semibold text-slate-400 w-5 flex-shrink-0 tabular-nums">
          {String(inst.installmentNumber).padStart(2, '0')}
        </span>
        <span className="text-xs text-slate-600">{formatDate(inst.dueDate)}</span>
        {inst.paidAt && (
          <span className="text-xs text-slate-400 hidden sm:block">
            Pagado {formatDate(inst.paidAt)}
          </span>
        )}
        {isPaid && inst.paymentMethod && (
          <span className="text-xs text-slate-400 hidden lg:block">
            · {inst.paymentMethod}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span className="text-xs font-semibold text-slate-700 tabular-nums">
          {currency}{' '}
          {Math.abs(inst.amount).toLocaleString('es-AR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <div
          className={clsx(
            'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
            isPaid
              ? 'bg-emerald-50 text-emerald-700'
              : isOverdue
                ? 'bg-red-50 text-red-600'
                : 'bg-amber-50 text-amber-700',
          )}
        >
          {isPaid ? (
            <CheckCircle2 size={9} />
          ) : isOverdue ? (
            <AlertTriangle size={9} />
          ) : (
            <Clock size={9} />
          )}
          <span>{isPaid ? 'Pagado' : isOverdue ? 'Vencido' : 'Pendiente'}</span>
        </div>
        <button
          type="button"
          onClick={openEdit}
          className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-[11px] font-medium text-brand-600 hover:text-brand-700 px-2 py-0.5 rounded-md hover:bg-brand-50 whitespace-nowrap"
        >
          {isPaid ? 'Editar' : 'Registrar pago'}
        </button>
      </div>
    </div>
  )
}
