import { Plus, Trash2, Check, Hash } from 'lucide-react'
import clsx from 'clsx'
import { useQuery } from '@tanstack/react-query'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { SearchableSelect } from '../../../shared/components/forms/SearchableSelect'
import type { AssetAllocation } from '../../../shared/types'

interface AllocationEditorProps {
  allocations: AssetAllocation[]
  onChange: (v: AssetAllocation[]) => void
}

export function AllocationEditor({ allocations, onChange }: AllocationEditorProps) {
  const { data: allCostCenters = [] } = useQuery(costCenterQueries.list())
  const { data: allCompanies = [] } = useQuery(companyQueries.list())

  const activeCostCenters = allCostCenters.filter((cc) => cc.status === 'activo')
  const activeCompanies = allCompanies.filter((c) => c.status === 'activo')

  function add() {
    onChange([...allocations, { id: `alloc-${Date.now()}`, companyId: '', costCenterId: '', percentage: 0 }])
  }

  function remove(id: string) {
    onChange(allocations.filter((a) => a.id !== id))
  }

  function update(id: string, field: keyof Omit<AssetAllocation, 'id'>, value: string | number) {
    onChange(allocations.map((a) => a.id === id ? { ...a, [field]: value } : a))
  }

  const total = allocations.reduce((sum, a) => sum + (Number(a.percentage) || 0), 0)
  const incompleteCount = allocations.filter((a) => !a.companyId || !a.costCenterId).length
  const isTotalValid = total === 100
  const isValid = isTotalValid && incompleteCount === 0

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Imputación por empresa y centro de costo</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Asigná empresa, centro de costo y porcentaje de imputación. Los porcentajes deben sumar 100%.
          </p>
        </div>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-brand-600 border border-brand-200 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>

      {allocations.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <Hash size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin asignación contable</p>
          <button type="button" onClick={add} className="mt-2 text-sm text-brand-600 hover:text-brand-700 font-medium">
            + Agregar imputación
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {allocations.map((alloc) => (
            <div key={alloc.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex items-end gap-2">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
                  <select
                    value={alloc.companyId}
                    onChange={(e) => update(alloc.id, 'companyId', e.target.value)}
                    className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">Seleccionar…</option>
                    {activeCompanies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Centro de Costo</label>
                  <SearchableSelect
                    value={alloc.costCenterId}
                    onChange={(v) => update(alloc.id, 'costCenterId', v)}
                    placeholder="Seleccionar…"
                    searchPlaceholder="Buscar por código o nombre…"
                    emptyOptionLabel="Seleccionar…"
                    options={activeCostCenters.map((cc) => ({ value: cc.id, label: cc.code, sublabel: cc.name }))}
                  />
                </div>
                <div className="w-28 flex-shrink-0">
                  <label className="block text-xs font-medium text-slate-500 mb-1">% Imputación</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={alloc.percentage || ''}
                      onChange={(e) => update(alloc.id, 'percentage', parseInt(e.target.value) || 0)}
                      className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2.5 pr-6 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder="0"
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                  </div>
                </div>
                {allocations.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => remove(alloc.id)}
                    className="mb-0.5 p-2 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : (
                  <div className="w-7 flex-shrink-0" />
                )}
              </div>
            </div>
          ))}
          <div className={clsx(
            'flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold',
            isValid ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50',
          )}>
            <span>
              {incompleteCount > 0 && (
                <>
                  {incompleteCount === 1 ? 'Falta elegir empresa y/o centro de costo en 1 fila' : `Faltan elegir empresa y/o centro de costo en ${incompleteCount} filas`}
                </>
              )}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              <span>Total: {total}%</span>
              {isValid ? <Check size={14} /> : <span className="text-xs font-normal">{!isTotalValid && '(debe ser 100%)'}</span>}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
