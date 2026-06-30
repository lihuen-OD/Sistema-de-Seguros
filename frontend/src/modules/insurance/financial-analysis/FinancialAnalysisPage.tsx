import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, DollarSign, AlertCircle, FileSpreadsheet, FileDown, Loader2,
} from 'lucide-react'
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
import type { Currency, Policy, Asset, Company, CostCenter, Installment, DocumentPolicyAllocation } from '../../../shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const USD_RATE = 970

type RowGrouping = 'empresa' | 'centro_costo' | 'activo' | 'poliza'
type ColPeriod = 'semana' | 'mes' | 'trimestre'

// ─── Month range generator ────────────────────────────────────────────────────

function generateMonthRange(
  from: string,
  to: string,
): { key: string; label: string; year: number; month: number }[] {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  const months: { key: string; label: string; year: number; month: number }[] = []
  let y = fy
  let m = fm
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

// ─── Data helpers ─────────────────────────────────────────────────────────────

function convertAmount(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount
  if (from === 'ARS' && to === 'USD') return amount / USD_RATE
  if (from === 'USD' && to === 'ARS') return amount * USD_RATE
  return amount
}

function buildPolicyContext(policies: Policy[], assets: Asset[]) {
  const map = new Map<string, { companyId: string; costCenterId: string; primaryAssetId: string | null }>()
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
    map.set(pol.id, { companyId, costCenterId, primaryAssetId })
  })
  return map
}

function buildDocumentPolicies(allocations: DocumentPolicyAllocation[]) {
  const map = new Map<string, string[]>()
  allocations.forEach((alloc) => {
    const existing = map.get(alloc.accountingDocumentId) ?? []
    existing.push(alloc.policyId)
    map.set(alloc.accountingDocumentId, existing)
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
    case 'activo':
      return assets.map((a) => ({ id: a.id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}` }))
    case 'poliza':
      return policies.filter((p) => p.status !== 'vencida').map((p) => ({
        id: p.id, label: p.policyNumber, sublabel: `${p.insuranceType} · ${p.insuranceCompany}`,
      }))
  }
}

// ─── Matrix computation ───────────────────────────────────────────────────────

interface CellData { paid: number; pending: number }
type MatrixData = Map<string, Map<string, CellData>>

function buildMatrixData(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  installments: Installment[],
  allocations: DocumentPolicyAllocation[],
): MatrixData {
  const policyContext = buildPolicyContext(policies, assets)
  const documentPolicies = buildDocumentPolicies(allocations)
  const matrix: MatrixData = new Map()

  installments.forEach((inst) => {
    const key = granularity === 'week'
      ? getISOWeekKey(inst.dueDate)
      : inst.dueDate.substring(0, 7)
    const amount = convertAmount(inst.amount, inst.currency, displayCurrency)
    const isPaid = inst.paymentStatus === 'pagado'
    const policyIds = documentPolicies.get(inst.accountingDocumentId) ?? []
    const matchingRowIds = new Set<string>()

    policyIds.forEach((policyId) => {
      const ctx = policyContext.get(policyId)
      if (!ctx) return
      switch (grouping) {
        case 'empresa':      if (ctx.companyId)   matchingRowIds.add(ctx.companyId);   break
        case 'centro_costo': if (ctx.costCenterId) matchingRowIds.add(ctx.costCenterId); break
        case 'activo':       if (ctx.primaryAssetId) matchingRowIds.add(ctx.primaryAssetId); break
        case 'poliza':       matchingRowIds.add(policyId); break
      }
    })

    const splitAmount = policyIds.length > 1 ? amount / policyIds.length : amount

    matchingRowIds.forEach((rowId) => {
      if (!matrix.has(rowId)) matrix.set(rowId, new Map())
      const rowMap = matrix.get(rowId)!
      if (!rowMap.has(key)) rowMap.set(key, { paid: 0, pending: 0 })
      const cell = rowMap.get(key)!
      if (isPaid) cell.paid += splitAmount
      else cell.pending += splitAmount
    })
  })

  return matrix
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

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
          <span className="font-medium text-slate-800">{formatCurrencyCompact(entry.value, currency)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FinancialAnalysisPage() {
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [grouping, setGrouping] = useState<RowGrouping>('empresa')
  const [colPeriod, setColPeriod] = useState<ColPeriod>('mes')
  const [dateFrom, setDateFrom] = useState('2026-01')
  const [dateTo, setDateTo] = useState('2026-12')
  const [pdfLoading, setPdfLoading] = useState(false)

  // ─── Remote data ─────────────────────────────────────────────────────────────

  // Filtra en el backend por el rango seleccionado — evita cargar todos los documentos en memoria
  const { data: financialDocs = [] } = useQuery({
    queryKey: ['documents', 'financial', dateFrom, dateTo],
    queryFn: () => documentsApi.findAllForFinancial({ from: dateFrom, to: dateTo }),
    staleTime: 2 * 60 * 1000,
  })
  const { data: allPolicies = [] } = useQuery({ queryKey: ['policies'], queryFn: () => policiesApi.findAll() })
  const { data: allAssets = [] } = useQuery({ queryKey: ['assets'], queryFn: assetsApi.findAll })
  const { data: allCompanies = [] } = useQuery({ queryKey: ['companies'], queryFn: companiesApi.findAll })
  const { data: allCostCenters = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: costCentersApi.findAll })

  // Derivados de la misma fuente — memoizados para que los useMemo downstream se actualicen
  const allDocuments = financialDocs
  const allInstallments = useMemo(() => financialDocs.flatMap((d) => d.installments), [financialDocs])
  const allAllocations = useMemo(
    () => financialDocs.flatMap((d) => d.allocations) as DocumentPolicyAllocation[],
    [financialDocs],
  )

  // ─── Period columns ──────────────────────────────────────────────────────────

  const months = useMemo(() => generateMonthRange(dateFrom, dateTo), [dateFrom, dateTo])

  const quarters = useMemo(() => {
    const seen = new Set<string>()
    const result: { key: string; label: string; months: string[] }[] = []
    months.forEach(({ year, month }) => {
      const q = Math.floor(month / 3) + 1
      const qKey = `${year}-Q${q}`
      if (!seen.has(qKey)) {
        seen.add(qKey)
        const qMonths: string[] = []
        for (let mo = (q - 1) * 3; mo < q * 3; mo++) {
          qMonths.push(`${year}-${String(mo + 1).padStart(2, '0')}`)
        }
        result.push({ key: qKey, label: `Q${q} ${year}`, months: qMonths })
      }
    })
    return result
  }, [months])

  const weeks = useMemo(() => generateWeekRange(dateFrom, dateTo), [dateFrom, dateTo])

  // Matrix granularity depends on period: weeks use week keys, the rest use month keys
  const matrixGranularity: 'week' | 'month' = colPeriod === 'semana' ? 'week' : 'month'
  const matrixData = useMemo(
    () => buildMatrixData(grouping, currency, matrixGranularity, allPolicies, allAssets, allInstallments, allAllocations),
    [grouping, currency, matrixGranularity, allPolicies, allAssets, allInstallments, allAllocations],
  )
  const rows = useMemo(
    () => getRows(grouping, allCompanies, allCostCenters, allAssets, allPolicies),
    [grouping, allCompanies, allCostCenters, allAssets, allPolicies],
  )

  // ─── KPIs (always month-level, unaffected by colPeriod) ──────────────────────

  const kpis = useMemo(() => {
    let totalPaid = 0
    let totalPending = 0
    let overdueCount = 0
    const today = new Date(2026, 5, 10)
    allInstallments.forEach((inst) => {
      const monthKey = inst.dueDate.substring(0, 7)
      if (monthKey < dateFrom || monthKey > dateTo) return
      const amount = convertAmount(inst.amount, inst.currency, currency)
      if (inst.paymentStatus === 'pagado') {
        totalPaid += amount
      } else {
        totalPending += amount
        if (new Date(inst.dueDate) < today) overdueCount++
      }
    })
    return { totalPaid, totalPending, total: totalPaid + totalPending, overdueCount }
  }, [currency, dateFrom, dateTo, allInstallments])

  // ─── Chart data (always monthly, for readability) ────────────────────────────

  const chartData = useMemo(() => {
    return months.map(({ key, label }) => {
      let paid = 0
      let pending = 0
      allInstallments.forEach((inst) => {
        if (inst.dueDate.substring(0, 7) !== key) return
        const amount = convertAmount(inst.amount, inst.currency, currency)
        if (inst.paymentStatus === 'pagado') paid += amount
        else pending += amount
      })
      return { label, paid, pending }
    })
  }, [months, currency, allInstallments])

  // ─── Column definitions ───────────────────────────────────────────────────────

  const columns = useMemo(() => {
    if (colPeriod === 'semana')    return weeks
    if (colPeriod === 'mes')       return months
    return quarters.map((q) => ({ key: q.key, label: q.label }))
  }, [colPeriod, weeks, months, quarters])

  // ─── Cell / row aggregation ───────────────────────────────────────────────────

  function getCellValue(rowId: string, colKey: string): CellData {
    const rowMap = matrixData.get(rowId)
    if (!rowMap) return { paid: 0, pending: 0 }

    if (colPeriod === 'mes' || colPeriod === 'semana') {
      return rowMap.get(colKey) ?? { paid: 0, pending: 0 }
    }

    // trimestre: sum month cells
    const q = quarters.find((q) => q.key === colKey)
    if (!q) return { paid: 0, pending: 0 }
    let paid = 0, pending = 0
    q.months.forEach((mk) => {
      const cell = rowMap.get(mk)
      if (cell) { paid += cell.paid; pending += cell.pending }
    })
    return { paid, pending }
  }

  function getRowTotals(rowId: string): CellData {
    let paid = 0, pending = 0
    columns.forEach(({ key }) => {
      const cell = getCellValue(rowId, key)
      paid += cell.paid
      pending += cell.pending
    })
    return { paid, pending }
  }

  function fmtCell(value: number): string {
    return value === 0 ? '—' : formatCurrencyCompact(value, currency)
  }

  function fmtNumber(value: number): string {
    return value === 0 ? '—' : value.toLocaleString('es-AR', { maximumFractionDigits: 0 })
  }

  // ─── UI config ────────────────────────────────────────────────────────────────

  const groupingButtons: { value: RowGrouping; label: string }[] = [
    { value: 'empresa', label: 'Empresa' },
    { value: 'centro_costo', label: 'Centro de Costo' },
    { value: 'activo', label: 'Activo' },
    { value: 'poliza', label: 'Póliza' },
  ]

  const periodButtons: { value: ColPeriod; label: string }[] = [
    { value: 'semana', label: 'Semana' },
    { value: 'mes', label: 'Mes' },
    { value: 'trimestre', label: 'Trimestre' },
  ]

  // ─── Export handlers ──────────────────────────────────────────────────────────

  const periodLabel = colPeriod === 'semana' ? 'semanal' : colPeriod === 'mes' ? 'mensual' : 'trimestral'
  const groupingLabel = groupingButtons.find((b) => b.value === grouping)?.label ?? grouping

  function handleExportCSV() {
    const header = [groupingLabel, ...columns.map((c) => `${c.label} Pag`), ...columns.map((c) => `${c.label} Pen`), 'Total Pag', 'Total Pen']
    const dataRows = rows.map((row) => {
      const totals = getRowTotals(row.id)
      return [
        row.label,
        ...columns.map((c) => {
          const v = getCellValue(row.id, c.key).paid
          return v === 0 ? '' : v.toFixed(0)
        }),
        ...columns.map((c) => {
          const v = getCellValue(row.id, c.key).pending
          return v === 0 ? '' : v.toFixed(0)
        }),
        totals.paid === 0 ? '' : totals.paid.toFixed(0),
        totals.pending === 0 ? '' : totals.pending.toFixed(0),
      ]
    })

    // Column totals row
    const colTotals = columns.flatMap((col) => {
      let paid = 0, pending = 0
      rows.forEach((r) => { const c = getCellValue(r.id, col.key); paid += c.paid; pending += c.pending })
      return [paid.toFixed(0), pending.toFixed(0)]
    })
    dataRows.push(['TOTAL', ...colTotals, kpis.totalPaid.toFixed(0), kpis.totalPending.toFixed(0)])

    downloadXLSX([header, ...dataRows], `analisis-financiero-${periodLabel}-${dateFrom}-${dateTo}.xlsx`)
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
      const totals = getRowTotals(row.id)
      const hasData = totals.paid + totals.pending > 0
      return {
        cells: [
          row.label,
          ...columns.map((c) => {
            const cell = getCellValue(row.id, c.key)
            if (!cell.paid && !cell.pending) return '—'
            const parts = []
            if (cell.paid)    parts.push(`+${fmtNumber(cell.paid)}`)
            if (cell.pending) parts.push(`-${fmtNumber(cell.pending)}`)
            return parts.join(' / ')
          }),
          totals.paid + totals.pending === 0
            ? '—'
            : `${fmtNumber(totals.paid)} / ${fmtNumber(totals.pending)}`,
        ],
        isDim: !hasData,
      }
    })

    // Totals row
    pdfRows.push({
      cells: [
        'TOTAL',
        ...columns.map((col) => {
          let paid = 0, pending = 0
          rows.forEach((r) => { const c = getCellValue(r.id, col.key); paid += c.paid; pending += c.pending })
          if (!paid && !pending) return '—'
          return `${fmtNumber(paid)} / ${fmtNumber(pending)}`
        }),
        `${fmtNumber(kpis.totalPaid)} / ${fmtNumber(kpis.totalPending)}`,
      ],
      isTotal: true,
    })

      await printTableAsPDF(
        'Análisis Financiero',
        `Vista ${periodLabel} · Agrupado por ${groupingLabel} · ${currency} · ${dateFrom} – ${dateTo}`,
        pdfColumns,
        pdfRows,
      )
    } finally {
      setPdfLoading(false)
    }
  }

  const handleDateRange = (from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
  }

  return (
    <PageContent>
      <PageHeader
        title="Análisis Financiero"
        subtitle="Flujo de cuotas y vencimientos por período"
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
                    colPeriod === btn.value ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
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
              {weeks.length} semanas en el rango seleccionado
            </span>
          )}
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

      {/* Bar chart (always monthly) */}
      <SectionCard
        title="Pagado vs Pendiente por mes"
        subtitle={`Vista en ${currency} · agrupado mensualmente`}
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
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
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
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
              <Bar dataKey="paid" name="Pagado" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pending" name="Pendiente" fill="#f87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Matrix table */}
      <SectionCard
        title="Matriz de cuotas"
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
                const rowTotals = getRowTotals(row.id)
                const hasData = rowTotals.paid + rowTotals.pending > 0
                return (
                  <tr key={row.id} className={!hasData ? 'opacity-40' : ''}>
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
                      const cell = getCellValue(row.id, col.key)
                      const hasPaid = cell.paid > 0
                      const hasPending = cell.pending > 0
                      return (
                        <td key={col.key} className="text-right align-top p-0">
                          {hasPaid || hasPending ? (
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
                            <span className="block text-center text-slate-300 text-xs py-2 px-3">—</span>
                          )}
                        </td>
                      )
                    })}

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
                        {!rowTotals.paid && !rowTotals.pending && (
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
                  let colPaid = 0, colPending = 0
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
