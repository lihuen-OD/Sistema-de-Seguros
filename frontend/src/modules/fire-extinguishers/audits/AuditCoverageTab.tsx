import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { CalendarDays, Building2, Flame, ClipboardCheck } from 'lucide-react'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { formatDate } from '../../../shared/utils/format'
import type { FireExtinguisherCoverageItem } from '../../../shared/api/fire-extinguisher-audits.api'
import { ROUTES } from '../../../app/routes'

interface AuditCoverageTabProps {
  period: string
  onPeriodChange: (period: string) => void
  data: FireExtinguisherCoverageItem[]
  isLoading: boolean
}

interface EstablishmentGroup {
  establishment: string
  items: FireExtinguisherCoverageItem[]
  auditedCount: number
}

function groupByEstablishment(data: FireExtinguisherCoverageItem[]): EstablishmentGroup[] {
  const map = new Map<string, FireExtinguisherCoverageItem[]>()
  for (const item of data) {
    const key = item.establishment ?? 'Sin establecimiento'
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return Array.from(map.entries())
    .map(([establishment, items]) => ({
      establishment,
      // Pendientes primero, para verlos de un vistazo.
      items: [...items].sort((a, b) => Number(a.audited) - Number(b.audited)),
      auditedCount: items.filter((i) => i.audited).length,
    }))
    .sort((a, b) => a.establishment.localeCompare(b.establishment))
}

export function AuditCoverageTab({ period, onPeriodChange, data, isLoading }: AuditCoverageTabProps) {
  const navigate = useNavigate()
  const groups = useMemo(() => groupByEstablishment(data), [data])
  const totalAudited = data.filter((i) => i.audited).length

  function goToAudit(extinguisherId: string) {
    navigate(`${ROUTES.FIRE_EXTINGUISHERS_AUDIT_NEW}?extinguisherId=${extinguisherId}`)
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
            className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-white tabular-nums focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {totalAudited} de {data.length} matafuegos auditados en {period}
          </span>
        </div>
      </SectionCard>

      {isLoading ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">Cargando cobertura…</p>
        </SectionCard>
      ) : groups.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">No hay matafuegos activos para mostrar.</p>
        </SectionCard>
      ) : (
        groups.map((group) => (
          <SectionCard key={group.establishment} noPadding>
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={15} className="text-slate-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-slate-800 truncate">{group.establishment}</span>
              </div>
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap flex-shrink-0">
                {group.auditedCount}/{group.items.length} auditados
              </span>
            </div>
            <div className="divide-y divide-slate-100">
              {group.items.map((item) => {
                // Recorrección permitida solo si NEEDS_CORRECTION/sin auditar —
                // una auditoría SUBMITTED/APPROVED ya bloquea una nueva en el
                // mismo período (ver índice único parcial del backend).
                const canAudit = !item.audited || item.auditStatus === 'NEEDS_CORRECTION'
                return (
                  <div
                    key={item.id}
                    role={canAudit ? 'button' : undefined}
                    tabIndex={canAudit ? 0 : undefined}
                    onClick={canAudit ? () => goToAudit(item.id) : undefined}
                    onKeyDown={
                      canAudit
                        ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToAudit(item.id) } }
                        : undefined
                    }
                    className={clsx(
                      'flex items-center justify-between gap-3 px-5 py-2.5',
                      canAudit && 'cursor-pointer hover:bg-slate-50 transition-colors',
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Flame size={14} className="text-red-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {item.code}
                          {item.cylinderNumber ? ` · ${item.cylinderNumber}` : ''}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.type}
                          {item.location ? ` · ${item.location}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                      {canAudit && (
                        <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
                          <ClipboardCheck size={13} />
                          Auditar
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        ))
      )}
    </div>
  )
}
