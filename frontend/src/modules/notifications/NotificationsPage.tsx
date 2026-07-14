import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, ShieldCheck, Flame, CreditCard, Paperclip, AlertTriangle, Clock } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
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
import { notificationQueries } from '../../shared/api/notifications.api'
import type { NotificationItem, NotificationCategory } from '../../shared/api/notifications.api'
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

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')

  const { data: items = [], isLoading, isError } = useQuery(notificationQueries.list())

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchCategory = !filterCategory || item.category === filterCategory
      const matchSeverity = !filterSeverity || item.severity === filterSeverity
      return matchCategory && matchSeverity
    })
  }, [items, filterCategory, filterSeverity])

  const vencidosCount = items.filter((i) => i.severity === 'vencido').length
  const proximosCount = items.filter((i) => i.severity === 'proximo_vencer').length

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
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader title="Notificaciones" subtitle="Vencimientos y alertas de todo el sistema" />

      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label="Total"
          value={items.length}
          description="alertas activas"
          icon={Bell}
          variant={items.length > 0 ? 'warning' : 'default'}
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
          />
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
              row.severity === 'vencido' && 'border-l-2 border-l-red-400',
              row.severity === 'proximo_vencer' && 'border-l-2 border-l-amber-400',
            )
          }
          minWidth={720}
        />
      </SectionCard>
    </PageContent>
  )
}
