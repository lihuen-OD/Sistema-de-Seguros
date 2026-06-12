import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { TrendingUp, Building2, FileText } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import { mockDocuments, mockDocumentAllocations } from '../../../data/mock-documents'
import { mockPolicies } from '../../../data/mock-policies'
import { mockAssets } from '../../../data/mock-assets'
import { mockCostCenters } from '../../../data/mock-cost-centers'
import { mockCompanies } from '../../../data/mock-companies'
import type { Currency } from '../../../shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const USD_RATE = 970

const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
]

type RowGrouping = 'empresa' | 'centro_costo' | 'aseguradora' | 'poliza' | 'activo'
type ColPeriod = 'mes' | 'trimestre' | 'año'

// ─── Dynamic period generators ────────────────────────────────────────────────

function generateMonthRange(
  from: string,
  to: string,
): { key: string; label: string; year: number; month: number }[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const months: { key: string; label: string; year: number; month: number }[] = []
  let y = fy
  let m = fm // 1-indexed

  while ((y < ty || (y === ty && m <= tm)) && months.length < 60) {
    const d = new Date(y, m - 1, 1)
    const key = `${y}-${String(m).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    months.push({ key, label, year: y, month: m - 1 }) // month 0-indexed
    m++
    if (m > 12) { m = 1; y++ }
  }

  return months
}

// ─── Currency conversion ───────────────────────────────────────────────────────

function convertAmount(amount: number, fromCurrency: Currency, toCurrency: Currency): number {
  if (fromCurrency === toCurrency) return amount
  if (fromCurrency === 'ARS' && toCurrency === 'USD') return amount / USD_RATE
  if (fromCurrency === 'USD' && toCurrency === 'ARS') return amount * USD_RATE
  return amount
}

// ─── Policy context builder ───────────────────────────────────────────────────

function buildPolicyContext() {
  const map = new Map<string, {
    companyId: string
    costCenterId: string
    assetId: string | null
    insuranceCompany: string
  }>()

  mockPolicies.forEach((pol) => {
    let companyId = pol.companyId ?? ''
    let costCenterId = pol.costCenterId ?? ''
    const assetId = pol.assetId

    if (assetId) {
      const asset = mockAssets.find((a) => a.id === assetId)
      if (asset) {
        companyId = companyId || asset.companyId
        costCenterId = costCenterId || asset.costCenterId
      }
    }
    map.set(pol.id, { companyId, costCenterId, assetId, insuranceCompany: pol.insuranceCompany })
  })
  return map
}

function buildDocumentAllocMap(): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>()
  mockDocumentAllocations.forEach((alloc) => {
    if (!map.has(alloc.accountingDocumentId)) map.set(alloc.accountingDocumentId, new Map())
    const inner = map.get(alloc.accountingDocumentId)!
    inner.set(alloc.policyId, alloc.allocationPercentage / 100)
  })
  return map
}

// ─── Row descriptor ───────────────────────────────────────────────────────────

interface MatrixRow {
  id: string
  label: string
  sublabel?: string
}

function getRows(grouping: RowGrouping): MatrixRow[] {
  switch (grouping) {
    case 'empresa':
      return mockCompanies
        .filter((c) => c.status === 'activo')
        .map((c) => ({ id: c.id, label: c.name }))
    case 'centro_costo':
      return mockCostCenters
        .filter((cc) => cc.status === 'activo')
        .map((cc) => {
          const company = mockCompanies.find((c) => c.id === cc.companyId)
          return { id: cc.id, label: cc.name, sublabel: company?.name }
        })
    case 'aseguradora': {
      const companies = Array.from(new Set(mockPolicies.map((p) => p.insuranceCompany))).sort()
      return companies.map((name) => ({ id: name, label: name }))
    }
    case 'poliza':
      return mockPolicies
        .filter((p) => p.status !== 'vencida')
        .map((p) => ({
          id: p.id,
          label: p.policyNumber,
          sublabel: `${p.insuranceType} · ${p.insuranceCompany}`,
        }))
    case 'activo':
      return mockAssets.map((a) => ({
        id: a.id,
        label: a.name,
        sublabel: `${a.internalCode} · ${a.assetType}`,
      }))
  }
}

// ─── Matrix data builder ──────────────────────────────────────────────────────

type EconomicMatrixData = Map<string, Map<string, number>>

function buildEconomicMatrix(grouping: RowGrouping, displayCurrency: Currency): EconomicMatrixData {
  const policyCtx = buildPolicyContext()
  const allocMap = buildDocumentAllocMap()
  const matrix: EconomicMatrixData = new Map()

  mockDocuments.forEach((doc) => {
    const monthKey = doc.issueDate.substring(0, 7)
    const docAmountInDisplay = convertAmount(doc.totalAmount, doc.currency, displayCurrency)
    const docAllocs = allocMap.get(doc.id)
    if (!docAllocs || docAllocs.size === 0) return

    docAllocs.forEach((pctOfDoc, policyId) => {
      const policyAmount = docAmountInDisplay * pctOfDoc
      const ctx = policyCtx.get(policyId)
      if (!ctx) return

      const rowIds: string[] = []
      switch (grouping) {
        case 'empresa':
          if (ctx.companyId) rowIds.push(ctx.companyId)
          break
        case 'centro_costo':
          if (ctx.costCenterId) rowIds.push(ctx.costCenterId)
          break
        case 'aseguradora':
          rowIds.push(ctx.insuranceCompany)
          break
        case 'poliza':
          rowIds.push(policyId)
          break
        case 'activo':
          if (ctx.assetId) rowIds.push(ctx.assetId)
          break
      }

      rowIds.forEach((rowId) => {
        if (!matrix.has(rowId)) matrix.set(rowId, new Map())
        const rowMap = matrix.get(rowId)!
        rowMap.set(monthKey, (rowMap.get(monthKey) ?? 0) + policyAmount)
      })
    })
  })

  return matrix
}

// ─── Custom tooltips ──────────────────────────────────────────────────────────

interface BarTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency: Currency
}

function BarTooltip({ active, payload, label, currency }: BarTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
      <p className="font-semibold text-slate-700 mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-slate-600">{entry.name}</span>
          </span>
          <span className="font-medium text-slate-800">
            {formatCurrencyCompact(entry.value, currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

interface PieTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; payload: { percent: number } }[]
  currency: Currency
}

function PieTooltip({ active, payload, currency }: PieTooltipProps) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs min-w-[180px]">
      <p className="font-semibold text-slate-700 mb-1">{entry.name}</p>
      <p className="text-slate-600">{formatCurrencyFull(entry.value, currency)}</p>
      <p className="text-slate-400 mt-0.5">{(entry.payload.percent * 100).toFixed(1)}% del total</p>
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function EconomicAnalysisPage() {
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [grouping, setGrouping] = useState<RowGrouping>('empresa')
  const [colPeriod, setColPeriod] = useState<ColPeriod>('mes')
  const [dateFrom, setDateFrom] = useState('2025-07')
  const [dateTo, setDateTo] = useState('2026-06')

  // ─── Period columns (derived from date range) ─────────────────────────────
  const viewMonths = useMemo(() => generateMonthRange(dateFrom, dateTo), [dateFrom, dateTo])

  const viewQuarters = useMemo(() => {
    const seen = new Set<string>()
    const result: { key: string; label: string; months: string[] }[] = []
    viewMonths.forEach(({ year, month }) => {
      const q = Math.floor(month / 3) + 1
      const qKey = `${year}-Q${q}`
      if (!seen.has(qKey)) {
        seen.add(qKey)
        const qMonths: string[] = []
        for (let mo = (q - 1) * 3 + 1; mo <= q * 3; mo++) {
          qMonths.push(`${year}-${String(mo).padStart(2, '00')}`)
        }
        result.push({ key: qKey, label: `Q${q} ${year}`, months: qMonths })
      }
    })
    return result
  }, [viewMonths])

  const viewYears = useMemo(() => {
    const seen = new Set<string>()
    const result: { key: string; label: string; months: string[] }[] = []
    viewMonths.forEach(({ key }) => {
      const y = key.split('-')[0]
      if (!seen.has(y)) {
        seen.add(y)
        const yMonths: string[] = []
        for (let mo = 1; mo <= 12; mo++) {
          yMonths.push(`${y}-${String(mo).padStart(2, '0')}`)
        }
        result.push({ key: y, label: y, months: yMonths })
      }
    })
    return result
  }, [viewMonths])

  const matrixData = useMemo(() => buildEconomicMatrix(grouping, currency), [grouping, currency])
  const rows = useMemo(() => getRows(grouping), [grouping])

  // ─── Column definitions based on period ──────────────────────────────────────
  const columns = useMemo(() => {
    if (colPeriod === 'mes') return viewMonths
    if (colPeriod === 'trimestre') return viewQuarters.map((q) => ({ key: q.key, label: q.label }))
    return viewYears.map((y) => ({ key: y.key, label: y.label }))
  }, [colPeriod, viewMonths, viewQuarters, viewYears])

  // ─── Cell aggregation ─────────────────────────────────────────────────────────
  function getCellAmount(rowId: string, colKey: string): number {
    const rowMap = matrixData.get(rowId)
    if (!rowMap) return 0

    if (colPeriod === 'mes') return rowMap.get(colKey) ?? 0

    if (colPeriod === 'trimestre') {
      const q = viewQuarters.find((q) => q.key === colKey)
      if (!q) return 0
      return q.months.reduce((sum, mk) => sum + (rowMap.get(mk) ?? 0), 0)
    }

    const y = viewYears.find((y) => y.key === colKey)
    if (!y) return 0
    return y.months.reduce((sum, mk) => sum + (rowMap.get(mk) ?? 0), 0)
  }

  function getRowTotal(rowId: string): number {
    return columns.reduce((sum, col) => sum + getCellAmount(rowId, col.key), 0)
  }

  // ─── KPIs + pie data (single pass, filtered by date range) ───────────────────
  const { kpis, pieChartData } = useMemo(() => {
    let totalCost = 0
    const byInsurer = new Map<string, number>()
    const allocedPolicies = new Set<string>()
    const policyCtx = buildPolicyContext()
    const allocMap = buildDocumentAllocMap()

    mockDocuments.forEach((doc) => {
      const monthKey = doc.issueDate.substring(0, 7)
      if (monthKey < dateFrom || monthKey > dateTo) return

      const docAmount = convertAmount(doc.totalAmount, doc.currency, currency)
      totalCost += docAmount

      const docAllocs = allocMap.get(doc.id)
      if (!docAllocs) return

      docAllocs.forEach((pct, policyId) => {
        allocedPolicies.add(policyId)
        const ctx = policyCtx.get(policyId)
        if (!ctx) return
        byInsurer.set(ctx.insuranceCompany, (byInsurer.get(ctx.insuranceCompany) ?? 0) + docAmount * pct)
      })
    })

    let topInsurer = { name: '—', amount: 0 }
    byInsurer.forEach((amount, name) => {
      if (amount > topInsurer.amount) topInsurer = { name, amount }
    })

    const pie = Array.from(byInsurer.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    return {
      kpis: { totalCost, topInsurer, policiesWithCost: allocedPolicies.size },
      pieChartData: pie,
    }
  }, [currency, dateFrom, dateTo])

  // ─── Bar chart: monthly costs for selected range ──────────────────────────────
  const barChartData = useMemo(() => {
    return viewMonths.map(({ key, label }) => {
      let total = 0
      mockDocuments.forEach((doc) => {
        if (doc.issueDate.substring(0, 7) === key) {
          total += convertAmount(doc.totalAmount, doc.currency, currency)
        }
      })
      return { label, total }
    })
  }, [viewMonths, currency])

  // ─── Column totals ────────────────────────────────────────────────────────────
  function getColumnTotal(colKey: string): number {
    return rows.reduce((sum, row) => sum + getCellAmount(row.id, colKey), 0)
  }

  function fmtCell(value: number): string {
    if (value === 0) return '—'
    return formatCurrencyCompact(value, currency)
  }

  // ─── UI config ────────────────────────────────────────────────────────────────
  const groupingButtons: { value: RowGrouping; label: string }[] = [
    { value: 'empresa', label: 'Empresa' },
    { value: 'centro_costo', label: 'Centro Costo' },
    { value: 'aseguradora', label: 'Aseguradora' },
    { value: 'poliza', label: 'Póliza' },
    { value: 'activo', label: 'Activo' },
  ]

  const periodButtons: { value: ColPeriod; label: string }[] = [
    { value: 'mes', label: 'Mes' },
    { value: 'trimestre', label: 'Trimestre' },
    { value: 'año', label: 'Año' },
  ]

  const handleDateRange = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
  }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageContent>
      <PageHeader
        title="Análisis Económico"
        subtitle="Costos por fecha de factura/documento"
      />

      {/* Controls */}
      <div className="space-y-3 mb-6">
        {/* Row 1: view options */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Currency */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Moneda</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {(['ARS', 'USD'] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                    currency === c
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* Column period */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Período</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {periodButtons.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => setColPeriod(btn.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-slate-200 last:border-r-0 ${
                    colPeriod === btn.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-px h-5 bg-slate-200 hidden sm:block" />

          {/* Row grouping */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Filas</span>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {groupingButtons.map((btn) => (
                <button
                  key={btn.value}
                  onClick={() => setGrouping(btn.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-slate-200 last:border-r-0 ${
                    grouping === btn.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: date range filter */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          <DateRangeMonthPicker
            from={dateFrom}
            to={dateTo}
            onChange={handleDateRange}
          />
        </div>
      </div>

      {/* KPI row */}
      <MetricGrid cols={3} className="mb-6">
        <KpiCard
          label="Costo Total del Período"
          value={formatCurrencyCompact(kpis.totalCost, currency)}
          description={formatCurrencyFull(kpis.totalCost, currency)}
          icon={TrendingUp}
          variant="info"
        />
        <KpiCard
          label={`Mayor Costo · ${kpis.topInsurer.name}`}
          value={formatCurrencyCompact(kpis.topInsurer.amount, currency)}
          description={formatCurrencyFull(kpis.topInsurer.amount, currency)}
          icon={Building2}
          variant="default"
        />
        <KpiCard
          label="Pólizas con Costo Registrado"
          value={kpis.policiesWithCost}
          description="Con al menos un documento en el período"
          icon={FileText}
          variant="success"
        />
      </MetricGrid>

      {/* Charts row: bar + pie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <SectionCard
          title="Evolución mensual de costos"
          subtitle={`Por fecha de emisión · ${currency}`}
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barChartData}
                margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                barCategoryGap="35%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={60}
                  tickFormatter={(v: number) => formatCurrencyCompact(v, currency)}
                />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <BarTooltip
                      active={active}
                      payload={payload as BarTooltipProps['payload']}
                      label={label}
                      currency={currency}
                    />
                  )}
                />
                <Bar dataKey="total" name="Costo" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard
          title="Distribución por aseguradora"
          subtitle={`Participación porcentual · ${currency}`}
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieChartData}
                  dataKey="value"
                  nameKey="name"
                  cx="42%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={42}
                >
                  {pieChartData.map((_entry, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => (
                    <PieTooltip
                      active={active}
                      payload={payload as PieTooltipProps['payload']}
                      currency={currency}
                    />
                  )}
                />
                <Legend
                  layout="vertical"
                  align="right"
                  verticalAlign="middle"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingLeft: 12 }}
                  formatter={(value: string) =>
                    value.length > 18 ? value.substring(0, 17) + '…' : value
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Data matrix table */}
      <SectionCard
        title="Matriz de costos económicos"
        subtitle={`Agrupado por ${groupingButtons.find((b) => b.value === grouping)?.label} · ${currency} · por fecha de emisión`}
        noPadding
      >
        <div className="table-container">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th
                  className="text-left sticky left-0 bg-slate-50 z-10 min-w-[200px] max-w-[260px]"
                  style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}
                >
                  {groupingButtons.find((b) => b.value === grouping)?.label}
                </th>
                {columns.map((col) => (
                  <th key={col.key} className="text-right min-w-[110px] whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
                <th className="text-right min-w-[120px] bg-slate-100/70 font-semibold whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowTotal = getRowTotal(row.id)
                const hasData = rowTotal !== 0

                return (
                  <tr key={row.id} className={!hasData ? 'opacity-40' : ''}>
                    <td
                      className="sticky left-0 bg-white z-10"
                      style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-slate-800 block truncate max-w-[240px]">
                          {row.label}
                        </span>
                        {row.sublabel && (
                          <span className="text-xs text-slate-400 block truncate max-w-[240px]">
                            {row.sublabel}
                          </span>
                        )}
                      </div>
                    </td>

                    {columns.map((col) => {
                      const amount = getCellAmount(row.id, col.key)
                      const isNegative = amount < 0
                      return (
                        <td key={col.key} className="text-right tabular-nums">
                          {amount !== 0 ? (
                            <span
                              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                isNegative
                                  ? 'text-amber-700 bg-amber-50'
                                  : 'text-blue-700 bg-blue-50'
                              }`}
                            >
                              {fmtCell(amount)}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      )
                    })}

                    <td className="text-right bg-slate-50/80 tabular-nums">
                      {rowTotal !== 0 ? (
                        <span
                          className={`text-xs font-semibold ${
                            rowTotal < 0 ? 'text-amber-700' : 'text-slate-800'
                          }`}
                        >
                          {fmtCell(rowTotal)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Column totals row */}
              <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                <td
                  className="sticky left-0 bg-slate-50 z-10 text-xs text-slate-600 font-semibold"
                  style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}
                >
                  Total período
                </td>
                {columns.map((col) => {
                  const colTotal = getColumnTotal(col.key)
                  return (
                    <td key={col.key} className="text-right tabular-nums">
                      {colTotal !== 0 ? (
                        <span className="text-xs font-semibold text-slate-700">
                          {fmtCell(colTotal)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                  )
                })}
                <td className="text-right bg-slate-100 tabular-nums">
                  <span className="text-xs font-bold text-slate-800">
                    {fmtCell(columns.reduce((sum, col) => sum + getColumnTotal(col.key), 0))}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div className="flex items-center gap-5 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block" />
            <span className="text-xs text-slate-500">Costo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />
            <span className="text-xs text-slate-500">Nota de crédito / ajuste</span>
          </div>
          <span className="text-xs text-slate-400 ml-auto">
            Tipo de cambio fijo: AR$ {USD_RATE.toLocaleString('es-AR')} / US$
          </span>
        </div>
      </SectionCard>

      {/* Bottom note */}
      <p className="mt-4 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <span className="font-medium text-slate-500">Nota metodológica:</span>{' '}
        El análisis económico considera la fecha de emisión del documento, no las fechas de
        vencimiento de cuotas. Para el análisis de pagos y vencimientos, consulte el módulo de
        Análisis Financiero.
      </p>
    </PageContent>
  )
}
