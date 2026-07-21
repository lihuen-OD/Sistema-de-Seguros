import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, MapPin } from 'lucide-react'
import clsx from 'clsx'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { fireExtinguishersApi } from '../../../shared/api/fire-extinguishers.api'
import type { FireExtinguisher } from '../../../shared/types'

interface AuditStep1SelectionProps {
  selected: FireExtinguisher | null
  onSelect: (extinguisher: FireExtinguisher) => void
}

export function AuditStep1Selection({ selected, onSelect }: AuditStep1SelectionProps) {
  const [search, setSearch] = useState('')

  const { data: extinguishers = [], isLoading } = useQuery({
    queryKey: ['fire-extinguishers', 'audit-selection'],
    queryFn: () => fireExtinguishersApi.findAll({ isActive: true }),
  })

  const q = search.trim().toLowerCase()
  const filtered = q
    ? extinguishers.filter((fe) =>
        [fe.cylinderNumber, fe.code, fe.type, fe.location, fe.establishment]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : extinguishers

  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">Seleccioná el matafuego que vas a auditar.</p>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Buscar por cilindro, código, tipo o ubicación…"
        className="mb-4"
      />

      {isLoading ? (
        <p className="text-sm text-slate-400 py-10 text-center">Cargando matafuegos…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-10 text-center">No se encontraron matafuegos.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[520px] overflow-y-auto pr-1">
          {filtered.map((fe) => {
            const isActive = selected?.id === fe.id
            return (
              <button
                key={fe.id}
                type="button"
                onClick={() => onSelect(fe)}
                className={clsx(
                  'text-left border rounded-lg p-4 transition-all',
                  isActive
                    ? 'border-brand-400 bg-brand-50/60 ring-2 ring-brand-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                      <Flame size={14} className="text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {fe.code}
                        {fe.cylinderNumber ? ` · ${fe.cylinderNumber}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {fe.type} · {fe.capacity}
                      </p>
                    </div>
                  </div>
                  <StatusPill status={fe.status} size="sm" />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin size={12} className="flex-shrink-0" />
                  <span className="truncate">
                    {fe.establishment ?? '—'}
                    {fe.location ? ` · ${fe.location}` : ''}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
