import { Plus, Trash2 } from 'lucide-react'
import { FormSelect, FormInput } from './FormSection'
import type { Policy } from '../../types'

export interface PolicyAllocationRow {
  id: string
  policyId: string
  allocatedAmount: string
}

export function createEmptyPolicyRow(): PolicyAllocationRow {
  return { id: crypto.randomUUID(), policyId: '', allocatedAmount: '' }
}

interface PolicySelectorSingleProps {
  mode: 'single'
  policies: Policy[]
  value: string
  onChange: (policyId: string) => void
  emptyMessage?: string
}

interface PolicySelectorMultiProps {
  mode: 'multi'
  policies: Policy[]
  rows: PolicyAllocationRow[]
  onRowsChange: (rows: PolicyAllocationRow[]) => void
  currencyPrefix: string
  emptyMessage?: string
}

type PolicySelectorProps = PolicySelectorSingleProps | PolicySelectorMultiProps

// Selector de pólizas con dos modos: single (Endoso — una póliza obligatoria)
// y multi (Factura — varias pólizas con distribución de importe). Reemplaza
// la lógica que antes vivía duplicada en DocumentNewPage/DocumentEditPage.
export function PolicySelector(props: PolicySelectorProps) {
  if (props.policies.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
        <p className="text-sm text-slate-400">
          {props.emptyMessage ?? 'No hay pólizas activas disponibles.'}
        </p>
      </div>
    )
  }

  if (props.mode === 'single') {
    return (
      <FormSelect value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        <option value="">Seleccionar póliza…</option>
        {props.policies.map((p) => (
          <option key={p.id} value={p.id}>
            {p.policyNumber} — {p.insuranceType}
          </option>
        ))}
      </FormSelect>
    )
  }

  const { policies, rows, onRowsChange, currencyPrefix } = props
  const totalAllocated = rows.reduce((s, r) => s + (parseFloat(r.allocatedAmount) || 0), 0)

  const updateRow = (rowId: string, field: 'policyId' | 'allocatedAmount', value: string) => {
    onRowsChange(rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)))
  }
  const addRow = () => onRowsChange([...rows, createEmptyPolicyRow()])
  const removeRow = (rowId: string) => onRowsChange(rows.filter((r) => r.id !== rowId))

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Póliza</span>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
          Importe asignado
        </span>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">
          Participación
        </span>
        <span />
      </div>

      {rows.map((row) => {
        const allocated = parseFloat(row.allocatedAmount) || 0
        const pct = totalAllocated > 0 ? (allocated / totalAllocated) * 100 : 0
        return (
          <div key={row.id} className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center">
            <FormSelect
              value={row.policyId}
              onChange={(e) => updateRow(row.id, 'policyId', e.target.value)}
            >
              <option value="">Seleccionar póliza…</option>
              {policies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.policyNumber} — {p.insuranceType}
                </option>
              ))}
            </FormSelect>

            <FormInput
              type="number"
              placeholder="0.00"
              value={row.allocatedAmount}
              onChange={(e) => updateRow(row.id, 'allocatedAmount', e.target.value)}
              min="0"
              step="0.01"
              className="text-right"
            />

            <div className="flex items-center gap-1.5 justify-end">
              <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-slate-600 tabular-nums w-10 text-right">
                {pct.toFixed(1).replace('.', ',')}%
              </span>
            </div>

            <button
              type="button"
              onClick={() => removeRow(row.id)}
              disabled={rows.length === 1}
              className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed rounded"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )
      })}

      {rows.length > 1 && (
        <div className="grid grid-cols-[1fr_160px_100px_32px] gap-3 items-center pt-2 border-t border-slate-100">
          <span className="text-xs font-semibold text-slate-500 pl-1">Total asignado</span>
          <span className="text-xs font-bold text-slate-800 tabular-nums text-right pr-1">
            {currencyPrefix}{' '}
            {totalAllocated.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-xs font-bold text-brand-600 text-right pr-1">100%</span>
          <span />
        </div>
      )}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
      >
        <Plus size={13} />
        Agregar póliza
      </button>
    </div>
  )
}
