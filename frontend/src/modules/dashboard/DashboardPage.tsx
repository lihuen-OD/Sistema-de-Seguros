import { useState, useMemo } from 'react'
import {
  Package, ShieldCheck, AlertTriangle, Clock,
  FileText, Flame, TrendingUp, CheckCircle2, ArrowRight, X,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueries } from '@tanstack/react-query'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { ChartCard } from '../../shared/components/cards/ChartCard'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { FilterBar } from '../../shared/components/filters/FilterBar'
import { formatCurrencyCompact, formatDate, daysUntil } from '../../shared/utils/format'
import { ASSET_TYPES } from '../../shared/constants'
import { assetsApi } from '../../shared/api/assets.api'
import { policiesApi } from '../../shared/api/policies.api'
import { documentsApi } from '../../shared/api/documents.api'
import { fireExtinguishersApi, fireExtinguisherKeys } from '../../shared/api/fire-extinguishers.api'
import { companiesApi } from '../../shared/api/companies.api'
import { costCentersApi } from '../../shared/api/cost-centers.api'
import { producersApi } from '../../shared/api/producers.api'
import { dashboardApi } from '../../shared/api/dashboard.api'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']

export default function DashboardPage() {
  const navigate = useNavigate()

  // ── Filter state ──────────────────────────────────────────────────
  const [filterCompany, setFilterCompany] = useState('')
  const [filterCostCenter, setFilterCostCenter] = useState('')
  const [filterAssetType, setFilterAssetType] = useState('')

  const activeFilterCount = [filterCompany, filterCostCenter, filterAssetType].filter(Boolean).length

  function clearFilters() {
    setFilterCompany('')
    setFilterCostCenter('')
    setFilterAssetType('')
  }

  function handleCompanyChange(value: string) {
    setFilterCompany(value)
    setFilterCostCenter('')
  }

  // ── Data queries ──────────────────────────────────────────────────
  const { data: allAssets = [], isError: assetsError } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: allFireExtinguishers = [] } = useQuery({ queryKey: fireExtinguisherKeys.all, queryFn: () => fireExtinguishersApi.findAll() })
  const { data: allDocuments = [] } = useQuery({ queryKey: ['documents'], queryFn: documentsApi.findAll })
  const { data: financialDocs = [] } = useQuery({
    queryKey: ['documents', 'financial'],
    queryFn: () => documentsApi.findAllForFinancial(),
    staleTime: 5 * 60 * 1000,
  })
  const { data: allCompanies = [] } = useQuery({ queryKey: ['companies'], queryFn: companiesApi.findAll })
  const { data: allCostCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: costCentersApi.findAll })
  const { data: allProducers = [] } = useQuery({ queryKey: ['producers'], queryFn: producersApi.findAll })
  const { data: charts } = useQuery({
    queryKey: ['dashboard', 'charts', new Date().getFullYear()],
    queryFn: () => dashboardApi.getCharts(new Date().getFullYear()),
    staleTime: 5 * 60 * 1000,
  })

  const taskQueries = useQueries({
    queries: allProducers.map((p) => ({
      queryKey: ['producers', p.id, 'tasks'],
      queryFn: () => producersApi.findTasks(p.id),
      enabled: allProducers.length > 0,
      staleTime: 2 * 60 * 1000,
    })),
  })

  const assetById = useMemo(
    () => new Map(allAssets.map((a) => [a.id, a])),
    [allAssets],
  )

  // ── Cascading cost center options ─────────────────────────────────
  const costCenterOptions = useMemo(
    () => allCostCenters.filter((cc) => cc.status === 'activo'),
    [allCostCenters],
  )

  // ── Filtered datasets ─────────────────────────────────────────────
  const filteredAssets = useMemo(
    () =>
      allAssets.filter((a) => {
        if (filterCompany && a.companyId !== filterCompany) return false
        if (filterCostCenter && a.costCenterId !== filterCostCenter) return false
        if (filterAssetType && a.assetType !== filterAssetType) return false
        return true
      }),
    [filterCompany, filterCostCenter, filterAssetType, allAssets],
  )

  const filteredPolicies = useMemo(
    () =>
      allPolicies.filter((p) => {
        if (!filterCompany && !filterCostCenter && !filterAssetType) return true
        const primaryAssetId = p.assetIds?.[0]
        const asset = primaryAssetId ? assetById.get(primaryAssetId) : undefined
        if (filterCompany && p.companyId !== filterCompany && asset?.companyId !== filterCompany) return false
        if (filterCostCenter && p.costCenterId !== filterCostCenter && asset?.costCenterId !== filterCostCenter) return false
        if (filterAssetType && asset?.assetType !== filterAssetType) return false
        return true
      }),
    [filterCompany, filterCostCenter, filterAssetType, assetById, allPolicies],
  )

  const filteredFireExtinguishers = useMemo(
    () =>
      allFireExtinguishers.filter((fe) => {
        if (!filterCompany && !filterCostCenter && !filterAssetType) return true
        if (!fe.associatedAssetId) return false
        const asset = assetById.get(fe.associatedAssetId)
        if (!asset) return false
        if (filterCompany && asset.companyId !== filterCompany) return false
        if (filterCostCenter && asset.costCenterId !== filterCostCenter) return false
        if (filterAssetType && asset.assetType !== filterAssetType) return false
        return true
      }),
    [filterCompany, filterCostCenter, filterAssetType, assetById, allFireExtinguishers],
  )

  // ── KPI calculations ─────────────────────────────────────────────
  const activeAssets = filteredAssets.filter((a) => a.status === 'activo')
  const totalPatrimonialUsd = activeAssets.reduce((s, a) => s + a.patrimonialValueUsd, 0)

  const vigentePolicies = filteredPolicies.filter((p) => p.status === 'vigente')
  const expiredPolicies = filteredPolicies.filter((p) => p.status === 'vencida')
  const expiringSoon = filteredPolicies.filter((p) => p.status === 'proximo_vencer')
  const totalInsuredArs = vigentePolicies.reduce((s, p) => s + p.insuredAmountArs, 0)

  // Documents — global (no company filter in current model)
  const pendingDocs = allDocuments.filter((d) => d.paymentStatus !== 'PAID')
  const pendingTotal = pendingDocs.reduce((s, d) => s + d.totalAmount, 0)

  const expiredFe = filteredFireExtinguishers.filter((f) => f.status === 'vencido')
  const expiringFe = filteredFireExtinguishers.filter((f) => f.status === 'proximo_vencer')

  const overdueTasks = useMemo(
    () => taskQueries.flatMap((q) => q.data ?? []).filter((t) => t.status === 'vencida'),
    [taskQueries],
  )

  const allInstallments = useMemo(
    () => financialDocs.flatMap((d) => d.installments),
    [financialDocs],
  )
  const pendingInstallments = useMemo(
    () => allInstallments.filter((i) => i.paymentStatus !== 'PAID'),
    [allInstallments],
  )
  const pendingInstallmentsTotal = useMemo(
    () => pendingInstallments.reduce((s, i) => s + i.amount, 0),
    [pendingInstallments],
  )

  // ── Chart data ────────────────────────────────────────────────────
  const activePolicies = filteredPolicies.filter((p) => p.status !== 'vencida')
  const costByInsurer = activePolicies.reduce<Record<string, number>>((acc, p) => {
    acc[p.insuranceCompany] = (acc[p.insuranceCompany] || 0) + p.insuredAmountArs
    return acc
  }, {})
  const insurerChartData = Object.entries(costByInsurer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, value]) => ({ name, value }))

  const policyStatusData = [
    { name: 'Vigentes', value: vigentePolicies.length, color: '#10b981' },
    { name: 'Próx. Vencer', value: expiringSoon.length, color: '#f59e0b' },
    { name: 'Vencidas', value: expiredPolicies.length, color: '#ef4444' },
  ]

  const fireStatusData = [
    { name: 'Vigentes', value: filteredFireExtinguishers.filter((f) => f.status === 'vigente').length, color: '#10b981' },
    { name: 'Próx.', value: expiringFe.length, color: '#f59e0b' },
    { name: 'Vencidos', value: expiredFe.length, color: '#ef4444' },
  ]

  // ── Monthly cost trend ────────────────────────────────────────────
  const monthlyData = charts?.costEvolution ?? []

  // ── Upcoming policy expirations ───────────────────────────────────
  const upcomingPolicies = filteredPolicies
    .filter((p) => {
      const d = daysUntil(p.endDate)
      return d >= 0 && d <= 90
    })
    .sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())
    .slice(0, 6)

  // ── Upcoming installments ─────────────────────────────────────────
  const upcomingInstallments = useMemo(
    () =>
      pendingInstallments
        .filter((i) => { const d = daysUntil(i.dueDate); return d >= 0 && d <= 60 })
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
        .slice(0, 5),
    [pendingInstallments],
  )

  if (assetsError) return <PageContent><ErrorState title="Error al cargar el dashboard" description="No se pudieron cargar los datos. Verificá la conexión e intentá nuevamente." /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Dashboard Ejecutivo"
        subtitle="Resumen operativo y financiero al día de hoy"
        actions={
          <div className="hidden sm:flex items-center gap-2 text-xs">
            <span className="text-slate-400">Datos al</span>
            <span className="font-semibold text-slate-600">{new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
          </div>
        }
      />

      {/* ─── Filter bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <FilterBar
          filters={[
            {
              key: 'company',
              label: 'Empresa',
              value: filterCompany,
              onChange: handleCompanyChange,
              options: allCompanies.map((c) => ({ value: c.id, label: c.name })),
            },
            {
              key: 'costCenter',
              label: 'Centro de Costo',
              value: filterCostCenter,
              onChange: setFilterCostCenter,
              options: costCenterOptions.map((cc) => ({ value: cc.id, label: cc.name })),
            },
            {
              key: 'assetType',
              label: 'Tipo de Activo',
              value: filterAssetType,
              onChange: setFilterAssetType,
              options: ASSET_TYPES.map((t) => ({ value: t, label: t })),
            },
          ]}
        />
        <div className="flex items-center gap-3">
          {activeFilterCount > 0 && (
            <>
              <span className="text-xs text-slate-500 bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2.5 py-0.5 font-medium">
                {activeFilterCount} {activeFilterCount === 1 ? 'filtro activo' : 'filtros activos'}
              </span>
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium transition-colors"
              >
                <X size={12} />
                Limpiar
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── KPI Row 1: Patrimonio y Pólizas ─────────────────────── */}
      <MetricGrid cols={4} className="mb-5">
        <KpiCard
          label="Valor Patrimonial"
          value={`US$ ${(totalPatrimonialUsd / 1_000_000).toFixed(1).replace('.', ',')}M`}
          description={`${activeAssets.length} activos activos`}
          icon={Package}
          variant="info"
          onClick={() => navigate('/assets')}
        />
        <KpiCard
          label="Suma Asegurada"
          value={formatCurrencyCompact(totalInsuredArs, 'ARS')}
          description={`${vigentePolicies.length} pólizas vigentes`}
          icon={ShieldCheck}
          variant="success"
          onClick={() => navigate('/insurance/policies')}
        />
        <KpiCard
          label="Pólizas Vencidas"
          value={expiredPolicies.length}
          description={`${expiringSoon.length} próximas a vencer`}
          icon={AlertTriangle}
          variant={expiredPolicies.length > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/insurance/policies')}
        />
        <KpiCard
          label="Facturas Pendientes"
          value={formatCurrencyCompact(pendingTotal, 'ARS')}
          description={`${pendingDocs.length} documentos`}
          icon={FileText}
          variant={pendingDocs.length > 0 ? 'warning' : 'default'}
          onClick={() => navigate('/insurance/documents')}
        />
      </MetricGrid>

      {/* ─── KPI Row 2: Cuotas, Matafuegos, Tareas ───────────────── */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Cuotas Pendientes"
          value={formatCurrencyCompact(pendingInstallmentsTotal, 'ARS')}
          description={`${pendingInstallments.length} cuotas`}
          icon={Clock}
          variant={pendingInstallments.length > 10 ? 'warning' : 'default'}
          onClick={() => navigate('/insurance/financial-analysis')}
        />
        <KpiCard
          label="Matafuegos Vencidos"
          value={expiredFe.length}
          description={`${expiringFe.length} próximos a vencer`}
          icon={Flame}
          variant={expiredFe.length > 0 ? 'danger' : 'default'}
          onClick={() => navigate('/fire-extinguishers')}
        />
        <KpiCard
          label="Tareas Vencidas"
          value={overdueTasks.length}
          description="Requieren atención inmediata"
          icon={CheckCircle2}
          variant={overdueTasks.length > 0 ? 'danger' : 'success'}
          onClick={() => navigate('/tasks')}
        />
        <KpiCard
          label="Pólizas Total"
          value={filteredPolicies.length}
          description={`${allCompanies.length} empresas aseguradas`}
          icon={TrendingUp}
          variant="default"
          onClick={() => navigate('/insurance/policies')}
        />
      </MetricGrid>

      {/* ─── Charts Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Monthly cost */}
        <ChartCard
          title="Evolución de Costos"
          subtitle="Facturación mensual ARS"
          className="lg:col-span-2"
          height={260}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
              />
              <Tooltip
                formatter={(v: number) => [`AR$ ${(v / 1_000_000).toFixed(2).replace('.', ',')}M`, 'Costo']}
                contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
              />
              <Bar dataKey="costo" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Policy status pie */}
        <ChartCard title="Estado de Pólizas" subtitle="Distribución actual" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={policyStatusData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                {policyStatusData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ─── Charts Row 2 ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Insurer distribution */}
        <ChartCard
          title="Prima por Aseguradora"
          subtitle="Pólizas activas"
          className="lg:col-span-2"
          height={240}
        >
          {insurerChartData.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-slate-400">Sin datos para los filtros seleccionados</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insurerChartData} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
                />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={120} />
                <Tooltip
                  formatter={(v: number) => [formatCurrencyCompact(v, 'ARS'), 'Suma Asegurada']}
                  contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {insurerChartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Fire extinguisher status */}
        <ChartCard title="Matafuegos" subtitle="Estado del parque" height={240}>
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={fireStatusData} cx="50%" cy="50%" outerRadius={60} paddingAngle={2} dataKey="value">
                  {fireStatusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4">
              {fireStatusData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <span className="text-xs text-slate-600">{d.name}: <strong>{d.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </ChartCard>
      </div>

      {/* ─── Tables Row ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Upcoming policy expirations */}
        <SectionCard
          title="Próximos Vencimientos de Pólizas"
          subtitle="Próximos 90 días"
          actions={
            <button
              onClick={() => navigate('/insurance/policies')}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Ver todas <ArrowRight size={12} />
            </button>
          }
          noPadding
        >
          {upcomingPolicies.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Sin vencimientos próximos</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingPolicies.map((p) => {
                const days = daysUntil(p.endDate)
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/insurance/policies/${p.id}`)}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${days <= 30 ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.policyNumber}</p>
                      <p className="text-xs text-slate-500 truncate">{p.insuranceCompany} · {p.insuranceType}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-slate-700">{formatDate(p.endDate)}</p>
                      <p className={`text-xs font-medium ${days <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
                        {days === 0 ? 'Hoy' : `En ${days}d`}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* Upcoming installments */}
        <SectionCard
          title="Próximas Cuotas a Vencer"
          subtitle="Pendientes en los próximos 60 días"
          actions={
            <button
              onClick={() => navigate('/insurance/financial-analysis')}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Ver análisis <ArrowRight size={12} />
            </button>
          }
          noPadding
        >
          {upcomingInstallments.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">Sin cuotas próximas</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingInstallments.map((inst) => {
                const days = daysUntil(inst.dueDate)
                return (
                  <div key={inst.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${days <= 7 ? 'bg-red-400' : 'bg-amber-400'}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">Cuota {inst.installmentNumber}</p>
                      <p className="text-xs text-slate-500">Doc: {inst.accountingDocumentId.replace('doc-', '#')}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatCurrencyCompact(inst.amount, 'ARS')}
                      </p>
                      <p className={`text-xs font-medium ${days <= 7 ? 'text-red-600' : 'text-amber-600'}`}>
                        {formatDate(inst.dueDate)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ─── Alerts row ───────────────────────────────────────────── */}
      {(expiredFe.length > 0 || overdueTasks.length > 0) && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
          {expiredFe.length > 0 && (
            <SectionCard
              title="Matafuegos Vencidos"
              subtitle="Acción requerida"
              noPadding
              actions={
                <button
                  onClick={() => navigate('/fire-extinguishers')}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Ver todos <ArrowRight size={12} />
                </button>
              }
            >
              <div className="divide-y divide-slate-100">
                {expiredFe.slice(0, 4).map((fe) => (
                  <div key={fe.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">{fe.code}</p>
                      <p className="text-xs text-slate-500">{fe.type} · {fe.capacity}</p>
                    </div>
                    <StatusPill status="vencido" size="sm" />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {overdueTasks.length > 0 && (
            <SectionCard
              title="Tareas Vencidas"
              subtitle="Requieren seguimiento"
              noPadding
              actions={
                <button
                  onClick={() => navigate('/tasks')}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Ver todas <ArrowRight size={12} />
                </button>
              }
            >
              <div className="divide-y divide-slate-100">
                {overdueTasks.slice(0, 4).map((task) => (
                  <div key={task.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                      <p className="text-xs text-slate-500">Vencía: {formatDate(task.dueDate)}</p>
                    </div>
                    <StatusPill status={task.priority} size="sm" />
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>
      )}
    </PageContent>
  )
}
