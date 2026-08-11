import { useState, useMemo } from 'react'
import {
  Package, ShieldCheck, AlertTriangle, Clock,
  FileText, Flame, TrendingUp, CheckCircle2, ArrowRight, X, ArrowLeftRight,
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
import { MultiSelectFilter } from '../../shared/components/filters/MultiSelectFilter'
import { formatCurrencyCompact, formatCurrencyInteger, formatDate, daysUntil } from '../../shared/utils/format'
import { ASSET_TYPES } from '../../shared/constants'
import { assetQueries } from '../../shared/api/assets.api'
import { policyQueries } from '../../shared/api/policies.api'
import { documentQueries } from '../../shared/api/documents.api'
import { fireExtinguisherQueries } from '../../shared/api/fire-extinguishers.api'
import { companyQueries } from '../../shared/api/companies.api'
import { costCenterQueries } from '../../shared/api/cost-centers.api'
import { producerQueries } from '../../shared/api/producers.api'
import { ErrorState } from '../../shared/components/empty-states/ErrorState'

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4']
const MONTH_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function DashboardPage() {
  const navigate = useNavigate()

  // ── Filter state ──────────────────────────────────────────────────
  const [filterCompanies, setFilterCompanies] = useState<string[]>([])
  const [filterCostCenter, setFilterCostCenter] = useState('')
  const [filterAssetType, setFilterAssetType] = useState('')
  const [costMode, setCostMode] = useState<'vencimientos' | 'facturacion'>('vencimientos')
  const [costModeSpin, setCostModeSpin] = useState(0)

  function toggleCostMode() {
    setCostModeSpin((d) => d + 180)
    setCostMode((m) => (m === 'vencimientos' ? 'facturacion' : 'vencimientos'))
  }

  const activeFilterCount =
    Number(filterCompanies.length > 0) +
    Number(Boolean(filterCostCenter)) +
    Number(Boolean(filterAssetType))
  const hasScopeFilters = activeFilterCount > 0

  function clearFilters() {
    setFilterCompanies([])
    setFilterCostCenter('')
    setFilterAssetType('')
  }

  // ── Data queries ──────────────────────────────────────────────────
  const { data: allAssets = [], isError: assetsError } = useQuery(assetQueries.list())
  // includeCoverages:true — el filtro de alcance (empresa/centro de costo/
  // tipo de activo) más abajo necesita, por póliza, sus líneas de cobertura
  // reales (cada una con su propio activo o su propia imputación empresa/
  // centro de costo cuando es "sin activo").
  const { data: allPolicies = [] } = useQuery(policyQueries.list({ includeCoverages: true }))
  const { data: allFireExtinguishers = [] } = useQuery(fireExtinguisherQueries.list())
  const { data: allDocuments = [] } = useQuery(documentQueries.list())
  const { data: financialDocs = [] } = useQuery(documentQueries.financial())
  const { data: allCompanies = [] } = useQuery(companyQueries.list())
  const { data: allCostCenters = [] } = useQuery(costCenterQueries.list())
  const { data: allProducers = [] } = useQuery(producerQueries.list())

  const taskQueries = useQueries({
    queries: allProducers.map((p) => producerQueries.tasks(p.id)),
  })

  const selectedCompanyIds = useMemo(
    () => new Set(filterCompanies),
    [filterCompanies],
  )

  const assetById = useMemo(
    () => new Map(allAssets.map((a) => [a.id, a])),
    [allAssets],
  )

  const companyOptions = useMemo(
    () =>
      allCompanies
        .map((company) => ({ value: company.id, label: company.name }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    [allCompanies],
  )

  function handleCompanyFilterChange(companyIds: string[]) {
    // Elegir manualmente todas las opciones es equivalente a "Todas":
    // conserva también los registros globales que todavía no tienen empresa.
    setFilterCompanies(
      companyOptions.length > 0 && companyIds.length === companyOptions.length
        ? []
        : companyIds,
    )
  }

  // ── Cascading cost center options ─────────────────────────────────
  const costCenterOptions = useMemo(
    () => allCostCenters.filter((cc) => cc.status === 'activo'),
    [allCostCenters],
  )

  // ── Filtered datasets ─────────────────────────────────────────────
  // El mapa conserva cuánto del valor patrimonial pertenece al alcance elegido.
  // Si un activo está distribuido entre varias empresas/centros de costo, se
  // suma únicamente el porcentaje de las asignaciones que cumplen los filtros.
  const assetScopeRatioById = useMemo(() => {
    const ratios = new Map<string, number>()

    for (const asset of allAssets) {
      if (filterAssetType && asset.assetType !== filterAssetType) continue

      if (filterCompanies.length === 0 && !filterCostCenter) {
        ratios.set(asset.id, 1)
        continue
      }

      const allocations = asset.allocations?.length
        ? asset.allocations
        : [{
            id: `legacy-${asset.id}`,
            companyId: asset.companyId,
            costCenterId: asset.costCenterId,
            percentage: 100,
          }]

      const matchingPercentage = allocations.reduce((total, allocation) => {
        if (filterCompanies.length > 0 && !selectedCompanyIds.has(allocation.companyId)) return total
        if (filterCostCenter && allocation.costCenterId !== filterCostCenter) return total
        return total + allocation.percentage
      }, 0)

      const ratio = Math.min(1, Math.max(0, matchingPercentage / 100))
      if (ratio > 0) ratios.set(asset.id, ratio)
    }

    return ratios
  }, [
    allAssets,
    filterAssetType,
    filterCompanies.length,
    filterCostCenter,
    selectedCompanyIds,
  ])

  const filteredAssets = useMemo(
    () => allAssets.filter((asset) => assetScopeRatioById.has(asset.id)),
    [allAssets, assetScopeRatioById],
  )

  const filteredPolicies = useMemo(
    () =>
      allPolicies.filter((policy) => {
        if (!hasScopeFilters) return true

        // Cada línea de cobertura es o bien un activo (cuya empresa/centro de
        // costo salen de las allocations de ESE activo) o bien "sin activo"
        // (imputada directamente vía coverage.companyId/costCenterId).
        const coverages = policy.coverages ?? []
        const policyAssets = coverages
          .map((c) => (c.assetId ? assetById.get(c.assetId) : undefined))
          .filter((asset): asset is NonNullable<typeof asset> => asset !== undefined)

        const allocationsOf = (asset: NonNullable<typeof policyAssets[number]>) =>
          asset.allocations?.length ? asset.allocations : [{
            companyId: asset.companyId,
            costCenterId: asset.costCenterId,
            percentage: 100,
          }]

        if (filterCompanies.length > 0) {
          const companyMatches = coverages.some((coverage) => {
            if (!coverage.assetId) {
              return coverage.companyId != null && selectedCompanyIds.has(coverage.companyId)
            }
            const asset = assetById.get(coverage.assetId)
            return asset != null && allocationsOf(asset).some((allocation) => selectedCompanyIds.has(allocation.companyId))
          })
          if (!companyMatches) return false
        }

        if (filterCostCenter) {
          const costCenterMatches = coverages.some((coverage) => {
            if (!coverage.assetId) return coverage.costCenterId === filterCostCenter
            const asset = assetById.get(coverage.assetId)
            return asset != null && allocationsOf(asset).some((allocation) =>
              allocation.costCenterId === filterCostCenter &&
              (filterCompanies.length === 0 || selectedCompanyIds.has(allocation.companyId)),
            )
          })
          if (!costCenterMatches) return false
        }

        if (filterAssetType && !policyAssets.some((asset) => asset.assetType === filterAssetType)) return false
        return true
      }),
    [
      allPolicies,
      assetById,
      filterAssetType,
      filterCompanies.length,
      filterCostCenter,
      hasScopeFilters,
      selectedCompanyIds,
    ],
  )

  const filteredAssetIds = useMemo(
    () => new Set(filteredAssets.map((asset) => asset.id)),
    [filteredAssets],
  )

  const filteredPolicyIds = useMemo(
    () => new Set(filteredPolicies.map((policy) => policy.id)),
    [filteredPolicies],
  )

  const filteredFireExtinguishers = useMemo(
    () =>
      allFireExtinguishers.filter((fe) => {
        if (!hasScopeFilters) return true
        if (!fe.associatedAssetId) return false
        return filteredAssetIds.has(fe.associatedAssetId)
      }),
    [allFireExtinguishers, filteredAssetIds, hasScopeFilters],
  )

  // ── KPI calculations ─────────────────────────────────────────────
  // Cada total se suma por columna ya cerrada (Ars/Usd), nunca mezclando
  // registros en distinta moneda dentro del mismo número (ver computeDualAmounts).
  const activeAssets = filteredAssets.filter((a) => a.status === 'activo')
  const totalPatrimonialUsd = activeAssets.reduce(
    (sum, asset) =>
      sum +
      (asset.currentValueUsd ?? asset.patrimonialValueUsd ?? 0) *
        (assetScopeRatioById.get(asset.id) ?? 0),
    0,
  )
  const totalPatrimonialArs = activeAssets.reduce(
    (sum, asset) =>
      sum + (asset.currentValueArs ?? 0) * (assetScopeRatioById.get(asset.id) ?? 0),
    0,
  )

  const vigentePolicies = filteredPolicies.filter((p) => p.status === 'vigente')
  const expiredPolicies = filteredPolicies.filter((p) => p.status === 'vencida')
  const expiringSoon = filteredPolicies.filter((p) => p.status === 'proximo_vencer')
  const totalInsuredArs = vigentePolicies.reduce((s, p) => s + (p.totalInsuredAmountArs ?? 0), 0)
  const totalInsuredUsd = vigentePolicies.reduce((s, p) => s + (p.totalInsuredAmountUsd ?? 0), 0)

  // Los documentos pueden distribuirse entre pólizas de distintas empresas.
  // El ratio evita atribuir el documento completo a cada empresa seleccionada.
  const documentScopeRatioById = useMemo(() => {
    const ratios = new Map<string, number>()

    for (const document of financialDocs) {
      if (!hasScopeFilters) {
        ratios.set(document.id, 1)
        continue
      }

      if (document.allocations.length > 0) {
        const matchingPercentage = document.allocations.reduce(
          (total, allocation) =>
            filteredPolicyIds.has(allocation.policyId)
              ? total + allocation.allocationPercentage
              : total,
          0,
        )
        const ratio = Math.min(1, Math.max(0, matchingPercentage / 100))
        if (ratio > 0) ratios.set(document.id, ratio)
        continue
      }

      if (document.policyIds.some((policyId) => filteredPolicyIds.has(policyId))) {
        ratios.set(document.id, 1)
      }
    }

    return ratios
  }, [financialDocs, filteredPolicyIds, hasScopeFilters])

  const filteredFinancialDocs = useMemo(
    () => financialDocs.filter((document) => documentScopeRatioById.has(document.id)),
    [documentScopeRatioById, financialDocs],
  )

  // Sin filtros se mantiene exactamente la fuente histórica del dashboard.
  // Con un alcance activo se usa la versión financiera, que trae allocations.
  const pendingDocs = (hasScopeFilters ? filteredFinancialDocs : allDocuments)
    .filter((document) => document.paymentStatus !== 'PAID')
  const pendingTotalArs = pendingDocs.reduce(
    (sum, document) =>
      sum +
      (document.totalAmountArs ?? 0) *
        (hasScopeFilters ? documentScopeRatioById.get(document.id) ?? 0 : 1),
    0,
  )
  const pendingTotalUsd = pendingDocs.reduce(
    (sum, document) =>
      sum +
      (document.totalAmountUsd ?? 0) *
        (hasScopeFilters ? documentScopeRatioById.get(document.id) ?? 0 : 1),
    0,
  )

  const expiredFe = filteredFireExtinguishers.filter((f) => f.status === 'vencido')
  const expiringFe = filteredFireExtinguishers.filter((f) => f.status === 'proximo_vencer')

  const allTasks = useMemo(
    () => taskQueries.flatMap((query) => query.data ?? []),
    [taskQueries],
  )

  const overdueTasks = useMemo(
    () =>
      allTasks.filter((task) => {
        if (task.status !== 'vencida') return false
        if (!hasScopeFilters) return true
        return (
          (task.policyId !== null && filteredPolicyIds.has(task.policyId)) ||
          (task.assetId !== null && filteredAssetIds.has(task.assetId))
        )
      }),
    [allTasks, filteredAssetIds, filteredPolicyIds, hasScopeFilters],
  )

  const allInstallments = useMemo(
    () =>
      filteredFinancialDocs.flatMap((document) =>
        document.installments.map((installment) => {
          const scopeRatio = documentScopeRatioById.get(document.id) ?? 0
          return {
            ...installment,
            amount: installment.amount * scopeRatio,
            amountArs: (installment.amountArs ?? 0) * scopeRatio,
            amountUsd: (installment.amountUsd ?? 0) * scopeRatio,
            documentNumber: document.documentNumber,
            insuranceCompany: document.insuranceCompany,
          }
        }),
      ),
    [documentScopeRatioById, filteredFinancialDocs],
  )
  const pendingInstallments = useMemo(
    () => allInstallments.filter((i) => i.paymentStatus !== 'PAID'),
    [allInstallments],
  )
  const pendingInstallmentsTotalArs = useMemo(
    () => pendingInstallments.reduce((s, i) => s + (i.amountArs ?? 0), 0),
    [pendingInstallments],
  )
  const pendingInstallmentsTotalUsd = useMemo(
    () => pendingInstallments.reduce((s, i) => s + (i.amountUsd ?? 0), 0),
    [pendingInstallments],
  )

  // ── Chart data ────────────────────────────────────────────────────
  const activePolicies = filteredPolicies.filter((p) => p.status !== 'vencida')
  const costByInsurer = activePolicies.reduce<Record<string, number>>((acc, p) => {
    acc[p.insuranceCompany] = (acc[p.insuranceCompany] || 0) + (p.totalInsuredAmountArs ?? 0)
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
  // Único cálculo (antes había uno server-side para "sin filtros" y otro
  // client-side para "con filtros" — desincronizados entre sí, ver
  // investigación previa). Ahora siempre se calcula acá, con ratio 1 para
  // todos los documentos cuando no hay filtros de alcance activos (mismo
  // criterio que documentScopeRatioById).
  function emptyMonthlyPoints() {
    return MONTH_ABBR.map((mes) => ({ mes, arsPaid: 0, arsPending: 0, usdPaid: 0, usdPending: 0 }))
  }
  const isPaidStatus = (status: string) => status === 'PAID'

  // Vencimientos: cada cuota cuenta en el mes de su propio vencimiento.
  const costByDueDate = useMemo(() => {
    const points = emptyMonthlyPoints()
    const currentYear = String(new Date().getFullYear())
    for (const installment of allInstallments) {
      if (!installment.dueDate.startsWith(`${currentYear}-`)) continue
      const monthIndex = Number(installment.dueDate.slice(5, 7)) - 1
      if (monthIndex < 0 || monthIndex > 11) continue
      const point = points[monthIndex]
      if (isPaidStatus(installment.paymentStatus)) {
        point.arsPaid += installment.amountArs ?? 0
        point.usdPaid += installment.amountUsd ?? 0
      } else {
        point.arsPending += installment.amountArs ?? 0
        point.usdPending += installment.amountUsd ?? 0
      }
    }
    return points
  }, [allInstallments])

  // Facturación: cada factura (documentType INVOICE — el único tipo con
  // cuotas propias) cuenta entera en el mes de su propia emisión, repartida
  // pagado/pendiente según sus cuotas. Si no tiene ninguna cuota cargada, se
  // usa el total y el estado de pago del documento — así no queda invisible
  // en este gráfico (a diferencia de sumar solo cuotas).
  const costByIssueDate = useMemo(() => {
    const points = emptyMonthlyPoints()
    const currentYear = String(new Date().getFullYear())
    for (const document of filteredFinancialDocs) {
      if (document.documentType !== 'INVOICE') continue
      if (!document.issueDate.startsWith(`${currentYear}-`)) continue
      const monthIndex = Number(document.issueDate.slice(5, 7)) - 1
      if (monthIndex < 0 || monthIndex > 11) continue
      const ratio = documentScopeRatioById.get(document.id) ?? 0
      if (ratio === 0) continue
      const point = points[monthIndex]

      if (document.installments.length > 0) {
        for (const installment of document.installments) {
          const ars = (installment.amountArs ?? 0) * ratio
          const usd = (installment.amountUsd ?? 0) * ratio
          if (isPaidStatus(installment.paymentStatus)) {
            point.arsPaid += ars
            point.usdPaid += usd
          } else {
            point.arsPending += ars
            point.usdPending += usd
          }
        }
      } else {
        const ars = (document.totalAmountArs ?? 0) * ratio
        const usd = (document.totalAmountUsd ?? 0) * ratio
        if (isPaidStatus(document.paymentStatus)) {
          point.arsPaid += ars
          point.usdPaid += usd
        } else {
          point.arsPending += ars
          point.usdPending += usd
        }
      }
    }
    return points
  }, [filteredFinancialDocs, documentScopeRatioById])

  const monthlyData = costMode === 'vencimientos' ? costByDueDate : costByIssueDate

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
          <div className="hidden sm:flex flex-col items-end gap-0.5 text-xs">
            <span className="font-semibold text-slate-700">
              {filterCompanies.length === 0
                ? 'Todas las empresas'
                : filterCompanies.length === 1
                  ? allCompanies.find((company) => company.id === filterCompanies[0])?.name ?? '1 empresa'
                  : `${filterCompanies.length} empresas seleccionadas`}
            </span>
            <span className="text-slate-400">
              Datos al {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </div>
        }
      />

      {/* ─── Filter bar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5 bg-white border border-slate-200 rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap hidden sm:block">
              Empresas
            </span>
            <MultiSelectFilter
              label={filterCompanies.length === 0 ? 'Todas las empresas' : 'Empresas'}
              options={companyOptions}
              value={filterCompanies}
              onChange={handleCompanyFilterChange}
            />
          </div>
          <FilterBar
            filters={[
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
        </div>
        <div className="flex items-center gap-3">
          {activeFilterCount > 0 && (
            <>
              <span className="text-xs text-slate-500 bg-brand-50 text-brand-700 border border-brand-100 rounded-full px-2.5 py-0.5 font-medium">
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
          currency={{ ars: totalPatrimonialArs, usd: totalPatrimonialUsd, primary: 'usd' }}
          description={`${activeAssets.length} activos activos`}
          icon={Package}
          variant="info"
          onClick={() => navigate('/assets')}
        />
        <KpiCard
          label="Suma Asegurada"
          currency={{ ars: totalInsuredArs, usd: totalInsuredUsd, primary: 'ars' }}
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
          currency={{ ars: pendingTotalArs, usd: pendingTotalUsd, primary: 'ars' }}
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
          currency={{ ars: pendingInstallmentsTotalArs, usd: pendingInstallmentsTotalUsd, primary: 'ars' }}
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
          description={`${filterCompanies.length || allCompanies.length} empresas en alcance`}
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
          subtitle={
            costMode === 'vencimientos'
              ? 'Cuotas por fecha de vencimiento — ARS y USD'
              : 'Facturas por fecha de emisión — ARS y USD'
          }
          actions={
            <button
              type="button"
              onClick={toggleCostMode}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-full px-3 py-1.5 transition-colors"
            >
              <ArrowLeftRight
                size={12}
                className="transition-transform duration-300"
                style={{ transform: `rotate(${costModeSpin}deg)` }}
              />
              Ver por {costMode === 'vencimientos' ? 'facturación' : 'vencimiento'}
            </button>
          }
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
                formatter={(v: number, name: string) => [formatCurrencyInteger(v, name.includes('USD') ? 'USD' : 'ARS'), name]}
                contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
              <Bar dataKey="arsPaid" stackId="ars" name="ARS pagado" fill="#1d4ed8" />
              <Bar dataKey="arsPending" stackId="ars" name="ARS pendiente" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="usdPaid" stackId="usd" name="USD pagado" fill="#047857" />
              <Bar dataKey="usdPending" stackId="usd" name="USD pendiente" fill="#6ee7b7" radius={[4, 4, 0, 0]} />
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
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
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
                      <p className="text-xs text-slate-500 truncate">{p.insuranceCompany} · {(p.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'}</p>
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
              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
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
                      <p className="text-xs text-slate-500 truncate">
                        {inst.documentNumber}
                        {inst.insuranceCompany ? ` · ${inst.insuranceCompany}` : ''}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-slate-800">
                        {formatCurrencyCompact(inst.amount, inst.currency)}
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
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
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
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
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
