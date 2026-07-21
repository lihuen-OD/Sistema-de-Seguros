import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Plus, Users, ShieldCheck, AlertTriangle, CheckCircle2,
  Phone, Mail, ClipboardList, Clock, ListTodo,
} from 'lucide-react'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { SearchInput } from '../../shared/components/filters/SearchInput'
import { producerQueries } from '../../shared/api/producers.api'
import { policyQueries } from '../../shared/api/policies.api'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'
import type { Producer } from '../../shared/types'

interface ProducerCardStats {
  producer: Producer
  policyCount: number
  activeTasks: number
  overdueTasks: number
}

export default function ProducersPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'' | 'activo' | 'inactivo'>('')

  const { data: allProducers = [], isError } = useQuery(producerQueries.list())
  const { data: allPolicies = [] } = useQuery(policyQueries.list())

  const producerStats: ProducerCardStats[] = useMemo(() => {
    return allProducers.map((p) => {
      const policyCount = allPolicies.filter((pol) => pol.producerId === p.id).length
      return { producer: p, policyCount, activeTasks: 0, overdueTasks: 0 }
    })
  }, [allProducers, allPolicies])

  const filtered = useMemo(() => {
    return producerStats.filter(({ producer }) => {
      const matchSearch =
        !search ||
        producer.name.toLowerCase().includes(search.toLowerCase()) ||
        producer.registrationNumber.toLowerCase().includes(search.toLowerCase()) ||
        producer.email.toLowerCase().includes(search.toLowerCase())
      const matchStatus = !filterStatus || producer.status === filterStatus
      return matchSearch && matchStatus
    })
  }, [producerStats, search, filterStatus])

  // Global KPIs
  const activeProducers = allProducers.filter((p) => p.status === 'activo').length
  const totalPoliciesManaged = allPolicies.length
  const totalOverdueTasks = 0
  const compliancePct = 0

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Productores Asesores"
        subtitle="Cartera de productores y gestión de tareas operativas"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/tasks')}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <ListTodo size={15} />
              Ver Tareas
            </button>
            <button
              onClick={() => navigate('/producers/new')}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Nuevo Productor
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Productores Activos"
          value={activeProducers}
          description={`de ${allProducers.length} totales`}
          icon={Users}
          variant="info"
        />
        <KpiCard
          label="Pólizas Gestionadas"
          value={totalPoliciesManaged}
          description="en cartera total"
          icon={ShieldCheck}
          variant="success"
        />
        <KpiCard
          label="Tareas Vencidas"
          value={totalOverdueTasks}
          description="requieren atención inmediata"
          icon={AlertTriangle}
          variant={totalOverdueTasks > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          label="Cumplimiento"
          value="—"
          description="Calculado desde el detalle de cada productor"
          icon={CheckCircle2}
          variant={compliancePct >= 80 ? 'success' : compliancePct >= 50 ? 'warning' : 'danger'}
        />
      </MetricGrid>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, matrícula o email…"
          className="w-full sm:w-72"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as '' | 'activo' | 'inactivo')}
          className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all min-w-[140px]"
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="inactivo">Inactivo</option>
        </select>
        <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
          {filtered.length} de {allProducers.length} productores
        </span>
      </div>

      {/* Producer grid */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-slate-500 text-sm">No se encontraron productores con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(({ producer, policyCount, activeTasks, overdueTasks }) => (
            <ProducerCard
              key={producer.id}
              producer={producer}
              policyCount={policyCount}
              activeTasks={activeTasks}
              overdueTasks={overdueTasks}
              onClick={() => navigate(`/producers/${producer.id}`)}
            />
          ))}
        </div>
      )}
    </PageContent>
  )
}

// ─── Producer card ────────────────────────────────────────────────────────────

interface ProducerCardProps {
  producer: Producer
  policyCount: number
  activeTasks: number
  overdueTasks: number
  onClick: () => void
}

function ProducerCard({ producer, policyCount, activeTasks, overdueTasks, onClick }: ProducerCardProps) {
  return (
    <div
      onClick={onClick}
      className="card p-5 cursor-pointer hover:border-brand-300 hover:shadow-md transition-all group"
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-800 group-hover:text-brand-700 transition-colors leading-snug truncate">
            {producer.name}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">{producer.registrationNumber || 'Sin matrícula'}</p>
        </div>
        <StatusPill status={producer.status} size="sm" />
      </div>

      {/* Contact */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
          <Phone size={11} className="flex-shrink-0 text-slate-400" />
          <span className="truncate">{producer.phone}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
          <Mail size={11} className="flex-shrink-0 text-slate-400" />
          <span className="truncate">{producer.email}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-2">
        <StatChip icon={ShieldCheck} value={policyCount} label="Pólizas" colorClass="text-brand-600" bgClass="bg-brand-50" />
        <StatChip icon={ClipboardList} value={activeTasks} label="Activas" colorClass="text-amber-600" bgClass="bg-amber-50" />
        <StatChip
          icon={Clock}
          value={overdueTasks}
          label="Vencidas"
          colorClass={overdueTasks > 0 ? 'text-red-600' : 'text-slate-500'}
          bgClass={overdueTasks > 0 ? 'bg-red-50' : 'bg-slate-50'}
        />
      </div>
    </div>
  )
}

function StatChip({
  icon: Icon,
  value,
  label,
  colorClass,
  bgClass,
}: {
  icon: React.ElementType
  value: number
  label: string
  colorClass: string
  bgClass: string
}) {
  return (
    <div className={`${bgClass} rounded-lg p-2.5 flex flex-col items-center gap-1`}>
      <Icon size={13} className={colorClass} />
      <span className={`text-base font-bold leading-none ${colorClass}`}>{value}</span>
      <span className="text-xs text-slate-500 leading-none">{label}</span>
    </div>
  )
}
