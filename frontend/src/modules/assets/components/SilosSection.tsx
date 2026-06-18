import { Plus, Trash2, Wheat } from 'lucide-react'
import { FormSelect } from '../../../shared/components/forms/FormSection'
import { SILO_CONTENTS } from '../../../shared/constants'
import type { Silo } from '../../../shared/types'

interface SilosSectionProps {
  silos: Silo[]
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, field: keyof Omit<Silo, 'id'>, value: string | number) => void
}

export function SilosSection({ silos, onAdd, onRemove, onChange }: SilosSectionProps) {
  const totalTons = silos.reduce((sum, s) => sum + (Number(s.capacityTons) || 0), 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">Silos / Celdas</p>
          <p className="text-xs text-slate-500 mt-0.5">Registrá los silos con su capacidad y contenido</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <Plus size={14} />
          Agregar silo
        </button>
      </div>

      {silos.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center">
          <Wheat size={20} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Sin silos registrados</p>
          <button type="button" onClick={onAdd} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Agregar primer silo
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {silos.map((silo, idx) => (
            <div key={silo.id} className="flex items-end gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center">
                <span className="text-xs font-semibold text-slate-500">{idx + 1}</span>
              </div>
              <div className="w-36 flex-shrink-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">Capacidad (toneladas)</label>
                <input
                  type="number"
                  min={0}
                  value={silo.capacityTons || ''}
                  onChange={(e) => onChange(silo.id, 'capacityTons', parseFloat(e.target.value) || 0)}
                  placeholder="Ej: 2200"
                  className="w-full text-sm rounded-lg border border-slate-200 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-medium text-slate-500 mb-1">Contenido</label>
                <FormSelect
                  value={silo.content}
                  onChange={(e) => onChange(silo.id, 'content', e.target.value)}
                >
                  <option value="">Seleccionar…</option>
                  {SILO_CONTENTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </FormSelect>
              </div>
              <button
                type="button"
                onClick={() => onRemove(silo.id)}
                className="mb-0.5 p-2 text-slate-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {totalTons > 0 && (
            <div className="flex items-center justify-end gap-2 px-2 py-1.5 rounded-lg bg-blue-50 text-sm font-semibold text-blue-700">
              Capacidad total: {totalTons.toLocaleString('es-AR')} tn ({silos.length} silo{silos.length !== 1 ? 's' : ''})
            </div>
          )}
        </div>
      )}
    </div>
  )
}
