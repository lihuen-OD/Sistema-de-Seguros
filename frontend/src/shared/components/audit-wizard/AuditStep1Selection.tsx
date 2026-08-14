import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Flame, MapPin, Package } from 'lucide-react'
import clsx from 'clsx'
import { SearchInput } from '../../components/filters/SearchInput'
import { StatusPill } from '../../components/badges/StatusPill'
import type { FireExtinguisherCoverageItem } from '../../api/fire-extinguisher-audits.api'
import type { AuditPopulation } from './checklistConfig'
import type { QueryConfig } from './AuditWizard'

interface AuditStep1SelectionProps {
  population: AuditPopulation
  selectedId: string | null
  onSelect: (id: string) => void
  // Misma forma en las dos poblaciones (FireExtinguisherCoverageItem) — el
  // caller pasa fireExtinguisherAuditQueries.coverage(period) o
  // assetAuditQueries.coverage(period) según corresponda.
  coverageQuery: QueryConfig<FireExtinguisherCoverageItem[]>
}

export function AuditStep1Selection({ population, selectedId, onSelect, coverageQuery }: AuditStep1SelectionProps) {
  const [search, setSearch] = useState('')

  // Ya viene filtrada por el alcance del usuario (establecimientos o
  // categorías asignadas) y por población — mismo criterio que la pestaña
  // "Cobertura".
  const { data: coverage = [], isLoading } = useQuery(coverageQuery)

  const auditable = useMemo(
    () => coverage.filter((fe) => !fe.audited || fe.auditStatus === 'NEEDS_CORRECTION' || fe.auditStatus === 'REJECTED'),
    [coverage],
  )

  const q = search.trim().toLowerCase()
  const filtered = q
    ? auditable.filter((fe) =>
        [fe.cylinderNumber, fe.code, fe.type, fe.location, fe.establishment, fe.asset?.name]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q)),
      )
    : auditable

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
            const isActive = selectedId === fe.id
            return (
              <button
                key={fe.id}
                type="button"
                onClick={() => onSelect(fe.id)}
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
                      <p className="text-xs text-slate-500 truncate">{fe.type}</p>
                    </div>
                  </div>
                  {fe.auditStatus && <StatusPill status={fe.auditStatus} size="sm" />}
                </div>
                {population === 'ASSET' ? (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Package size={12} className="flex-shrink-0" />
                    <span className="truncate">
                      {fe.asset?.name ?? '—'}
                      {fe.asset?.assetType ? ` · ${fe.asset.assetType}` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <MapPin size={12} className="flex-shrink-0" />
                    <span className="truncate">
                      {fe.establishment ?? '—'}
                      {fe.location ? ` · ${fe.location}` : ''}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
