import { useState, useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import { mockInstallments } from '../../../data/mock-installments'
import { mockDocuments } from '../../../data/mock-documents'
import { mockPolicies } from '../../../data/mock-policies'
import { mockAssets } from '../../../data/mock-assets'
import { mockCostCenters } from '../../../data/mock-cost-centers'
import { mockCompanies } from '../../../data/mock-companies'
import { mockDocumentAllocations } from '../../../data/mock-documents'
import type { Currency } from '../../../shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const USD_RATE = 970

type RowGrouping = 'empresa' | 'centro_costo' | 'activo' | 'poliza'
type ColPeriod = 'mes' | 'trimestre'

// ─── Month / Quarter generation ───────────────────────────────────────────────

// Reference: June 2026 — show 3 past months + current + 5 future = 9 columns
function generateMonths(): { key: string; label: string; year: number; month: number }[] {
  const ref = new Date(2026, 5, 1) // June 2026
  const months: { key: string; label: string; year: number; month: number }[] = []
  for (let offset = -3; offset <= 5; offset++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() + offset, 1)
    const year = d.getFullYear()
    const month = d.getMonth() // 0-indexed
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    months.push({ key, year, month, label })
  }
  return months
}

function generateQuarters(): { key: string; label: string; months: string[] }[] {
  const allMonths = generateMonths()
  const seen = new Set<string>()
  const quarters: { key: string; label: string; months: string[] }[] = []
  allMonths.forEach(({ year, month }) => {
    const q = Math.floor(month / 3) + 1
    const qKey = `${year}-Q${q}`
    if (!seen.has(qKey)) {
      seen.add(qKey)
      const qMonths: string[] = []
      for (let m = (q - 1) * 3; m < q * 3; m++) {
        qMonths.push(`${year}-${String(m + 1).padStart(2, '0')}`)
      }
      quarters.push({ key: qKey, label: `Q${q} ${year}`, months: qMonths })
    }
  })
  return quarters
}

// ─── Data helpers ──────────────────────────────────────────────────────────────

function getInstallmentMonth(dueDate: string): string {
  return dueDate.substring(0, 7) // "YYYY-MM"
}

function convertAmount(amount: number, fromCurrency: Currency, toCurrency: Currency): number {
  if (fromCurrency === toCurrency) return amount
  if (fromCurrency === 'ARS' && toCurrency === 'USD') return amount / USD_RATE
  if (fromCurrency === 'USD' && toCurrency === 'ARS') return amount * USD_RATE
  return amount
}

// Build a map: policyId -> { companyId, costCenterId, assetId }
function buildPolicyContext() {
  const map = new Map<string, { companyId: string; costCenterId: string; assetId: string | null }>()
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
    map.set(pol.id, { companyId, costCenterId, assetId })
  })
  return map
}

// Build map: documentId -> policyIds[]
function buildDocumentPolicies() {
  const map = new Map<string, string[]>()
  mockDocumentAllocations.forEach((alloc) => {
    const existing = map.get(alloc.accountingDocumentId) ?? []
    existing.push(alloc.policyId)
    map.set(alloc.accountingDocumentId, existing)
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
          return {
            id: cc.id,
            label: cc.name,
            sublabel: company?.name,
          }
        })
    case 'activo':
      return mockAssets.map((a) => ({
        id: a.id,
        label: a.name,
        sublabel: `${a.internalCode} · ${a.assetType}`,
      }))
    case 'poliza':
      return mockPolicies
        .filter((p) => p.status !== 'vencida')
        .map((p) => ({
          id: p.id,
          label: p.policyNumber,
          sublabel: `${p.insuranceType} · ${p.insuranceCompany}`,
        }))
  }
}

// ─── Matrix cell computation ──────────────────────────────────────────────────

interface CellData {
  paid: number
  pending: number
}

type MatrixData = Map<string, Map<string, CellData>>

function buildMatrixData(
  grouping: RowGrouping,
  displayCurrency: Currency,
): MatrixData {
  const policyContext = buildPolicyContext()
  const documentPolicies = buildDocumentPolicies()

  // For each installment, determine which rows it belongs to
  const matrix: MatrixData = new Map()

  mockInstallments.forEach((inst) => {
    const monthKey = getInstallmentMonth(inst.dueDate)
    const amount = convertAmount(inst.amount, inst.currency, displayCurrency)
    const isPaid = inst.paymentStatus === 'pagado'

    // Find which policies this installment's document covers
    const policyIds = documentPolicies.get(inst.accountingDocumentId) ?? []

    const matchingRowIds = new Set<string>()

    policyIds.forEach((policyId) => {
      const ctx = policyContext.get(policyId)
      if (!ctx) return

      switch (grouping) {
        case 'empresa':
          if (ctx.companyId) matchingRowIds.add(ctx.companyId)
          break
        case 'centro_costo':
          if (ctx.costCenterId) matchingRowIds.add(ctx.costCenterId)
          break
        case 'activo':
          if (ctx.assetId) matchingRowIds.add(ctx.assetId)
          break
        case 'poliza':
          matchingRowIds.add(policyId)
          break
      }
    })

    // When a document maps to multiple policies, split amount proportionally
    const splitAmount = policyIds.length > 1 ? amount / policyIds.length : amount

    matchingRowIds.forEach((rowId) => {
      if (!matrix.has(rowId)) matrix.set(rowId, new Map())
      const rowMap = matrix.get(rowId)!
      if (!rowMap.has(monthKey)) rowMap.set(monthKey, { paid: 0, pending: 0 })
      const cell = rowMap.get(monthKey)!
      if (isPaid) {
        cell.paid += splitAmount
      } else {
        cell.pending += splitAmount
      }
    })
  })

  return matrix
}

// ─── Custom Tooltip for chart ─────────────────────────────────────────────────

interface ChartTooltipProps {
  active?: boolean
  payload?: { name: string; value: number; color: string }[]
  label?: string
  currency: Currency
}

function ChartTooltip({ active, payload, label, currency }: ChartTooltipProps) {
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function FinancialAnalysisPage() {
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [grouping, setGrouping] = useState<RowGrouping>('empresa')
  const [colPeriod, setColPeriod] = useState<ColPeriod>('mes')

  const months = useMemo(() => generateMonths(), [])
  const quarters = useMemo(() => generateQuarters(), [])
  const matrixData = useMemo(() => buildMatrixData(grouping, currency), [grouping, currency])
  const rows = useMemo(() => getRows(grouping), [grouping])

  // ─── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    let totalPaid = 0
    let totalPending = 0
    let overdueCount = 0
    const today = new Date(2026, 5, 10) // reference date: June 10, 2026

    mockInstallments.forEach((inst) => {
      const amount = convertAmount(inst.amount, inst.currency, currency)
      if (inst.paymentStatus === 'pagado') {
        totalPaid += amount
      } else {
        totalPending += amount
        const due = new Date(inst.dueDate)
        if (due < today) overdueCount++
      }
    })

    return { totalPaid, totalPending, total: totalPaid + totalPending, overdueCount }
  }, [currency])

  // ─── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (colPeriod === 'mes') {
      return months.map(({ key, label }) => {
        let paid = 0
        let pending = 0
        matrixData.forEach((rowMap) => {
          const cell = rowMap.get(key)
          if (cell) {
            paid += cell.paid
            pending += cell.pending
          }
        })
        return { label, paid, pending }
      })
    } else {
      return quarters.map(({ key, label, months: qMonths }) => {
        let paid = 0
        let pending = 0
        matrixData.forEach((rowMap) => {
          qMonths.forEach((mk) => {
            const cell = rowMap.get(mk)
            if (cell) {
              paid += cell.paid
              pending += cell.pending
            }
          })
        })
        return { label, paid, pending }
      })
    }
  }, [matrixData, months, quarters, colPeriod])

  // ─── Column definitions ────────────────────────────────────────────────────
  const columns = useMemo(() => {
    if (colPeriod === 'mes') return months
    return quarters.map((q) => ({ key: q.key, label: q.label }))
  }, [colPeriod, months, quarters])

  // ─── Cell value aggregation for quarterly ─────────────────────────────────
  function getCellValue(rowId: string, colKey: string): CellData {
    const rowMap = matrixData.get(rowId)
    if (!rowMap) return { paid: 0, pending: 0 }

    if (colPeriod === 'mes') {
      return rowMap.get(colKey) ?? { paid: 0, pending: 0 }
    } else {
      const q = quarters.find((q) => q.key === colKey)
      if (!q) return { paid: 0, pending: 0 }
      let paid = 0
      let pending = 0
      q.months.forEach((mk) => {
        const cell = rowMap.get(mk)
        if (cell) {
          paid += cell.paid
          pending += cell.pending
        }
      })
      return { paid, pending }
    }
  }

  // ─── Row totals ────────────────────────────────────────────────────────────
  function getRowTotals(rowId: string): CellData {
    let paid = 0
    let pending = 0
    columns.forEach(({ key }) => {
      const cell = getCellValue(rowId, key)
      paid += cell.paid
      pending += cell.pending
    })
    return { paid, pending }
  }

  // ─── Formatting helpers ────────────────────────────────────────────────────
  function fmtCell(value: number): string {
    if (value === 0) return '—'
    return formatCurrencyCompact(value, currency)
  }

  // ─── UI ────────────────────────────────────────────────────────────────────

  const groupingButtons: { value: RowGrouping; label: string }[] = [
    { value: 'empresa', label: 'Empresa' },
    { value: 'centro_costo', label: 'Centro de Costo' },
    { value: 'activo', label: 'Activo' },
    { value: 'poliza', label: 'Póliza' },
  ]

  const periodButtons: { value: ColPeriod; label: string }[] = [
    { value: 'mes', label: 'Mes' },
    { value: 'trimestre', label: 'Trimestre' },
  ]

  return (
    <PageContent>
      {/* Header */}
      <PageHeader
        title="Análisis Financiero"
        subtitle="Flujo de cuotas y vencimientos por período"
      />

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        {/* Currency toggle */}
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

        {/* Divider */}
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

        {/* Divider */}
        <div className="w-px h-5 bg-slate-200 hidden sm:block" />

        {/* Column period */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Columnas</span>
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
      </div>

      {/* KPI row */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Total Pagado"
          value={formatCurrencyCompact(kpis.totalPaid, currency)}
          description={formatCurrencyFull(kpis.totalPaid, currency)}
          icon={TrendingUp}
          variant="success"
        />
        <KpiCard
          label="Total Pendiente"
          value={formatCurrencyCompact(kpis.totalPending, currency)}
          description={formatCurrencyFull(kpis.totalPending, currency)}
          icon={TrendingDown}
          variant="danger"
        />
        <KpiCard
          label="Total General"
          value={formatCurrencyCompact(kpis.total, currency)}
          description={formatCurrencyFull(kpis.total, currency)}
          icon={DollarSign}
          variant="info"
        />
        <KpiCard
          label="Cuotas Vencidas"
          value={kpis.overdueCount}
          description="Sin pagar y con vencimiento pasado"
          icon={AlertCircle}
          variant={kpis.overdueCount > 0 ? 'warning' : 'default'}
        />
      </MetricGrid>

      {/* Bar chart */}
      <SectionCard
        title="Pagado vs Pendiente por período"
        subtitle={`Vista en ${currency} · agrupado por ${colPeriod === 'mes' ? 'mes' : 'trimestre'}`}
        className="mb-6"
      >
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
              barCategoryGap="30%"
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={64}
                tickFormatter={(v: number) => formatCurrencyCompact(v, currency)}
              />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip
                    active={active}
                    payload={payload as ChartTooltipProps['payload']}
                    label={label}
                    currency={currency}
                  />
                )}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar dataKey="paid" name="Pagado" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pending" name="Pendiente" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Matrix table */}
      <SectionCard
        title="Matriz de cuotas"
        subtitle={`Agrupado por ${groupingButtons.find((b) => b.value === grouping)?.label} · ${currency}`}
        noPadding
      >
        {/* overflow-x-auto ONLY on the table wrapper, never globally */}
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
                const rowTotals = getRowTotals(row.id)
                const hasData = rowTotals.paid + rowTotals.pending > 0

                return (
                  <tr key={row.id} className={!hasData ? 'opacity-40' : ''}>
                    {/* Row label — sticky left */}
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

                    {/* Data cells */}
                    {columns.map((col) => {
                      const cell = getCellValue(row.id, col.key)
                      const hasPaid = cell.paid > 0
                      const hasPending = cell.pending > 0
                      const hasAny = hasPaid || hasPending

                      return (
                        <td key={col.key} className="text-right align-top p-0">
                          {hasAny ? (
                            <div className="flex flex-col gap-px py-2 px-3">
                              {hasPaid && (
                                <span className="inline-flex items-center justify-end">
                                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 tabular-nums">
                                    {fmtCell(cell.paid)}
                                  </span>
                                </span>
                              )}
                              {hasPending && (
                                <span className="inline-flex items-center justify-end">
                                  <span className="text-xs font-medium text-red-600 bg-red-50 rounded px-1.5 py-0.5 tabular-nums">
                                    {fmtCell(cell.pending)}
                                  </span>
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="block text-center text-slate-300 text-xs py-2 px-3">
                              —
                            </span>
                          )}
                        </td>
                      )
                    })}

                    {/* Row total */}
                    <td className="text-right bg-slate-50/80 align-top p-0">
                      <div className="flex flex-col gap-px py-2 px-3">
                        {rowTotals.paid > 0 && (
                          <span className="block text-xs font-semibold text-emerald-700 tabular-nums">
                            {fmtCell(rowTotals.paid)}
                          </span>
                        )}
                        {rowTotals.pending > 0 && (
                          <span className="block text-xs font-semibold text-red-600 tabular-nums">
                            {fmtCell(rowTotals.pending)}
                          </span>
                        )}
                        {rowTotals.paid === 0 && rowTotals.pending === 0 && (
                          <span className="block text-xs text-slate-300">—</span>
                        )}
                      </div>
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
                  let colPaid = 0
                  let colPending = 0
                  rows.forEach((row) => {
                    const cell = getCellValue(row.id, col.key)
                    colPaid += cell.paid
                    colPending += cell.pending
                  })
                  return (
                    <td key={col.key} className="text-right align-top p-0">
                      <div className="flex flex-col gap-px py-2 px-3">
                        {colPaid > 0 && (
                          <span className="block text-xs font-semibold text-emerald-700 tabular-nums">
                            {fmtCell(colPaid)}
                          </span>
                        )}
                        {colPending > 0 && (
                          <span className="block text-xs font-semibold text-red-600 tabular-nums">
                            {fmtCell(colPending)}
                          </span>
                        )}
                      </div>
                    </td>
                  )
                })}
                <td className="text-right bg-slate-100 align-top p-0">
                  <div className="flex flex-col gap-px py-2 px-3">
                    <span className="block text-xs font-bold text-emerald-700 tabular-nums">
                      {fmtCell(kpis.totalPaid)}
                    </span>
                    <span className="block text-xs font-bold text-red-600 tabular-nums">
                      {fmtCell(kpis.totalPending)}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 inline-block" />
            <span className="text-xs text-slate-500">Pagado</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block" />
            <span className="text-xs text-slate-500">Pendiente</span>
          </div>
          <span className="text-xs text-slate-400 ml-2">
            · Tipo de cambio fijo: AR$ {USD_RATE.toLocaleString('es-AR')} / US$
          </span>
        </div>
      </SectionCard>
    </PageContent>
  )
}
