import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { Loader2, Save, User, CheckCircle2 } from 'lucide-react'
import { SectionCard } from '../cards/SectionCard'
import { SearchInput } from '../filters/SearchInput'

export interface AssignableAsset {
  id: string
  code: string | null
  name: string
  assetType: string
  category: string
  plate?: string | null
  chassisNumber?: string | null
  engineNumber?: string | null
}

export interface AssignmentAuditor {
  userId: string
  name: string
  email: string
  assetIds: string[]
}

interface AuditAssignmentTabProps {
  auditors: AssignmentAuditor[]
  assets: AssignableAsset[]
  isLoading: boolean
  onSave: (userId: string, assetIds: string[]) => Promise<void>
}

interface CategoryGroup {
  category: string
  items: AssignableAsset[]
}

function groupByCategory(assets: AssignableAsset[]): CategoryGroup[] {
  const map = new Map<string, AssignableAsset[]>()
  for (const asset of assets) {
    map.set(asset.category, [...(map.get(asset.category) ?? []), asset])
  }
  return [...map.entries()]
    .map(([category, items]) => ({ category, items: [...items].sort((a, b) => a.name.localeCompare(b.name, 'es')) }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

// Asignación por activo individual entre auditores — reemplaza a la
// asignación por categoría completa: dos auditores de la misma categoría
// (ej. "camioneta") pueden repartirse vehículos puntuales en vez de ver
// todos los de la categoría. Exclusivo del admin (ver wiring en
// InsuranceAuditsQueuePage.tsx/AssetAuditsQueuePage.tsx).
export function AuditAssignmentTab({ auditors, assets, isLoading, onSave }: AuditAssignmentTabProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [pendingAssetIds, setPendingAssetIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedAuditor = auditors.find((a) => a.userId === selectedUserId) ?? null

  useEffect(() => {
    setPendingAssetIds(new Set(selectedAuditor?.assetIds ?? []))
  }, [selectedAuditor])

  // A qué auditor (que no sea el seleccionado) ya está asignado cada activo —
  // se permite superponer asignaciones, pero se avisa para evitar duplicar
  // trabajo sin querer.
  const ownerByAssetId = useMemo(() => {
    const map = new Map<string, string>()
    for (const auditor of auditors) {
      if (auditor.userId === selectedUserId) continue
      for (const assetId of auditor.assetIds) map.set(assetId, auditor.name)
    }
    return map
  }, [auditors, selectedUserId])

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return assets
    return assets.filter((a) =>
      [a.code, a.name, a.assetType, a.plate, a.chassisNumber, a.engineNumber].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
    )
  }, [assets, search])

  const groups = useMemo(() => groupByCategory(filteredAssets), [filteredAssets])

  function toggleAsset(assetId: string) {
    setPendingAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      return next
    })
  }

  async function handleSave() {
    if (!selectedUserId || saving) return
    setSaving(true)
    try {
      await onSave(selectedUserId, [...pendingAssetIds])
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400 text-center py-8">Cargando asignaciones…</p>
      </SectionCard>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <SectionCard noPadding>
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Auditores</p>
        </div>
        {auditors.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8 px-4">No hay usuarios con el módulo de cobertura habilitado.</p>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {auditors.map((auditor) => {
              const isActive = auditor.userId === selectedUserId
              return (
                <button
                  key={auditor.userId}
                  type="button"
                  onClick={() => setSelectedUserId(auditor.userId)}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors',
                    isActive ? 'bg-brand-50' : 'hover:bg-slate-50',
                  )}
                >
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', isActive ? 'bg-brand-100' : 'bg-slate-100')}>
                    <User size={14} className={isActive ? 'text-brand-600' : 'text-slate-400'} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={clsx('text-sm truncate', isActive ? 'font-semibold text-brand-800' : 'font-medium text-slate-700')}>{auditor.name}</p>
                    <p className="text-xs text-slate-400 truncate">{auditor.assetIds.length} activo{auditor.assetIds.length !== 1 ? 's' : ''} asignado{auditor.assetIds.length !== 1 ? 's' : ''}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard noPadding>
        {!selectedAuditor ? (
          <p className="text-sm text-slate-400 text-center py-16">Seleccioná un auditor para ver y editar sus activos asignados.</p>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{selectedAuditor.name}</p>
                <p className="text-xs text-slate-400">{selectedAuditor.email}</p>
              </div>
              <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código, nombre, tipo, patente, chasis o motor…" className="w-full sm:w-80 sm:ml-auto" />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                Guardar asignación
              </button>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {pendingAssetIds.size} activo{pendingAssetIds.size !== 1 ? 's' : ''} asignado{pendingAssetIds.size !== 1 ? 's' : ''}
              </span>
            </div>

            {groups.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">
                {search ? 'Sin resultados para tu búsqueda.' : 'No hay activos habilitados para esta auditoría.'}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {groups.map((group) => (
                  <div key={group.category} className="py-2">
                    <p className="px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.category}</p>
                    {group.items.map((asset) => {
                      const checked = pendingAssetIds.has(asset.id)
                      const otherOwner = ownerByAssetId.get(asset.id)
                      return (
                        <label
                          key={asset.id}
                          className="flex items-center gap-3 px-5 py-2 cursor-pointer hover:bg-slate-50 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleAsset(asset.id)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-700 truncate">{asset.name}</p>
                            <p className="text-xs text-slate-400 font-mono truncate">
                              {asset.code ?? '—'}
                              {asset.plate ? ` · ${asset.plate}` : ''}
                            </p>
                          </div>
                          {checked && <CheckCircle2 size={15} className="text-brand-500 flex-shrink-0" />}
                          {!checked && otherOwner && (
                            <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 whitespace-nowrap flex-shrink-0">
                              Asignado a {otherOwner}
                            </span>
                          )}
                        </label>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  )
}
