import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronUp, Tag, Shield } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { ConfirmDialog } from '../../../shared/components/dialogs/ConfirmDialog'
import {
  insuranceTypesApi, insuranceTypeQueries, insuranceTypeKeys, type InsuranceTypeConfig,
} from '../../../shared/api/insurance-types.api'

type DeleteTarget = { kind: 'type'; id: string; label: string } | { kind: 'coverage'; typeId: string; coverage: string }

export default function InsuranceTypesPage() {
  const queryClient = useQueryClient()

  const { data: types = [], isError } = useQuery(insuranceTypeQueries.list())

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [newTypeError, setNewTypeError] = useState('')
  const [newCoverage, setNewCoverage] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editError, setEditError] = useState('')

  // Abre el primer tipo una sola vez, cuando los datos llegan por primera vez
  // — un ref (no estado) para que esto no vuelva a dispararse cada vez que
  // expandedId pasa a null al cerrar manualmente un acordeón (eso causaba
  // que cerrar cualquiera "rebotara" y reabriera el primero al instante).
  const didAutoExpand = useRef(false)
  useEffect(() => {
    if (types.length > 0 && !didAutoExpand.current) {
      setExpandedId(types[0].id)
      didAutoExpand.current = true
    }
  }, [types])

  const addType = async () => {
    const label = newTypeLabel.trim()
    if (!label) { setNewTypeError('Ingresá un nombre'); return }
    if (types.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      setNewTypeError('Ya existe un tipo con ese nombre')
      return
    }
    try {
      const created = await insuranceTypesApi.create(label)
      await queryClient.invalidateQueries({ queryKey: insuranceTypeKeys.all })
      setNewTypeLabel('')
      setNewTypeError('')
      setExpandedId(created.id)
    } catch (err) {
      setNewTypeError(err instanceof Error ? err.message : 'Error al crear el tipo')
    }
  }

  const startEdit = (type: InsuranceTypeConfig) => {
    setEditingId(type.id)
    setEditLabel(type.label)
    setEditError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditLabel('')
    setEditError('')
  }

  const saveEdit = async (type: InsuranceTypeConfig) => {
    const label = editLabel.trim()
    if (!label) { setEditError('Ingresá un nombre'); return }
    if (label === type.label) { cancelEdit(); return }
    if (types.some((t) => t.id !== type.id && t.label.toLowerCase() === label.toLowerCase())) {
      setEditError('Ya existe un tipo con ese nombre')
      return
    }
    try {
      await insuranceTypesApi.update(type.id, label)
      await queryClient.invalidateQueries({ queryKey: insuranceTypeKeys.all })
      cancelEdit()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Error al editar el tipo')
    }
  }

  const removeType = async (id: string) => {
    try {
      await insuranceTypesApi.remove(id)
      await queryClient.invalidateQueries({ queryKey: insuranceTypeKeys.all })
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar el tipo')
    }
  }

  const addCoverage = async (typeId: string) => {
    const label = (newCoverage[typeId] ?? '').trim()
    if (!label) return
    try {
      await insuranceTypesApi.addCoverage(typeId, label)
      await queryClient.invalidateQueries({ queryKey: insuranceTypeKeys.all })
      setNewCoverage((prev) => ({ ...prev, [typeId]: '' }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agregar cobertura')
    }
  }

  const removeCoverage = async (typeId: string, coverage: string) => {
    try {
      await insuranceTypesApi.removeCoverage(typeId, coverage)
      await queryClient.invalidateQueries({ queryKey: insuranceTypeKeys.all })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al eliminar cobertura')
    }
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    if (deleteTarget.kind === 'type') {
      removeType(deleteTarget.id)
    } else {
      removeCoverage(deleteTarget.typeId, deleteTarget.coverage)
    }
    setDeleteTarget(null)
  }

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Tipos de Seguro"
        subtitle="Configurá los tipos de seguro y las coberturas disponibles para cada uno"
        backTo="/settings/companies"
        backLabel="Volver a configuración"
      />

      <div className="max-w-4xl space-y-5">

        <SectionCard
          title="Tipos de seguro configurados"
          subtitle={`${types.length} tipo${types.length !== 1 ? 's' : ''} de seguro`}
        >
          <div className="space-y-2">
            {types.map((type) => {
              const isOpen = expandedId === type.id
              return (
                <div key={type.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50/60 transition-colors">
                    {editingId === type.id ? (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={editLabel}
                            onChange={(e) => { setEditLabel(e.target.value); setEditError('') }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); saveEdit(type) }
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 ${
                              editError ? 'border-red-300' : 'border-brand-400'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => saveEdit(type)}
                            className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors flex-shrink-0"
                            title="Guardar"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 transition-colors flex-shrink-0"
                            title="Cancelar"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        {editError && <p className="text-xs text-red-600 mt-1">{editError}</p>}
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : type.id)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                            <Shield size={13} className="text-brand-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{type.label}</p>
                            <p className="text-xs text-slate-400">
                              {type.coverages.length} cobertura{type.coverages.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                          <div className="flex-shrink-0 ml-2 text-slate-400">
                            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                          </div>
                        </button>
                        <div className="flex items-center gap-0.5 ml-3 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => startEdit(type)}
                            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                            title="Editar tipo"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ kind: 'type', id: type.id, label: type.label })}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar tipo"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/40 space-y-3">
                      {type.coverages.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">Sin coberturas configuradas.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {type.coverages.map((cov) => (
                            <span
                              key={cov}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-200 text-slate-700"
                            >
                              <Tag size={10} className="text-slate-400" />
                              {cov}
                              <button
                                type="button"
                                onClick={() => setDeleteTarget({ kind: 'coverage', typeId: type.id, coverage: cov })}
                                className="text-slate-300 hover:text-red-500 transition-colors ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={newCoverage[type.id] ?? ''}
                          onChange={(e) => setNewCoverage((prev) => ({ ...prev, [type.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCoverage(type.id))}
                          placeholder="Nueva cobertura…"
                          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => addCoverage(type.id)}
                          disabled={!(newCoverage[type.id] ?? '').trim()}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-brand-600 border border-brand-200 bg-brand-50 hover:bg-brand-100 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                        >
                          <Plus size={14} />
                          Agregar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="Agregar tipo de seguro"
          subtitle="Creá un nuevo tipo para usar en las pólizas"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={newTypeLabel}
                onChange={(e) => { setNewTypeLabel(e.target.value); setNewTypeError('') }}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addType())}
                placeholder="Ej: Seguro de transporte, Seguro de crédito…"
                className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 placeholder:text-slate-400 ${
                  newTypeError ? 'border-red-300' : 'border-slate-200'
                }`}
              />
              {newTypeError && <p className="text-xs text-red-600 mt-1.5">{newTypeError}</p>}
            </div>
            <button
              type="button"
              onClick={addType}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors flex-shrink-0"
            >
              <Plus size={15} />
              Agregar tipo
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Los cambios se aplican de inmediato en los formularios de alta y edición de pólizas.
          </p>
        </SectionCard>

      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'type' ? 'Eliminar tipo de seguro' : 'Eliminar cobertura'}
        description={
          deleteTarget?.kind === 'type'
            ? `¿Eliminar "${deleteTarget.label}"? Esta acción no se puede deshacer.`
            : deleteTarget?.kind === 'coverage'
              ? `¿Eliminar la cobertura "${deleteTarget.coverage}"? Esta acción no se puede deshacer.`
              : ''
        }
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageContent>
  )
}
