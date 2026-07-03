import { formatCurrencyFull } from '../../../../shared/utils/format'
import type { DocumentBalance } from '../../../../shared/types'

interface DocumentBalanceSummaryProps {
  balance: DocumentBalance
  currency: string
  hasPaymentStatus: boolean
}

// Extraído de la tarjeta "Saldo" de DocumentDetailPage — se reutiliza también
// en los formularios de Nota de Crédito/Débito para mostrar el saldo actual
// de la factura elegida antes de guardar (preview de impacto).
export function DocumentBalanceSummary({ balance, currency, hasPaymentStatus }: DocumentBalanceSummaryProps) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-slate-500">Monto original</span>
        <span className="font-medium text-slate-800 tabular-nums">
          {formatCurrencyFull(balance.originalAmount, currency)}
        </span>
      </div>
      {balance.appliedCredits !== 0 && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Notas de Crédito aplicadas</span>
          <span className="font-medium text-red-600 tabular-nums">
            -{formatCurrencyFull(balance.appliedCredits, currency)}
          </span>
        </div>
      )}
      {balance.appliedDebits !== 0 && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Notas de Débito aplicadas</span>
          <span className="font-medium text-emerald-600 tabular-nums">
            +{formatCurrencyFull(balance.appliedDebits, currency)}
          </span>
        </div>
      )}
      {balance.appliedAdjustments !== 0 && (
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Ajustes aplicados</span>
          <span className={`font-medium tabular-nums ${balance.appliedAdjustments < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {balance.appliedAdjustments > 0 ? '+' : ''}
            {formatCurrencyFull(balance.appliedAdjustments, currency)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        <span className="font-semibold text-slate-700">Monto efectivo</span>
        <span className="font-bold text-slate-900 tabular-nums">
          {formatCurrencyFull(balance.effectiveAmount, currency)}
        </span>
      </div>
      {hasPaymentStatus && (
        <>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Pagado</span>
            <span className="font-medium text-slate-800 tabular-nums">
              {formatCurrencyFull(balance.paidAmount, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="font-semibold text-slate-700">Saldo pendiente</span>
            <span className="font-bold text-amber-700 tabular-nums">
              {formatCurrencyFull(balance.outstandingBalance, currency)}
            </span>
          </div>
          {balance.creditBalance > 0 && (
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Saldo a favor</span>
              <span className="font-bold text-emerald-700 tabular-nums">
                {formatCurrencyFull(balance.creditBalance, currency)}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}
