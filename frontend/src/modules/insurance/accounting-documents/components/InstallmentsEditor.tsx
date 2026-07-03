import { Calculator } from 'lucide-react'
import { FormInput } from '../../../../shared/components/forms/FormSection'

export interface InstallmentRowData {
  installmentNumber: number
  dueDate: string
  amount: string
}

export function createInitialInstallmentRows(): InstallmentRowData[] {
  return [{ installmentNumber: 1, dueDate: '', amount: '' }]
}

interface InstallmentsEditorProps {
  count: number
  rows: InstallmentRowData[]
  computedTotal: number
  currencyPrefix: string
  onChange: (count: number, rows: InstallmentRowData[]) => void
}

// Editor de cuotas compartido por Factura, Nota de Débito y Refacturación —
// los únicos tres tipos con hasInstallments: true (ver document-types.ts).
export function InstallmentsEditor({ count, rows, computedTotal, currencyPrefix, onChange }: InstallmentsEditorProps) {
  const rebuild = (newCount: number, total: number) => {
    const per = newCount > 0 && total > 0 ? total / newCount : 0
    const newRows: InstallmentRowData[] = Array.from({ length: newCount }, (_, i) => ({
      installmentNumber: i + 1,
      dueDate: rows[i]?.dueDate ?? '',
      amount: per > 0 ? per.toFixed(2) : '',
    }))
    onChange(newCount, newRows)
  }

  const handleCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newCount = Math.max(1, Math.min(60, parseInt(e.target.value) || 1))
    rebuild(newCount, computedTotal)
  }

  const handleAutoDistribute = () => rebuild(count, computedTotal)

  const updateRow = (idx: number, field: 'dueDate' | 'amount', value: string) => {
    onChange(count, rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)))
  }

  return (
    <div>
      <div className="flex items-end gap-4 mb-5 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Cantidad de cuotas</label>
          <FormInput
            type="number"
            value={String(count)}
            onChange={handleCountChange}
            min="1"
            max="60"
            className="w-28"
          />
        </div>
        <button
          type="button"
          onClick={handleAutoDistribute}
          disabled={computedTotal <= 0}
          className="flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Calculator size={13} />
          Distribuir automáticamente
        </button>
        {computedTotal > 0 && count > 0 && (
          <p className="text-xs text-slate-400">
            {currencyPrefix}{' '}
            {(computedTotal / count).toLocaleString('es-AR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{' '}
            por cuota
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[40px_1fr_1fr] gap-3 px-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">N°</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vencimiento</span>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Importe</span>
        </div>

        {rows.map((row, idx) => (
          <div key={row.installmentNumber} className="grid grid-cols-[40px_1fr_1fr] gap-3 items-center">
            <span className="text-xs font-bold text-slate-400 tabular-nums text-center">
              {String(row.installmentNumber).padStart(2, '0')}
            </span>
            <FormInput
              type="date"
              value={row.dueDate}
              onChange={(e) => updateRow(idx, 'dueDate', e.target.value)}
            />
            <FormInput
              type="number"
              placeholder="0.00"
              value={row.amount}
              onChange={(e) => updateRow(idx, 'amount', e.target.value)}
              min="0"
              step="0.01"
              className="text-right"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
