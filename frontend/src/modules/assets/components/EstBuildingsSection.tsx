import { Plus, Building2, Trash2 } from 'lucide-react'
import { FormInput, FormSelect } from '../../../shared/components/forms/FormSection'
import type { CatalogItem } from '../../../shared/api/catalogs.api'

export interface EstBuilding {
  id: string
  name: string
  surfaceM2: string
  purpose: string
  constructionType: string
  constructionYear: string
}

export function EstBuildingsSection({
  buildings, onAdd, onRemove, onChange, buildingPurposes,
}: {
  buildings: EstBuilding[]
  onAdd: () => void
  onRemove: (id: string) => void
  onChange: (id: string, field: keyof Omit<EstBuilding, 'id'>, value: string) => void
  buildingPurposes: CatalogItem[]
}) {
  const totalM2 = buildings.reduce((sum, b) => sum + (parseFloat(b.surfaceM2) || 0), 0)

  return (
    <div>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">
            Edificios y construcciones
            {totalM2 > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                · {totalM2.toLocaleString('es-AR')} m² totales construidos
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Registrá las construcciones que forman parte de este establecimiento
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex-shrink-0 ml-4"
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>
      {buildings.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center">
          <Building2 size={22} className="mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-500">Ningún edificio registrado</p>
          <button type="button" onClick={onAdd} className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Agregar primer edificio
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {buildings.map((b, idx) => (
            <div key={b.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edificio {idx + 1}</span>
                <button type="button" onClick={() => onRemove(b.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nombre</label>
                  <FormInput value={b.name} onChange={(e) => onChange(b.id, 'name', e.target.value)} placeholder="Ej: Galpón Norte, Casa de personal" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Superficie (m²)</label>
                  <FormInput type="number" min={0} value={b.surfaceM2} onChange={(e) => onChange(b.id, 'surfaceM2', e.target.value)} placeholder="Ej: 800" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Uso / Destino</label>
                  <FormSelect value={b.purpose} onChange={(e) => onChange(b.id, 'purpose', e.target.value)}>
                    <option value="">Seleccionar…</option>
                    {buildingPurposes.map((p) => <option key={p.id} value={p.label}>{p.label}</option>)}
                  </FormSelect>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de estructura</label>
                  <FormInput value={b.constructionType} onChange={(e) => onChange(b.id, 'constructionType', e.target.value)} placeholder="Ej: Hormigón, Steel Frame, Madera…" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Año de construcción</label>
                  <FormInput type="number" min={1900} max={2030} value={b.constructionYear} onChange={(e) => onChange(b.id, 'constructionYear', e.target.value)} placeholder="Ej: 2005" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
