import { useState } from 'react'
import clsx from 'clsx'
import { Receipt, ChevronDown, ChevronUp, FileEdit, TrendingDown, TrendingUp, CheckCircle2 } from 'lucide-react'
import { StatusPill } from '../../../../shared/components/badges/StatusPill'
import { InstallmentRow } from '../../../../shared/components/installments/InstallmentRow'
import { formatDate } from '../../../../shared/utils/format'
import { getDirectionSign, type TypeDirectionMap } from '../../../../shared/utils/policyInvoicedTotal'
import { DOCUMENT_TYPE_LABELS } from '../../../../shared/constants'
import type { AccountingDocument, Installment, InstallmentUpdate } from '../../../../shared/types'

export function FacturaCard({
  factura,
  installments,
  linkedMods,
  modInstallments,
  typeDefsByKey,
  onInstallmentUpdate,
}: {
  factura: AccountingDocument
  installments: Installment[]
  linkedMods: AccountingDocument[]
  modInstallments: Map<string, Installment[]>
  typeDefsByKey: TypeDirectionMap
  onInstallmentUpdate: (docId: string, instId: string, updates: InstallmentUpdate) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const currency = factura.currency === 'USD' ? 'US$' : 'AR$'

  // Un NC/ND/Refacturación vinculado podría, en teoría, haberse cargado en
  // otra moneda que la factura — cada documento y cuota ya tiene su propio
  // cierre en ambas monedas, así que para sumarlos junto al total de la
  // factura se toma de cada uno la columna que coincide con la moneda de la
  // factura, nunca el monto crudo (que podría estar en la otra moneda).
  function pickDocAmount(doc: AccountingDocument): number {
    return factura.currency === 'ARS' ? (doc.totalAmountArs ?? doc.totalAmount) : (doc.totalAmountUsd ?? doc.totalAmount)
  }
  function pickInstAmount(inst: Installment): number {
    return factura.currency === 'ARS' ? (inst.amountArs ?? inst.amount) : (inst.amountUsd ?? inst.amount)
  }

  // Solo los vinculados ya APLICADOS afectan de verdad el total de la
  // factura (mismo criterio que documents-balance.service.ts en el backend)
  // — uno ISSUED todavía no tuvo efecto, uno CANCELLED lo tuvo y se
  // revirtió. Antes se sumaban todos por igual, sin mirar el signo ni el
  // estado, lo que hacía que una Nota de Crédito (que debería restar)
  // terminara subiendo el "Neto ajustado", y que una NC anulada siguiera
  // contando como si estuviera vigente.
  const appliedMods = linkedMods.filter((m) => m.documentStatus === 'APPLIED')
  function signedModAmount(m: AccountingDocument): number {
    return Math.abs(pickDocAmount(m)) * getDirectionSign(m, typeDefsByKey)
  }

  const modSum = appliedMods.reduce((sum, m) => sum + signedModAmount(m), 0)
  const netTotal = factura.totalAmount + modSum
  const paidCount = installments.filter((i) => i.paymentStatus === 'PAID').length
  const pendingCount = installments.length - paidCount
  const today = new Date().toISOString().slice(0, 10)

  const saldo =
    installments.filter((i) => i.paymentStatus !== 'PAID').reduce((sum, i) => sum + Math.abs(i.amount), 0) +
    Array.from(modInstallments.values())
      .flat()
      .filter((i) => i.paymentStatus !== 'PAID')
      .reduce((sum, i) => sum + Math.abs(pickInstAmount(i)), 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Receipt size={15} className="text-brand-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 font-mono tracking-wide">
                {factura.documentNumber}
              </p>
              <span className="text-xs text-slate-400">·</span>
              <p className="text-xs text-slate-500">{formatDate(factura.issueDate)}</p>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {installments.length} cuota{installments.length !== 1 ? 's' : ''}
              {paidCount > 0 && ` · ${paidCount} pagada${paidCount !== 1 ? 's' : ''}`}
              {pendingCount > 0 && ` · ${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
              {linkedMods.length > 0 && ` · ${linkedMods.length} modificación${linkedMods.length !== 1 ? 'es' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {appliedMods.length > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
                Neto ajustado
              </p>
              <p className="text-sm font-bold text-slate-900 tabular-nums">
                {currency}{' '}
                {netTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wider leading-tight">
              Total factura
            </p>
            <p className={clsx(
              'text-sm font-semibold tabular-nums',
              appliedMods.length > 0 ? 'text-slate-400 line-through decoration-slate-300' : 'text-slate-800',
            )}>
              {currency}{' '}
              {factura.totalAmount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <StatusPill status={factura.paymentStatus} size="sm" />
          {expanded
            ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0" />
            : <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />
          }
        </div>
      </button>

      {expanded && (
        <>
          <div className="border-t border-slate-100">
            <div className="px-5 py-2 bg-slate-50/70">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Cuotas originales ({installments.length})
              </p>
            </div>
            {installments.length === 0 ? (
              <p className="text-xs text-slate-400 px-5 py-3 italic">Sin cuotas registradas.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {installments.map((inst) => (
                  <InstallmentRow
                    key={inst.id}
                    inst={inst}
                    currency={currency}
                    today={today}
                    defaultPaymentMethod={factura.paymentMethod}
                    onUpdate={(updates) => onInstallmentUpdate(factura.id, inst.id, updates)}
                  />
                ))}
              </div>
            )}
          </div>

          {linkedMods.map((mod) => {
            // signo -1 resta (NC, Ajuste negativo, o Endoso que reduce costo),
            // +1 suma (ND, Ajuste positivo, o Endoso que aumenta costo).
            const sign = getDirectionSign(mod, typeDefsByKey)
            const isCredit = sign < 0
            const isNeutral = sign === 0
            const mInst = modInstallments.get(mod.id) ?? []
            const modCurrency = mod.currency === 'USD' ? 'US$' : 'AR$'
            return (
              <div key={mod.id} className="border-t border-slate-200">
                <div className={clsx(
                  'flex items-center gap-3 px-5 py-3',
                  isNeutral ? 'bg-slate-50/60' : isCredit ? 'bg-red-50/50' : 'bg-emerald-50/40',
                )}>
                  <div className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                    isNeutral ? 'bg-slate-100' : isCredit ? 'bg-red-100' : 'bg-emerald-100',
                  )}>
                    {isNeutral
                      ? <FileEdit size={13} className="text-slate-400" />
                      : isCredit
                        ? <TrendingDown size={13} className="text-red-500" />
                        : <TrendingUp size={13} className="text-emerald-600" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-slate-700 font-mono">{mod.documentNumber}</p>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                        isNeutral ? 'bg-slate-100 text-slate-500' : isCredit ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700',
                      )}>
                        {DOCUMENT_TYPE_LABELS[mod.documentType] ?? mod.documentType}
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <p className="text-xs text-slate-500">{formatDate(mod.issueDate)}</p>
                    </div>
                    {mInst.length > 0 && (
                      <p className="text-xs text-slate-400 mt-0.5">
                        {mInst.length} cuota{mInst.length !== 1 ? 's' : ''} adicional{mInst.length !== 1 ? 'es' : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p className={clsx(
                      'text-sm font-bold tabular-nums',
                      isNeutral ? 'text-slate-500' : isCredit ? 'text-red-600' : 'text-emerald-700',
                    )}>
                      {isNeutral ? '' : isCredit ? '−' : '+'}{modCurrency}{' '}
                      {Math.abs(mod.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    {/* documentStatus (Emitida/Aplicada/Cancelada), no paymentStatus —
                        un NC/ND siempre tiene paymentStatus "No aplica", así que mostrar
                        eso acá nunca le decía al usuario si el documento realmente ya
                        había afectado la factura o no. */}
                    <StatusPill status={mod.documentStatus} size="sm" />
                  </div>
                </div>
                {mInst.length > 0 && (
                  <div className="divide-y divide-slate-50 bg-slate-50/30">
                    {mInst.map((inst) => (
                      <InstallmentRow
                        key={inst.id}
                        inst={inst}
                        currency={modCurrency}
                        today={today}
                        defaultPaymentMethod={mod.paymentMethod}
                        indent
                        onUpdate={(updates) => onInstallmentUpdate(mod.id, inst.id, updates)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {(saldo > 0 || linkedMods.length > 0) && (
            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-4 bg-slate-50 flex-wrap">
              {/* Saldo pendiente */}
              {saldo > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Saldo pendiente</span>
                  <span className="text-sm font-bold text-amber-600 tabular-nums">
                    {currency}{' '}
                    {saldo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-xs font-semibold text-emerald-600">Todo pagado</span>
                </div>
              )}
              {/* Neto ajustado (solo si hay modificaciones ya aplicadas) */}
              {appliedMods.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">Neto ajustado</span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">
                    {currency}{' '}
                    {netTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
