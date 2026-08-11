import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarDays, Package, Pencil, ChevronDown, ChevronUp, ClipboardCheck, IdCard, Bell, BellRing } from 'lucide-react'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { AuditCommentsPanel } from '../../shared/components/audit-comments/AuditCommentsPanel'
import { CATEGORY_LABEL, AUDITABLE_CATEGORY_GROUPS } from '../../shared/constants/asset-categories'
import type { AssetCategory } from '../../shared/types'
import { insuranceAuditsApi, insuranceAuditKeys, insuranceAuditQueries, type InsuranceAuditCoverageItem } from '../../shared/api/insurance-audits.api'
import { useCurrentUser } from '../../app/auth/AuthContext'
import { ROUTES } from '../../app/routes'

const CATEGORY_ICON = Object.fromEntries(
  AUDITABLE_CATEGORY_GROUPS.flatMap((g) => g.items).map((item) => [item.key, item.icon]),
) as Record<string, typeof Package>

interface InsuranceAuditCoverageTabProps {
  period: string
  onPeriodChange: (period: string) => void
  data: InsuranceAuditCoverageItem[]
  isLoading: boolean
  canAudit: boolean
  canReview: boolean
}

interface CategoryGroup {
  category: string
  audited: number
  total: number
  items: InsuranceAuditCoverageItem[]
}

function groupByCategory(data: InsuranceAuditCoverageItem[]): CategoryGroup[] {
  const map = new Map<string, InsuranceAuditCoverageItem[]>()
  for (const item of data) {
    map.set(item.category, [...(map.get(item.category) ?? []), item])
  }
  return Array.from(map.entries())
    .map(([category, items]) => ({
      category,
      audited: items.filter((i) => i.audited).length,
      total: items.length,
      items: [...items].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    }))
    .sort((a, b) => a.category.localeCompare(b.category))
}

export function InsuranceAuditCoverageTab({ period, onPeriodChange, data, isLoading, canAudit }: InsuranceAuditCoverageTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useCurrentUser()
  const [search, setSearch] = useState('')
  const [onlyMissingCard, setOnlyMissingCard] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  const { data: comments = [] } = useQuery(insuranceAuditQueries.comments(period))
  const commentTargets = useMemo(() => data.map((item) => ({ id: item.id, label: item.name, sublabel: item.code })), [data])

  const requestCardUpdateMutation = useMutation({
    mutationFn: (auditId: string) => insuranceAuditsApi.requestCardUpdate(auditId),
    onSuccess: () => {
      toast.success('Aviso enviado al revisor')
      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al avisar'),
  })

  const addCommentMutation = useMutation({
    mutationFn: ({ assetId, body }: { assetId: string; body: string }) => insuranceAuditsApi.addComment(assetId, body),
    onSuccess: () => {
      toast.success('Comentario agregado')
      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al agregar el comentario'),
  })

  const markCommentSeenMutation = useMutation({
    mutationFn: (commentId: string) => insuranceAuditsApi.markCommentSeen(commentId),
    onSuccess: () => {
      toast.success('Comentario marcado como visto')
      queryClient.invalidateQueries({ queryKey: insuranceAuditKeys.all })
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Error al marcar como visto'),
  })

  function toggleCollapse(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  useEffect(() => {
    setCollapsedCategories(new Set(groupByCategory(data).map((g) => g.category)))
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = data
    if (q) {
      result = result.filter((item) =>
        [item.code, item.name, item.assetType, item.plate, item.chassisNumber, item.engineNumber].filter(Boolean).some((v) => v!.toLowerCase().includes(q)),
      )
    }
    if (onlyMissingCard) {
      result = result.filter((item) => item.audited && item.hasCirculationCard === false)
    }
    return result
  }, [data, search, onlyMissingCard])

  const groups = useMemo(() => groupByCategory(filtered), [filtered])
  const totalAudited = filtered.filter((i) => i.audited).length

  function goToAudit(assetId: string) {
    navigate(`${ROUTES.INSURANCE_AUDITS_NEW}?assetId=${assetId}`)
  }

  function goToEditAudit(auditId: string) {
    navigate(ROUTES.INSURANCE_AUDITS_EDIT(auditId))
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
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar por código, nombre, tipo, patente, chasis o motor…" className="w-full sm:w-80" />
          <button
            type="button"
            onClick={() => setOnlyMissingCard((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap',
              onlyMissingCard ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
          >
            <IdCard size={13} />
            Solo sin tarjeta
          </button>
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {totalAudited} de {filtered.length} activos auditados en {period}
          </span>
        </div>
      </SectionCard>

      <AuditCommentsPanel
        comments={comments}
        targets={commentTargets}
        currentUserEmail={user?.email ?? ''}
        onAddComment={(assetId, body) => addCommentMutation.mutateAsync({ assetId, body })}
        onMarkSeen={(commentId) => markCommentSeenMutation.mutateAsync(commentId)}
      />

      {isLoading ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">Cargando cobertura…</p>
        </SectionCard>
      ) : groups.length === 0 ? (
        <SectionCard>
          <p className="text-sm text-slate-400 text-center py-8">
            {search ? 'Sin resultados para tu búsqueda.' : 'No hay activos habilitados para auditoría en tu alcance.'}
          </p>
        </SectionCard>
      ) : (
        groups.map((group) => {
          const collapsed = collapsedCategories.has(group.category)
          const Icon = CATEGORY_ICON[group.category] ?? Package
          return (
            <SectionCard key={group.category} noPadding>
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleCollapse(group.category)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse(group.category) } }}
                className="px-5 py-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon size={15} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {CATEGORY_LABEL[group.category as AssetCategory] ?? group.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                      {group.audited}/{group.total} auditados
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(group.category) }}
                      className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
                      title={collapsed ? 'Mostrar categoría' : 'Ocultar categoría'}
                    >
                      {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {!collapsed && (
                <div className="divide-y divide-slate-100">
                  {group.items.map((item) => {
                    const isAuditable = canAudit && (!item.audited || item.auditStatus === 'NEEDS_CORRECTION' || item.auditStatus === 'REJECTED')
                    const isEditable = canAudit && item.audited && item.auditStatus === 'SUBMITTED' && !!item.auditId
                    const onItemClick = isAuditable ? () => goToAudit(item.id) : isEditable ? () => goToEditAudit(item.auditId!) : undefined
                    return (
                      <div
                        key={item.id}
                        role={onItemClick ? 'button' : undefined}
                        tabIndex={onItemClick ? 0 : undefined}
                        onClick={onItemClick}
                        onKeyDown={onItemClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onItemClick() } } : undefined}
                        className={clsx(
                          'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 sm:px-5 py-2.5',
                          onItemClick && 'cursor-pointer hover:bg-slate-50 transition-colors',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 break-words sm:truncate">{item.name}</p>
                          <p className="text-xs text-slate-400 font-mono break-words sm:truncate">
                            {item.code ?? '—'}
                            {item.plate ? ` · ${item.plate}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
                          {item.audited ? (
                            <StatusPill status={item.auditStatus ?? ''} size="sm" />
                          ) : (
                            <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border bg-red-50 text-red-700 border-red-200 whitespace-nowrap">
                              Sin auditar
                            </span>
                          )}
                          {item.audited && item.hasCirculationCard === false && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                              <IdCard size={12} />
                              Sin tarjeta
                            </span>
                          )}
                          {item.audited && item.hasCirculationCard === false && item.cardUpdateRequested && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-brand-50 text-brand-700 border-brand-200 whitespace-nowrap">
                              <BellRing size={12} />
                              Aviso enviado
                            </span>
                          )}
                          {canAudit && item.audited && item.hasCirculationCard === false && !item.cardUpdateRequested && item.auditId && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); requestCardUpdateMutation.mutate(item.auditId!) }}
                              disabled={requestCardUpdateMutation.isPending}
                              className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                            >
                              <Bell size={13} />
                              Avisar que ya tiene la tarjeta
                            </button>
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
            </SectionCard>
          )
        })
      )}
    </div>
  )
}
