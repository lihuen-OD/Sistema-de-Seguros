import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, ClipboardCheck, AlertTriangle, CheckCircle2, XCircle, X, FileText } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { Tabs, type TabItem } from '../../../shared/components/tabs/Tabs'
import { formatDate } from '../../../shared/utils/format'
import { useCurrentUser } from '../../../app/auth/AuthContext'
import {
  fireExtinguisherAuditQueries,
  type FireExtinguisherAuditListItem,
} from '../../../shared/api/fire-extinguisher-audits.api'
import { FIRE_EXT_AUDIT_STATUS_LABELS } from '../../../shared/constants'
import { ROUTES } from '../../../app/routes'
import type { TableColumn } from '../../../shared/types'
import { AuditCoverageTab } from './AuditCoverageTab'

const STATUS_OPTIONS = Object.entries(FIRE_EXT_AUDIT_STATUS_LABELS).map(([value, label]) => ({ value, label }))

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function FireExtinguisherAuditsQueuePage() {
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  // Auditar y revisar/aprobar son permisos separados — ver el detalle en
  // fire-extinguisher-audits.router.ts (requireModule distinto en cada ruta).
  const canReview = user?.role === 'ADMIN' || (user?.modules.includes('fire_extinguisher_audits') ?? false)
  const canAudit = user?.role === 'ADMIN' || (user?.modules.includes('fire_extinguisher_audit_coverage') ?? false)

  const [activeTab, setActiveTab] = useState<'auditorias' | 'cobertura'>('cobertura')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [coveragePeriod, setCoveragePeriod] = useState(currentPeriod())

  const { data: all = [], isLoading, isError } = useQuery(fireExtinguisherAuditQueries.list())

  const { data: coverage = [], isLoading: coverageLoading } = useQuery(fireExtinguisherAuditQueries.coverage(coveragePeriod))

  const pendingCoverageCount = useMemo(() => coverage.filter((c) => !c.audited).length, [coverage])

  // Sin permiso de revisión no hay pestaña "Auditorías" para elegir — el
  // auditor cae directo (y solo puede caer) en Cobertura.
  const tabs: TabItem[] = canReview
    ? [
        { id: 'auditorias', label: 'Auditorías' },
        { id: 'cobertura', label: 'Cobertura', count: pendingCoverageCount },
      ]
    : []

  const counts = useMemo(
    () => ({
      SUBMITTED: all.filter((a) => a.status === 'SUBMITTED').length,
      NEEDS_CORRECTION: all.filter((a) => a.status === 'NEEDS_CORRECTION').length,
      APPROVED: all.filter((a) => a.status === 'APPROVED').length,
      REJECTED: all.filter((a) => a.status === 'REJECTED').length,
    }),
    [all],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return all.filter((a) => {
      const matchStatus = filterStatus.length === 0 || filterStatus.includes(a.status)
      const matchSearch =
        !q ||
        [
          a.extinguisher?.code,
          a.extinguisher?.cylinderNumber,
          a.extinguisher?.type,
          a.extinguisher?.establishment,
          a.extinguisher?.associatedLocationType,
          a.auditedBy,
        ]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(q))
      const matchDateFrom = !filterDateFrom || a.auditPeriod >= filterDateFrom
      const matchDateTo = !filterDateTo || a.auditPeriod <= filterDateTo
      return matchStatus && matchSearch && matchDateFrom && matchDateTo
    })
  }, [all, search, filterStatus, filterDateFrom, filterDateTo])

  function toggleStatusFilter(status: string) {
    setFilterStatus((prev) => (prev.length === 1 && prev[0] === status ? [] : [status]))
  }

  const columns: TableColumn<FireExtinguisherAuditListItem>[] = [
    {
      key: 'extinguisher',
      label: 'Matafuego',
      render: (_, row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {row.extinguisher?.code ?? '—'}
            {row.extinguisher?.cylinderNumber ? ` · ${row.extinguisher.cylinderNumber}` : ''}
          </p>
          <p className="text-xs text-slate-500">{row.extinguisher?.type ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'establishment',
      label: 'Establecimiento',
      render: (_, row) =>
        row.extinguisher?.establishment ? (
          <div className="min-w-0">
            <span className="block text-sm text-slate-600">{row.extinguisher.establishment}</span>
            <span className="block text-xs text-slate-400 mt-0.5">{row.extinguisher.associatedLocationType}</span>
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    { key: 'auditPeriod', label: 'Período', render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    { key: 'auditedBy', label: 'Auditor', render: (v) => <span className="text-sm text-slate-600">{v as string}</span> },
    {
      key: 'auditDate',
      label: 'Fecha',
      render: (v) => <span className="text-sm text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    {
      key: 'proposedChangesCount',
      label: 'Cambios propuestos',
      render: (v) => {
        const count = v as number
        return count > 0 ? (
          <span className="inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
            {count}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        )
      },
    },
    { key: 'status', label: 'Estado', render: (v) => <StatusPill status={v as string} size="sm" /> },
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Auditorías de Matafuegos"
        subtitle="Revisión y aprobación de auditorías enviadas por los auditores"
        actions={
          canAudit ? (
            <button
              onClick={() => navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_NEW)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Nueva auditoría
            </button>
          ) : undefined
        }
      />

      {canReview && (
        <SectionCard noPadding className="mb-5">
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as 'auditorias' | 'cobertura')} />
        </SectionCard>
      )}

      {activeTab === 'auditorias' && canReview && (
        <>
          <MetricGrid cols={4} className="mb-5">
            <KpiCard
              label="Pendientes de revisión"
              value={counts.SUBMITTED}
              description="Esperando decisión"
              icon={ClipboardCheck}
              variant="info"
              onClick={() => toggleStatusFilter('SUBMITTED')}
            />
            <KpiCard
              label="Requieren corrección"
              value={counts.NEEDS_CORRECTION}
              description="Devueltas al auditor"
              icon={AlertTriangle}
              variant="warning"
              onClick={() => toggleStatusFilter('NEEDS_CORRECTION')}
            />
            <KpiCard
              label="Aprobadas"
              value={counts.APPROVED}
              description="Cambios aplicados al maestro"
              icon={CheckCircle2}
              variant="success"
              onClick={() => toggleStatusFilter('APPROVED')}
            />
            <KpiCard
              label="Rechazadas"
              value={counts.REJECTED}
              description="Sin cambios aplicados"
              icon={XCircle}
              variant="danger"
              onClick={() => toggleStatusFilter('REJECTED')}
            />
          </MetricGrid>

          <SectionCard noPadding>
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Buscar por matafuego, establecimiento o auditor…"
                className="w-full sm:w-80"
              />
              <MultiSelectFilter label="Estado" options={STATUS_OPTIONS} value={filterStatus} onChange={setFilterStatus} />
              <DateRangeMonthPicker
                from={filterDateFrom}
                to={filterDateTo}
                onChange={(from, to) => { setFilterDateFrom(from); setFilterDateTo(to) }}
              />
              {(filterDateFrom || filterDateTo) && (
                <button
                  type="button"
                  onClick={() => { setFilterDateFrom(''); setFilterDateTo('') }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <X size={12} />
                  Limpiar fechas
                </button>
              )}
              <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                {filtered.length} de {all.length} auditorías
              </span>
              <button
                type="button"
                onClick={() => navigate(`${ROUTES.FIRE_EXTINGUISHERS_AUDIT_FINDINGS_REPORT}?period=${coveragePeriod}`)}
                className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors whitespace-nowrap"
              >
                <FileText size={13} />
                Ver informe de auditoría
              </button>
            </div>

            <DataTable
              columns={columns}
              data={filtered}
              rowKey="id"
              loading={isLoading}
              onRowClick={(row) => navigate(ROUTES.FIRE_EXTINGUISHERS_AUDIT_DETAIL(row.id))}
              emptyTitle="Sin auditorías"
              emptyDescription="No se encontraron auditorías con los filtros aplicados."
              minWidth={900}
            />
          </SectionCard>
        </>
      )}

      {(activeTab === 'cobertura' || !canReview) && (
        <AuditCoverageTab
          period={coveragePeriod}
          onPeriodChange={setCoveragePeriod}
          data={coverage}
          isLoading={coverageLoading}
          canAudit={canAudit}
        />
      )}
    </PageContent>
  )
}
