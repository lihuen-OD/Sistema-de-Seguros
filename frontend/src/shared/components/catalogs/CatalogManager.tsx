import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GripVertical, Check, X, Pencil, Plus, EyeOff, Eye, Trash2 } from 'lucide-react'
import { catalogsApi, type CatalogItem } from '../../api/catalogs.api'

interface CatalogManagerProps {
  category: string
  title: string
  description?: string
  addPlaceholder?: string
}

interface RowState {
  editing: boolean
  editLabel: string
  confirmDelete: boolean
}

export function CatalogManager({ category, addPlaceholder }: CatalogManagerProps) {
  const queryClient = useQueryClient()

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['catalogs', category, 'all'],
    queryFn: () => catalogsApi.findAllByCategory(category),
  })

  const [rowState, setRowState] = useState<Record<string, RowState>>({})
  const [newLabel, setNewLabel] = useState('')
  const [adding, setAdding] = useState(false)

  function getRow(id: string): RowState {
    return rowState[id] ?? { editing: false, editLabel: '', confirmDelete: false }
  }

  function setRow(id: string, patch: Partial<RowState>) {
    setRowState((prev) => ({ ...prev, [id]: { ...getRow(id), ...patch } }))
  }

  function startEdit(item: CatalogItem) {
    setRow(item.id, { editing: true, editLabel: item.label, confirmDelete: false })
  }

  function cancelEdit(id: string) {
    setRow(id, { editing: false, editLabel: '', confirmDelete: false })
  }

  async function saveEdit(item: CatalogItem) {
    const label = getRow(item.id).editLabel.trim()
    if (!label || label === item.label) {
      cancelEdit(item.id)
      return
    }
    await catalogsApi.update(category, item.id, { label })
    queryClient.invalidateQueries({ queryKey: ['catalogs', category] })
    setRow(item.id, { editing: false, editLabel: '', confirmDelete: false })
  }

  async function toggleActive(item: CatalogItem) {
    await catalogsApi.update(category, item.id, { isActive: !item.isActive })
    queryClient.invalidateQueries({ queryKey: ['catalogs', category] })
  }

  function startDelete(id: string) {
    setRow(id, { confirmDelete: true })
  }

  function cancelDelete(id: string) {
    setRow(id, { confirmDelete: false })
  }

  async function confirmDelete(item: CatalogItem) {
    await catalogsApi.delete(category, item.id)
    queryClient.invalidateQueries({ queryKey: ['catalogs', category] })
  }

  async function handleAdd() {
    const label = newLabel.trim()
    if (!label) return
    setAdding(true)
    try {
      await catalogsApi.create(category, label)
      queryClient.invalidateQueries({ queryKey: ['catalogs', category] })
      setNewLabel('')
    } finally {
      setAdding(false)
    }
  }

  if (isLoading) {
    return (
      <div className="py-6 text-center text-sm text-slate-400">Cargando…</div>
    )
  }

  return (
    <div>
      {items.length === 0 && (
        <div className="py-8 text-center text-sm text-slate-400">
          Sin elementos. Agregá el primero.
        </div>
      )}

      {items.map((item, index) => {
        const row = getRow(item.id)
        const isLast = index === items.length - 1

        return (
          <div
            key={item.id}
            className={`group flex items-center gap-3 px-5 py-3 ${!isLast ? 'border-b border-slate-100' : ''}`}
          >
            <GripVertical size={14} className="text-slate-300 flex-shrink-0 cursor-grab" />

            {row.editing ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  autoFocus
                  value={row.editLabel}
                  onChange={(e) => setRow(item.id, { editLabel: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(item)
                    if (e.key === 'Escape') cancelEdit(item.id)
                  }}
                  className="border border-blue-400 rounded-md px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-w-0 flex-1"
                />
                <button
                  onClick={() => saveEdit(item)}
                  className="p-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                  title="Guardar"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => cancelEdit(item.id)}
                  className="p-1 rounded text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0"
                  title="Cancelar"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-800 truncate">{item.label}</span>
                  {!item.isActive && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 flex-shrink-0">
                      Inactivo
                    </span>
                  )}
                </div>

                {row.confirmDelete ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
                    <button
                      onClick={() => confirmDelete(item)}
                      className="px-2 py-0.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                    >
                      Sí
                    </button>
                    <button
                      onClick={() => cancelDelete(item.id)}
                      className="px-2 py-0.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => startEdit(item)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => toggleActive(item)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                      title={item.isActive ? 'Desactivar' : 'Activar'}
                    >
                      {item.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => startDelete(item.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}

      <div className={`flex items-center gap-2 px-5 py-3 ${items.length > 0 ? 'border-t border-slate-100' : ''}`}>
        <GripVertical size={14} className="text-transparent flex-shrink-0" />
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd()
          }}
          placeholder={addPlaceholder ?? 'Nuevo elemento…'}
          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-200 rounded-md text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
        />
        <button
          onClick={handleAdd}
          disabled={adding || !newLabel.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>
    </div>
  )
}
