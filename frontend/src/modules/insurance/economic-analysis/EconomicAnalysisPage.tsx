import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, Building2, FileText, FileSpreadsheet, FileDown, Loader2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import {
  downloadXLSX, printTableAsPDF, getISOWeekKey, generateWeekRange,
} from '../../../shared/utils/export'
import { documentsApi } from '../../../shared/api/documents.api'
import { policiesApi } from '../../../shared/api/policies.api'
import { assetsApi } from '../../../shared/api/assets.api'
import { companiesApi } from '../../../shared/api/companies.api'
import { costCentersApi } from '../../../shared/api/cost-centers.api'
import type { Currency, Policy, Asset, Company, CostCenter, AccountingDocument, DocumentPolicyAllocation } from '../../../shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const USD_RATE = 970

const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
]

type RowGrouping = 'empresa' | 'centro_costo' | 'aseguradora' | 'poliza' | 'activo'
type ColPeriod = 'semana' | 'mes' | 'trimestre' | 'año'

// ─── Month range generator ────────────────────────────────────────────────────

function generateMonthRange(
  from: string,
  to: string,
): { key: string; label: string; year: number; month: number }[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const months: { key: string; label: string; year: number; month: number }[] = []
  let y = fy; let m = fm
  while ((y < ty || (y === ty && m <= tm)) && months.length < 60) {
    const d = new Date(y, m - 1, 1)
    const key = `${y}-${String(m).padStart(2, '0')}`
    const label = d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
    months.push({ key, label, year: y, month: m - 1 })
    m++
    if (m > 12) { m = 1; y++ }
  }
  return months
}

// ─── Currency conversion ──────────────────────────────────────────────────────

function convertAmount(amount: number, from: string, to: string): number {
  if (from === to) return amount
  if (from === 'ARS' && to === 'USD') return amount / USD_RATE
  if (from === 'USD' && to === 'ARS') return amount * USD_RATE
  return amount
}

// ─── Policy context builder ───────────────────────────────────────────────────

function buildPolicyContext(policies: Policy[], assets: Asset[]) {
  const map = new Map<string, {
    companyId: string; costCenterId: string; primaryAssetId: string | null; insuranceCompany: string
  }>()
  policies.forEach((pol) => {
    let companyId = pol.companyId ?? ''
    let costCenterId = pol.costCenterId ?? ''
    const primaryAssetId = pol.assetIds?.[0] ?? null
    if (primaryAssetId) {
      const asset = assets.find((a) => a.id === primaryAssetId)
      if (asset) {
        companyId = companyId || asset.companyId
        costCenterId = costCenterId || asset.costCenterId
      }
    }
    map.set(pol.id, { companyId, costCenterId, primaryAssetId, insuranceCompany: pol.insuranceCompany })
  })
  return map
}

function buildDocumentAllocMap(allocations: DocumentPolicyAllocation[]): Map<string, Map<string, number>> {
  const map = new Map<string, Map<string, number>>()
  allocations.forEach((alloc) => {
    if (!map.has(alloc.accountingDocumentId)) map.set(alloc.accountingDocumentId, new Map())
    map.get(alloc.accountingDocumentId)!.set(alloc.policyId, alloc.allocationPercentage / 100)
  })
  return map
}

// ─── Row descriptor ───────────────────────────────────────────────────────────

interface MatrixRow { id: string; label: string; sublabel?: string }

function getRows(
  grouping: RowGrouping,
  companies: Company[],
  costCenters: CostCenter[],
  assets: Asset[],
  policies: Policy[],
): MatrixRow[] {
  switch (grouping) {
    case 'empresa':
      return companies.filter((c) => c.status === 'activo').map((c) => ({ id: c.id, label: c.name }))
    case 'centro_costo':
      return costCenters.filter((cc) => cc.status === 'activo').map((cc) => ({
        id: cc.id, label: cc.name, sublabel: cc.description || undefined,
      }))
    case 'aseguradora': {
      const insurers = Array.from(new Set(policies.map((p) => p.insuranceCompany))).sort()
      return insurers.map((name) => ({ id: name, label: name }))
    }
    case 'poliza':
      return policies.filter((p) => p.status !== 'vencida').map((p) => ({
        id: p.id, label: p.policyNumber, sublabel: `${p.insuranceType} · ${p.insuranceCompany}`,
      }))
    case 'activo':
      return assets.map((a) => ({
        id: a.id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}`,
      }))
  }
}

// ─── Matrix data builder ──────────────────────────────────────────────────────

type EconomicMatrixData = Map<string, Map<string, number>>

function buildEconomicMatrix(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  documents: AccountingDocument[],
  allocations: DocumentPolicyAllocation[],
): EconomicMatrixData {
  const policyCtx = buildPolicyContext(policies, assets)
  const allocMap = buildDocumentAllocMap(allocations)
  const matrix: EconomicMatrixData = new Map()

  documents.forEach((doc) => {
    const key = granularity === 'week'
      ? getISOWeekKey(doc.issueDate)
      : doc.issueDate.substring(0, 7)
    const docAmount = convertAmount(doc.totalAmount, doc.currency, displayCurrency)
    const docAllocs = allocMap.get(doc.id)
    if (!docAllocs || docAllocs.size === 0) return

    docAllocs.forEach((pctOfDoc, policyId) => {
      const policyAmount = docAmount * pctOfDoc
      const ctx = policyCtx.get(policyId)
      if (!ctx) return

      const rowIds: string[] = []
      switch (grouping) {
        case 'empresa':      if (ctx.companyId)    rowIds.push(ctx.companyId);    break
        case 'centro_costo': if (ctx.costCenterId) rowIds.push(ctx.costCenterId); break
        case 'aseguradora':  rowIds.push(ctx.insuranceCompany); break
        case 'poliza':       rowIds.push(policyId); break
        case 'activo':       if (ctx.primaryAssetId) rowIds.push(ctx.primaryAssetId); break
      }

      rowIds.forEach((rowId) => {
        if (!matrix.has(rowId)) matrix.set(rowId, new Map())
        const rowMap = matrix.get(rowId)!
        rowMap.set(key, (rowMap.get(key) ?? 0) + policyAmount)
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
          <span className="font-medium text-slate-800">{formatCurrencyCompact(entry.value, currency)}</span>
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EconomicAnalysisPage() {
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [grouping, setGrouping] = useState<RowGrouping>('empresa')
  const [colPeriod, setColPeriod] = useState<ColPeriod>('mes')
  const [dateFrom, setDateFrom] = useState('2025-07')
  const [dateTo, setDateTo] = useState('2026-06')
  const [pdfLoading, setPdfLoading] = useState(false)

  // ─── Remote data ─────────────────────────────────────────────────────────────

  // Una sola request que devuelve documentos + installments + allocations embebidos
  const { data: financialDocs = [] } = useQuery({
    queryKey: ['documents', 'financial'],
    queryFn: () => documentsApi.findAllForFinancial(),
  })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: allCompanies = [] } = useQuery({ queryKey: ['companies'], queryFn: companiesApi.findAll })
  const { data: allCostCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: costCentersApi.findAll })

  // Derivados memoizados para que los useMemo downstream reaccionen correctamente
  const allDocuments = financialDocs
  const allAllocations = useMemo(
    () => financialDocs.flatMap((d) => d.allocations) as DocumentPolicyAllocation[],
    [financialDocs],
  )

  // ─── Period columns ──────────────────────────────────────────────────────────

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

  const viewWeeks = useMemo(() => generateWeekRange(dateFrom, dateTo), [dateFrom, dateTo])

  // Matrix granularity: only 'semana' uses week keys, everything else uses month keys
  const matrixGranularity: 'week' | 'month' = colPeriod === 'semana' ? 'week' : 'month'
  const matrixData = useMemo(
    () => buildEconomicMatrix(grouping, currency, matrixGranularity, allPolicies, allAssets, allDocuments, allAllocations),
    [grouping, currency, matrixGranularity, allPolicies, allAssets, allDocuments, allAllocations],
  )
  const rows = useMemo(
    () => getRows(grouping, allCompanies, allCostCenters, allAssets, allPolicies),
    [grouping, allCompanies, allCostCenters, allAssets, allPolicies],
  )

  // ─── Column definitions ───────────────────────────────────────────────────────

  const columns = useMemo(() => {
    if (colPeriod === 'semana')    return viewWeeks
    if (colPeriod === 'mes')       return viewMonths
    if (colPeriod === 'trimestre') return viewQuarters.map((q) => ({ key: q.key, label: q.label }))
    return viewYears.map((y) => ({ key: y.key, label: y.label }))
  }, [colPeriod, viewWeeks, viewMonths, viewQuarters, viewYears])

  // ─── Cell aggregation ─────────────────────────────────────────────────────────

  function getCellAmount(rowId: string, colKey: string): number {
    const rowMap = matrixData.get(rowId)
    if (!rowMap) return 0

    if (colPeriod === 'mes' || colPeriod === 'semana') return rowMap.get(colKey) ?? 0

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

  function getColumnTotal(colKey: string): number {
    return rows.reduce((sum, row) => sum + getCellAmount(row.id, colKey), 0)
  }

  // ─── KPIs + pie data ─────────────────────────────────────────────────────────

  const { kpis, pieChartData } = useMemo(() => {
    let totalCost = 0
    const byInsurer = new Map<string, number>()
    const allocedPolicies = new Set<string>()
    const policyCtx = buildPolicyContext(allPolicies, allAssets)
    const allocMap = buildDocumentAllocMap(allAllocations)

    allDocuments.forEach((doc) => {
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
    byInsurer.forEach((amount, name) => { if (amount > topInsurer.amount) topInsurer = { name, amount } })

    const pie = Array.from(byInsurer.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)

    return { kpis: { totalCost, topInsurer, policiesWithCost: allocedPolicies.size }, pieChartData: pie }
  }, [allDocuments, allAllocations, allPolicies, allAssets, currency, dateFrom, dateTo])

  // ─── Bar chart (always monthly) ───────────────────────────────────────────────

  const barChartData = useMemo(() => {
    return viewMonths.map(({ key, label }) => {
      let total = 0
      allDocuments.forEach((doc) => {
        if (doc.issueDate.substring(0, 7) === key) {
          total += convertAmount(doc.totalAmount, doc.currency, currency)
        }
      })
      return { label, total }
    })
  }, [viewMonths, allDocuments, currency])

  // ─── Formatters ───────────────────────────────────────────────────────────────

  function fmtCell(value: number): string {
    return value === 0 ? '—' : formatCurrencyCompact(value, currency)
  }

  function fmtNumber(value: number): string {
    return value === 0 ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 0 })
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
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mes' },
    { value: 'trimestre', label: 'Trimestre' },
    { value: 'año', label: 'Año' },
  ]

  // ─── Export handlers ──────────────────────────────────────────────────────────

  const periodLabel = colPeriod === 'semana' ? 'semanal' : colPeriod === 'mes' ? 'mensual' : colPeriod === 'trimestre' ? 'trimestral' : 'anual'
  const groupingLabel = groupingButtons.find((b) => b.value === grouping)?.label ?? grouping

  function handleExportCSV() {
    const header = [groupingLabel, ...columns.map((c) => c.label), 'Total']
    const dataRows = rows.map((row) => [
      row.label,
      ...columns.map((c) => {
        const v = getCellAmount(row.id, c.key)
        return v === 0 ? '' : v.toFixed(0)
      }),
      getRowTotal(row.id).toFixed(0),
    ])
    const totalRow = [
      'TOTAL',
      ...columns.map((c) => getColumnTotal(c.key).toFixed(0)),
      columns.reduce((s, c) => s + getColumnTotal(c.key), 0).toFixed(0),
    ]
    downloadXLSX(
      [header, ...dataRows, totalRow],
      `analisis-economico-${periodLabel}-${dateFrom}-${dateTo}.xlsx`,
    )
  }

  async function handleExportPDF() {
    setPdfLoading(true)
    try {
    const pdfColumns = [
      { label: groupingLabel, align: 'left' as const },
      ...columns.map((c) => ({ label: c.label, align: 'right' as const })),
      { label: 'Total', align: 'right' as const },
    ]

    const pdfRows: { cells: string[]; isDim?: boolean; isTotal?: boolean }[] = rows.map((row) => {
      const rowTotal = getRowTotal(row.id)
      return {
        cells: [
          row.label,
          ...columns.map((c) => fmtNumber(getCellAmount(row.id, c.key))),
          fmtNumber(rowTotal),
        ],
        isDim: rowTotal === 0,
      }
    })

    pdfRows.push({
      cells: [
        'TOTAL',
        ...columns.map((c) => fmtNumber(getColumnTotal(c.key))),
        fmtNumber(columns.reduce((s, c) => s + getColumnTotal(c.key), 0)),
      ],
      isTotal: true,
    })

      await printTableAsPDF(
        'Análisis Económico',
        `Vista ${periodLabel} · Agrupado por ${groupingLabel} · ${currency} · ${dateFrom} – ${dateTo}`,
        pdfColumns,
        pdfRows,
      )
    } finally {
      setPdfLoading(false)
    }
  }

  const handleDateRange = (from: string, to: string) => { setDateFrom(from); setDateTo(to) }

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageContent>
      <PageHeader
        title="Análisis Económico"
        subtitle="Costos por fecha de factura/documento"
      />

      {/* Controls */}
      <div className="space-y-3 mb-6">
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
                    currency === c ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
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
                    colPeriod === btn.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
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
                    grouping === btn.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date range */}
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          <DateRangeMonthPicker from={dateFrom} to={dateTo} onChange={handleDateRange} />
          {colPeriod === 'semana' && (
            <span className="text-xs text-slate-400 ml-2">
              {viewWeeks.length} semanas en el rango seleccionado
            </span>
          )}
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

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <SectionCard
          title="Evolución mensual de costos"
          subtitle={`Por fecha de emisión · ${currency}`}
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
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
                  formatter={(value: string) => value.length > 18 ? value.substring(0, 17) + '…' : value}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Data matrix table */}
      <SectionCard
        title="Matriz de costos económicos"
        subtitle={`Agrupado por ${groupingLabel} · ${currency} · vista ${periodLabel}`}
        noPadding
        actions={
          <div className="flex items-center gap-1">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors"
              title="Exportar a Excel (CSV)"
            >
              <FileSpreadsheet size={13} />
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              disabled={pdfLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              title="Exportar a PDF"
            >
              {pdfLoading ? <Loader2 size={13} className="animate-spin" /> : <FileDown size={13} />}
              {pdfLoading ? 'Generando…' : 'PDF'}
            </button>
          </div>
        }
      >
        <div className="table-container">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th
                  className="text-left sticky left-0 bg-slate-50 z-10 min-w-[200px] max-w-[260px]"
                  style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}
                >
                  {groupingLabel}
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
                return (
                  <tr key={row.id} className={rowTotal === 0 ? 'opacity-40' : ''}>
                    <td className="sticky left-0 bg-white z-10" style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}>
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
                                isNegative ? 'text-amber-700 bg-amber-50' : 'text-blue-700 bg-blue-50'
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
                        <span className={`text-xs font-semibold ${rowTotal < 0 ? 'text-amber-700' : 'text-slate-800'}`}>
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
                        <span className="text-xs font-semibold text-slate-700">{fmtCell(colTotal)}</span>
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

        {/* Footer */}
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

      <p className="mt-4 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        <span className="font-medium text-slate-500">Nota metodológica:</span>{' '}
        El análisis económico considera la fecha de emisión del documento, no las fechas de
        vencimiento de cuotas. Para el análisis de pagos y vencimientos, consulte el módulo de
        Análisis Financiero.
      </p>
    </PageContent>
  )
}
