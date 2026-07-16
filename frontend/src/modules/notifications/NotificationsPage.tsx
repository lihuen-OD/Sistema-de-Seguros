import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, ShieldCheck, Flame, CreditCard, Paperclip, AlertTriangle, Clock, CheckCircle2, Circle, CheckCheck } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import { formatDate, daysUntil } from '../../shared/utils/format'
import { notificationsApi, notificationKeys, notificationQueries } from '../../shared/api/notifications.api'
import type { NotificationItem, NotificationCategory, ReviewNotificationInput } from '../../shared/api/notifications.api'
import { ROUTES } from '../../app/routes'
import type { TableColumn } from '../../shared/types'

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  policy: 'Póliza',
  fire_extinguisher: 'Matafuego',
  installment_overdue: 'Cuota vencida',
  installment_near: 'Cuota próxima',
  asset_attachment: 'Adjunto de Activo',
  policy_attachment: 'Adjunto de Póliza',
}

const CATEGORY_ICONS: Record<NotificationCategory, React.ElementType> = {
  policy: ShieldCheck,
  fire_extinguisher: Flame,
  installment_overdue: CreditCard,
  installment_near: CreditCard,
  asset_attachment: Paperclip,
  policy_attachment: Paperclip,
}

function resolveLink(item: NotificationItem): string {
  switch (item.entityType) {
    case 'Policy':
      return ROUTES.POLICIES_DETAIL(item.entityId)
    case 'FireExtinguisher':
      return ROUTES.FIRE_EXTINGUISHERS_DETAIL(item.entityId)
    case 'AccountingDocument':
      return ROUTES.DOCUMENTS_DETAIL(item.entityId)
    case 'Asset':
      return ROUTES.ASSETS_DETAIL(item.entityId)
  }
}

function toKey(item: NotificationItem): ReviewNotificationInput {
  return { notificationId: item.id, dueDate: item.dueDate }
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')
  const [showReviewed, setShowReviewed] = useState(false)

  const { data: items = [], isLoading, isError } = useQuery(notificationQueries.list())

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: notificationKeys.list })
    queryClient.invalidateQueries({ queryKey: notificationKeys.preview })
  }

  const reviewMutation = useMutation({
    mutationFn: (payload: ReviewNotificationInput[]) => notificationsApi.review(payload),
    onSuccess: invalidate,
  })
  const unreviewMutation = useMutation({
    mutationFn: (payload: ReviewNotificationInput[]) => notificationsApi.unreview(payload),
    onSuccess: invalidate,
  })

  function handleToggleReviewed(item: NotificationItem) {
    const payload = [toKey(item)]
    if (item.reviewed) unreviewMutation.mutate(payload)
    else reviewMutation.mutate(payload)
  }

  const pending = useMemo(() => items.filter((i) => !i.reviewed), [items])
  const vencidosCount = pending.filter((i) => i.severity === 'vencido').length
  const proximosCount = pending.filter((i) => i.severity === 'proximo_vencer').length

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (!showReviewed && item.reviewed) return false
      const matchCategory = !filterCategory || item.category === filterCategory
      const matchSeverity = !filterSeverity || item.severity === filterSeverity
      return matchCategory && matchSeverity
    })
  }, [items, filterCategory, filterSeverity, showReviewed])

  const pendingVencidasInView = filtered.filter((i) => i.severity === 'vencido' && !i.reviewed)

  function handleReviewAllVencidas() {
    reviewMutation.mutate(pendingVencidasInView.map(toKey))
  }

  const categoryOptions = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))
  const severityOptions = [
    { value: 'vencido', label: 'Vencido' },
    { value: 'proximo_vencer', label: 'Próximo a vencer' },
  ]

  const columns: TableColumn<NotificationItem>[] = [
    {
      key: 'category',
      label: 'Categoría',
      render: (v) => {
        const category = v as NotificationCategory
        const Icon = CATEGORY_ICONS[category]
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Icon size={13} className="text-slate-400 flex-shrink-0" />
            {CATEGORY_LABELS[category]}
          </span>
        )
      },
    },
    {
      key: 'title',
      label: 'Detalle',
      render: (v, row) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="text-sm font-medium text-slate-800 truncate">{String(v)}</p>
          {row.subtitle && <p className="text-xs text-slate-400 truncate">{row.subtitle}</p>}
        </div>
      ),
    },
    {
      key: 'dueDate',
      label: 'Vencimiento',
      render: (v) => {
        const days = daysUntil(v as string)
        return (
          <span className={clsx('text-xs font-medium', days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-600')}>
            {formatDate(v as string)}
            {days < 0 && <span className="ml-1 text-red-400">({Math.abs(days)}d atrás)</span>}
            {days >= 0 && days <= 7 && <span className="ml-1 text-amber-400">({days}d)</span>}
          </span>
        )
      },
    },
    {
      key: 'severity',
      label: 'Estado',
      render: (v) => (
        <StatusPill status={v as string} label={v === 'vencido' ? 'Vencido' : 'Próx. vencer'} size="sm" />
      ),
    },
    {
      key: 'id',
      label: '',
      className: 'w-10',
      render: (_, row) => (
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleReviewed(row) }}
          title={row.reviewed ? 'Marcar como no revisado' : 'Marcar como revisado'}
          aria-label={row.reviewed ? 'Marcar como no revisado' : 'Marcar como revisado'}
          className={clsx(
            'p-1.5 rounded-lg transition-colors',
            row.reviewed ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:text-emerald-600 hover:bg-emerald-50',
          )}
        >
          {row.reviewed ? <CheckCircle2 size={17} /> : <Circle size={17} />}
        </button>
      ),
    },
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Notificaciones"
        subtitle="Vencimientos y alertas de todo el sistema"
        actions={
          pendingVencidasInView.length > 0 && (
            <button
              onClick={handleReviewAllVencidas}
              disabled={reviewMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              <CheckCheck size={16} />
              Marcar vencidas como revisadas
            </button>
          )
        }
      />

      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label="Total"
          value={pending.length}
          description="alertas por revisar"
          icon={Bell}
          variant={pending.length > 0 ? 'warning' : 'default'}
        />
        <KpiCard
          label="Vencidos"
          value={vencidosCount}
          description="ya superaron la fecha"
          icon={AlertTriangle}
          variant={vencidosCount > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          label="Próximos a vencer"
          value={proximosCount}
          description="dentro de los próximos 30 días"
          icon={Clock}
          variant={proximosCount > 0 ? 'warning' : 'default'}
        />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <FilterBar
            filters={[
              { key: 'category', label: 'Categoría', options: categoryOptions, value: filterCategory, onChange: setFilterCategory },
              { key: 'severity', label: 'Estado', options: severityOptions, value: filterSeverity, onChange: setFilterSeverity },
            ]}
          >
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={showReviewed}
                onChange={(e) => setShowReviewed(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
              />
              Mostrar revisadas
            </label>
          </FilterBar>
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {items.length} notificaciones
          </span>
        </div>

        <DataTable
          columns={columns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          emptyTitle="Sin notificaciones"
          emptyDescription="No hay vencimientos próximos ni pendientes."
          onRowClick={(row) => navigate(resolveLink(row))}
          rowClassName={(row, idx) =>
            clsx(
              idx % 2 === 1 && 'bg-slate-50/40',
              'hover:bg-blue-50/50',
              row.reviewed && 'opacity-50',
              !row.reviewed && row.severity === 'vencido' && 'border-l-2 border-l-red-400',
              !row.reviewed && row.severity === 'proximo_vencer' && 'border-l-2 border-l-amber-400',
            )
          }
          minWidth={760}
        />
      </SectionCard>
    </PageContent>
  )
}
