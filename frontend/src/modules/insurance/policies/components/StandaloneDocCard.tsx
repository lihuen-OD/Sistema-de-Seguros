import { useState } from 'react'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, TrendingDown, TrendingUp } from 'lucide-react'
import { StatusPill } from '../../../../shared/components/badges/StatusPill'
import { InstallmentRow } from '../../../../shared/components/installments/InstallmentRow'
import { formatDate } from '../../../../shared/utils/format'
import { DOCUMENT_TYPE_LABELS } from '../../../../shared/constants'
import type { AccountingDocument, Installment, InstallmentUpdate } from '../../../../shared/types'

export function StandaloneDocCard({
  doc,
  installments,
  onInstallmentUpdate,
}: {
  doc: AccountingDocument
  installments: Installment[]
  onInstallmentUpdate: (docId: string, instId: string, updates: InstallmentUpdate) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const currency = doc.currency === 'USD' ? 'US$' : 'AR$'
  const isNC = doc.documentType === 'CREDIT_NOTE'
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className={clsx(
      'rounded-xl border overflow-hidden shadow-sm',
      isNC ? 'border-red-100 bg-red-50/20' : 'border-amber-100 bg-amber-50/20',
    )}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isNC ? 'bg-red-100' : 'bg-amber-100',
          )}>
            {isNC
              ? <TrendingDown size={15} className="text-red-500" />
              : <TrendingUp size={15} className="text-amber-600" />
            }
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-slate-800 font-mono">{doc.documentNumber}</p>
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded font-semibold',
                isNC ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700',
              )}>
                {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>
              <span className="text-xs text-slate-400">·</span>
              <p className="text-xs text-slate-500">{formatDate(doc.issueDate)}</p>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {installments.length} cuota{installments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <p className={clsx(
            'text-sm font-bold tabular-nums',
            isNC ? 'text-red-600' : 'text-amber-700',
          )}>
            {currency}{' '}
            {Math.abs(doc.totalAmount).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <StatusPill status={doc.paymentStatus} size="sm" />
          {expanded
            ? <ChevronUp size={15} className="text-slate-400 flex-shrink-0" />
            : <ChevronDown size={15} className="text-slate-400 flex-shrink-0" />
          }
        </div>
      </button>
      {expanded && installments.length > 0 && (
        <div className="border-t border-slate-200 divide-y divide-slate-50 bg-white/40">
          {installments.map((inst) => (
            <InstallmentRow
              key={inst.id}
              inst={inst}
              currency={currency}
              today={today}
              defaultPaymentMethod={doc.paymentMethod}
              onUpdate={(updates) => onInstallmentUpdate(doc.id, inst.id, updates)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
