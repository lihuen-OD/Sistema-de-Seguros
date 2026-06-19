import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, ChevronDown, ChevronUp, Tag, Shield } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { insuranceTypesApi } from '../../../shared/api/insurance-types.api'

export default function InsuranceTypesPage() {
  const queryClient = useQueryClient()

  const { data: types = [] } = useQuery({
    queryKey: ['insurance-types'],
    queryFn: insuranceTypesApi.findAll,
  })

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newTypeLabel, setNewTypeLabel] = useState('')
  const [newTypeError, setNewTypeError] = useState('')
  const [newCoverage, setNewCoverage] = useState<Record<string, string>>({})

  // Set first type as expanded once data loads
  useEffect(() => {
    if (types.length > 0 && !expandedId) {
      setExpandedId(types[0].id)
    }
  }, [types, expandedId])

  const addType = async () => {
    const label = newTypeLabel.trim()
    if (!label) { setNewTypeError('Ingresá un nombre'); return }
    if (types.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      setNewTypeError('Ya existe un tipo con ese nombre')
      return
    }
    try {
      const created = await insuranceTypesApi.create(label)
      await queryClient.invalidateQueries({ queryKey: ['insurance-types'] })
      setNewTypeLabel('')
      setNewTypeError('')
      setExpandedId(created.id)
    } catch (err) {
      setNewTypeError(err instanceof Error ? err.message : 'Error al crear el tipo')
    }
  }

  const removeType = async (id: string) => {
    try {
      await insuranceTypesApi.remove(id)
      await queryClient.invalidateQueries({ queryKey: ['insurance-types'] })
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el tipo')
    }
  }

  const addCoverage = async (typeId: string) => {
    const label = (newCoverage[typeId] ?? '').trim()
    if (!label) return
    try {
      await insuranceTypesApi.addCoverage(typeId, label)
      await queryClient.invalidateQueries({ queryKey: ['insurance-types'] })
      setNewCoverage((prev) => ({ ...prev, [typeId]: '' }))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al agregar cobertura')
    }
  }

  const removeCoverage = async (typeId: string, coverage: string) => {
    try {
      await insuranceTypesApi.removeCoverage(typeId, coverage)
      await queryClient.invalidateQueries({ queryKey: ['insurance-types'] })
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar cobertura')
    }
  }

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
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : type.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <Shield size={13} className="text-blue-600" />
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
                    <button
                      type="button"
                      onClick={() => removeType(type.id)}
                      className="ml-3 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Eliminar tipo"
                    >
                      <Trash2 size={14} />
                    </button>
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
                                onClick={() => removeCoverage(type.id, cov)}
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
                          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={() => addCoverage(type.id)}
                          disabled={!(newCoverage[type.id] ?? '').trim()}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
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
                className={`w-full px-3 py-2.5 text-sm border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-400 ${
                  newTypeError ? 'border-red-300' : 'border-slate-200'
                }`}
              />
              {newTypeError && <p className="text-xs text-red-600 mt-1.5">{newTypeError}</p>}
            </div>
            <button
              type="button"
              onClick={addType}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex-shrink-0"
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
    </PageContent>
  )
}
