import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { CalendarDays, Building2, Flame, ClipboardCheck, Pencil, ChevronDown, ChevronUp } from 'lucide-react'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { formatDate, fireExtinguisherLabel } from '../../../shared/utils/format'
import type { FireExtinguisherCoverageItem } from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'

interface AuditCoverageTabProps {
  period: string
  onPeriodChange: (period: string) => void
  data: FireExtinguisherCoverageItem[]
  isLoading: boolean
  /** Puede crear auditorías — controla si las filas dejan "Auditar". */
  canAudit: boolean
}

interface LocationTypeGroup {
  locationType: string
  audited: number
  items: FireExtinguisherCoverageItem[]
}

interface EstablishmentGroup {
  establishment: string
  auditedCount: number
  total: number
  byLocationType: LocationTypeGroup[]
}

// Orden "natural": números como números (DESARROLLO 2 antes que DESARROLLO
// 13), acentos/ñ en orden de diccionario español — mismo criterio que
// DataTable's compareValues, para que el detalle de ubicación (MATERNIDAD 6,
// DESARROLLO 16…) quede en el orden que espera un humano, no el lexicográfico puro.
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })
}

function groupByEstablishment(data: FireExtinguisherCoverageItem[]): EstablishmentGroup[] {
  const map = new Map<string, FireExtinguisherCoverageItem[]>()
  for (const item of data) {
    const key = item.establishment ?? 'Sin establecimiento'
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return Array.from(map.entries())
    .map(([establishment, items]) => {
      const byLocationTypeMap = new Map<string, FireExtinguisherCoverageItem[]>()
      for (const item of items) {
        byLocationTypeMap.set(item.associatedLocationType, [...(byLocationTypeMap.get(item.associatedLocationType) ?? []), item])
      }
      const byLocationType: LocationTypeGroup[] = Array.from(byLocationTypeMap.entries())
        .map(([locationType, ltItems]) => ({
          locationType,
          audited: ltItems.filter((i) => i.audited).length,
          // Ordenados por establecimiento → ubicación → detalle: dentro de
          // cada zona, por el detalle de ubicación (location) y como
          // desempate el cilindro, para que cada zona quede prolija y
          // navegable en vez de mezclada por estado de auditoría.
          items: [...ltItems].sort(
            (a, b) => naturalCompare(a.location ?? '', b.location ?? '') || naturalCompare(a.cylinderNumber ?? '', b.cylinderNumber ?? ''),
          ),
        }))
        // Mismo orden que el resumen de arriba (zonas con más matafuegos primero).
        .sort((a, b) => b.items.length - a.items.length)

      return {
        establishment,
        auditedCount: items.filter((i) => i.audited).length,
        total: items.length,
        byLocationType,
      }
    })
    .sort((a, b) => a.establishment.localeCompare(b.establishment))
}

// Clave única de una zona dentro de un establecimiento — el mismo nombre de
// zona (ej. "Edificio") puede repetirse en distintos establecimientos.
function locationTypeKey(establishment: string, locationType: string): string {
  return `${establishment}::${locationType}`
}

export function AuditCoverageTab({ period, onPeriodChange, data, isLoading, canAudit }: AuditCoverageTabProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [collapsedEstablishments, setCollapsedEstablishments] = useState<Set<string>>(new Set())
  const [collapsedLocationTypes, setCollapsedLocationTypes] = useState<Set<string>>(new Set())

  function toggleEstablishmentCollapse(establishment: string) {
    setCollapsedEstablishments((prev) => {
      const next = new Set(prev)
      if (next.has(establishment)) next.delete(establishment)
      else next.add(establishment)
      return next
    })
  }

  function toggleLocationTypeCollapse(key: string) {
    setCollapsedLocationTypes((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Establecimientos y zonas vienen cerrados por defecto — se re-cierran
  // cada vez que llegan datos nuevos (cambio de período), en vez de arrancar
  // con todo abierto.
  useEffect(() => {
    const groups = groupByEstablishment(data)
    setCollapsedEstablishments(new Set(groups.map((g) => g.establishment)))
    setCollapsedLocationTypes(
      new Set(groups.flatMap((g) => g.byLocationType.map((lt) => locationTypeKey(g.establishment, lt.locationType)))),
    )
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return data
    return data.filter((item) =>
      [item.code, item.cylinderNumber, item.type, item.establishment, item.associatedLocationType, item.location]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    )
  }, [data, search])

  const groups = useMemo(() => groupByEstablishment(filtered), [filtered])
  const totalAudited = filtered.filter((i) => i.audited).length

  function goToAudit(extinguisherId: string) {
    navigate(`${ROUTES.FIRE_EXTINGUISHERS_AUDIT_NEW}?extinguisherId=${extinguisherId}`)
  }

  function goToEditAudit(auditId: string) {
    navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_EDIT(auditId))
  }

  return (
    <div className="space-y-4">
      <SectionCard noPadding>
        <div className="px-5 py-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <CalendarDays size={14} className="text-slate-400" />
            <span className="text-xs font-medium text-slate-500">Período</span>
          </div>
          <input
            type="month"
            value={period}
            onChange={(e) => e.target.value && onPeriodChange(e.target.value)}
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white tabular-nums focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
          />
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por cilindro, código, ubicación o detalle…"
            className="w-full sm:w-80"
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {totalAudited} de {filtered.length} matafuegos auditados en {period}
          </span>
        </div>
      </SectionCard>

      {isLoading ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">Cargando cobertura…</p>
        </SectionCard>
      ) : groups.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">
            {search ? 'Sin resultados para tu búsqueda.' : 'No hay matafuegos activos para mostrar.'}
          </p>
        </SectionCard>
      ) : (
        groups.map((group) => {
          const establishmentCollapsed = collapsedEstablishments.has(group.establishment)
          return (
          <SectionCard key={group.establishment} noPadding>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleEstablishmentCollapse(group.establishment)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEstablishmentCollapse(group.establishment) } }}
              className="px-5 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 size={15} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-800 truncate">{group.establishment}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                    {group.auditedCount}/{group.total} auditados
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleEstablishmentCollapse(group.establishment) }}
                    className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                    title={establishmentCollapsed ? 'Mostrar establecimiento' : 'Ocultar establecimiento'}
                  >
                    {establishmentCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                </div>
              </div>
              {group.byLocationType.length > 1 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 pl-[23px]">
                  {group.byLocationType.map((lt) => (
                    <span key={lt.locationType} className="text-xs text-slate-400">
                      {lt.locationType}: <span className="text-slate-600 font-medium">{lt.audited}/{lt.items.length}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {!establishmentCollapsed && group.byLocationType.map((ltGroup) => {
              const ltKey = locationTypeKey(group.establishment, ltGroup.locationType)
              const ltCollapsed = collapsedLocationTypes.has(ltKey)
              return (
              <div key={ltGroup.locationType}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleLocationTypeCollapse(ltKey)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleLocationTypeCollapse(ltKey) } }}
                  className="px-5 py-1.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{ltGroup.locationType}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleLocationTypeCollapse(ltKey) }}
                    className="p-0.5 text-slate-400 hover:text-slate-600 transition-colors"
                    title={ltCollapsed ? 'Mostrar zona' : 'Ocultar zona'}
                  >
                    {ltCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  </button>
                </div>
                {!ltCollapsed && (
                <div className="divide-y divide-slate-100">
                  {ltGroup.items.map((item) => {
                    // Recorrección permitida solo si NEEDS_CORRECTION/sin auditar —
                    // una auditoría SUBMITTED/APPROVED ya bloquea una nueva en el
                    // mismo período (ver índice único parcial del backend).
                    const isAuditable = canAudit && (!item.audited || item.auditStatus === 'NEEDS_CORRECTION')
                    // Pendiente de revisión — se puede corregir sin tener que
                    // rechazarla primero (ver fire-extinguisher-audits.service.ts's update()).
                    const isEditable = canAudit && item.audited && item.auditStatus === 'SUBMITTED' && !!item.auditId
                    const onItemClick = isAuditable
                      ? () => goToAudit(item.id)
                      : isEditable
                        ? () => goToEditAudit(item.auditId!)
                        : undefined
                    // El código autogenerado (MAT-XXX-A) es un ID interno, no dice
                    // nada en el campo — el cilindro (grabado en el tanque) y el
                    // detalle de ubicación son lo que identifica al matafuego para
                    // quien audita. El código solo aparece como referencia chica
                    // abajo, y únicamente si no quedó ya como título por fallback
                    // (matafuego sin cilindro ni detalle cargado).
                    const primaryLabel = fireExtinguisherLabel(item.cylinderNumber, item.location, item.code)
                    const showCodeLine = primaryLabel !== item.code
                    return (
                      <div
                        key={item.id}
                        role={onItemClick ? 'button' : undefined}
                        tabIndex={onItemClick ? 0 : undefined}
                        onClick={onItemClick}
                        onKeyDown={
                          onItemClick
                            ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick() } }
                            : undefined
                        }
                        className={clsx(
                          // En mobile se apila (el código/detalle no entra al lado del estado sin
                          // truncarse ilegible) — de sm en adelante vuelve a la fila horizontal.
                          'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 sm:px-5 py-2.5',
                          onItemClick && 'cursor-pointer hover:bg-slate-50 transition-colors',
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Flame size={14} className="text-red-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-800 break-words sm:truncate">{primaryLabel}</p>
                            <p className="text-xs text-slate-500 break-words sm:truncate">{item.type}</p>
                            {showCodeLine && (
                              <p className="text-xs text-slate-400 font-mono break-words sm:truncate">{item.code}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pl-[23px] sm:pl-0 sm:flex-shrink-0">
                          {item.audited ? (
                            <>
                              {item.auditDate && (
                                <span className="text-xs text-slate-400 tabular-nums">{formatDate(item.auditDate)}</span>
                              )}
                              <StatusPill status={item.auditStatus ?? ''} size="sm" />
                            </>
                          ) : (
                            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 whitespace-nowrap">
                              Sin auditar
                            </span>
                          )}
                          {isAuditable && (
                            <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
                              <ClipboardCheck size={13} />
                              Auditar
                            </span>
                          )}
                          {isEditable && (
                            <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
                              <Pencil size={13} />
                              Editar
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })}
          </SectionCard>
          )
        })
      )}
    </div>
  )
}
