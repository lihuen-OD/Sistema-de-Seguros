import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2 } from 'lucide-react'
import { Modal } from '../../shared/components/modals/Modal'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { fireExtinguishersApi, fireExtinguisherKeys } from '../../shared/api/fire-extinguishers.api'

interface AssociateFireExtinguisherModalProps {
  assetId: string
  assetName: string
  onClose: () => void
}

export function AssociateFireExtinguisherModal({ assetId, assetName, onClose }: AssociateFireExtinguisherModalProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: all = [], isLoading } = useQuery({
    queryKey: [...fireExtinguisherKeys.all, 'unassociated'],
    queryFn: () => fireExtinguishersApi.findAll({ isActive: true, unassigned: true }),
  })

  const candidates = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return all
    return all.filter(
      (fe) =>
        fe.code.toLowerCase().includes(q) ||
        fe.type.toLowerCase().includes(q) ||
        (fe.cylinderNumber?.toLowerCase().includes(q) ?? false),
    )
  }, [all, search])

  async function handleAssociate() {
    if (!selectedId) return
    setSubmitting(true)
    try {
      await fireExtinguishersApi.update(selectedId, { associatedAssetId: assetId })
      await queryClient.invalidateQueries({ queryKey: fireExtinguisherKeys.all })
      onClose()
    } catch {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      icon={Link2}
      iconClassName="bg-brand-50 text-brand-600"
      title="Asociar matafuego existente"
      description={`Elegí un matafuego sin activo asociado para vincularlo a "${assetName}".`}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleAssociate}
            disabled={!selectedId || submitting}
            className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
          >
            Asociar
          </button>
        </>
      }
    >
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por código, tipo o número interno…"
        className="w-full mb-3"
      />

      {isLoading ? (
        <div className="py-8 text-center text-sm text-slate-400">Cargando…</div>
      ) : candidates.length === 0 ? (
        <EmptyState
          title="Sin candidatos"
          description="No hay matafuegos activos sin activo asociado para vincular."
        />
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200">
          {candidates.map((fe) => (
            <button
              key={fe.id}
              type="button"
              onClick={() => setSelectedId(fe.id)}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                selectedId === fe.id ? 'bg-brand-50' : 'hover:bg-slate-50'
              }`}
            >
              <div className="min-w-0">
                <span className="font-mono text-xs text-slate-600">{fe.code}</span>
                <p className="text-sm text-slate-800 truncate">{fe.type} · {fe.capacity}</p>
              </div>
              <StatusPill status={fe.status} size="sm" />
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
