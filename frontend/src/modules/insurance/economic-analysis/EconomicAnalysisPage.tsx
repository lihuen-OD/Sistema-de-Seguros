import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import { TrendingUp, Building2, FileText, FileSpreadsheet, FileDown, Loader2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { formatCurrencyCompact, formatCurrencyFull } from '../../../shared/utils/format'
import { getDocumentEconomicEffect } from '../../../shared/utils/documentEconomicEffect'
import {
  downloadXLSX, printTableAsPDF, getISOWeekKey, generateWeekRange,
} from '../../../shared/utils/export'
import type { ExportCell } from '../../../shared/utils/export'
import { documentQueries } from '../../../shared/api/documents.api'
import { policyQueries } from '../../../shared/api/policies.api'
import { assetQueries } from '../../../shared/api/assets.api'
import { companyQueries } from '../../../shared/api/companies.api'
import { costCenterQueries } from '../../../shared/api/cost-centers.api'
import { resolveDocumentPaymentMethod } from '../../../shared/utils/documentPaymentMethod'
import type { Currency, Policy, Asset, Company, CostCenter, AccountingDocument, DocumentPolicyAllocation } from '../../../shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

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

// El documento ya llega cerrado en ambas monedas (totalAmountArs/totalAmountUsd,
// calculadas server-side al crearlo/editarlo — ver computeDualAmounts). Elegir
// la columna correcta reemplaza cualquier reconversión con una tasa fija.
function pickDocTotal(doc: AccountingDocument, currency: Currency): number {
  return currency === 'ARS' ? (doc.totalAmountArs ?? 0) : (doc.totalAmountUsd ?? 0)
}

// Una asignación (allocatedAmount) es una porción del total del documento, en
// la moneda nativa del documento. Se re-expresa en la moneda pedida aplicando
// la misma fracción sobre el total ya cerrado en esa moneda.
function allocationInCurrency(doc: AccountingDocument, allocatedAmount: number, currency: Currency): number {
  if (!doc.totalAmount) return 0
  return (allocatedAmount / doc.totalAmount) * pickDocTotal(doc, currency)
}

// ─── Policy context builder ───────────────────────────────────────────────────

// Cada allocation ya apunta a una línea de cobertura puntual (assetId directo
// si tiene activo; empresa/centro de costo propios de la línea si es "sin
// activo") — se resuelve por allocation, no por póliza, porque una póliza de
// flota puede tener varias allocations del mismo documento repartidas entre
// distintos activos (ver seed.ts: factura de flota 60/40 entre 2 camiones).
// Usar el monto asignado (allocatedAmount) directamente en vez de
// recalcularlo desde el porcentaje es lo que hace que las asignaciones
// negativas de una Nota de Crédito aplicada compensen correctamente a las de
// la factura vinculada.
interface AllocationContext {
  policyId: string
  companyId: string
  costCenterId: string
  assetId: string | null
  insuranceCompany: string
  allocatedAmount: number
}

function buildDocumentAllocationContexts(
  allocations: DocumentPolicyAllocation[],
  policies: Policy[],
  assets: Asset[],
): Map<string, AllocationContext[]> {
  const policyById = new Map(policies.map((p) => [p.id, p]))
  const assetById = new Map(assets.map((a) => [a.id, a]))
  const map = new Map<string, AllocationContext[]>()

  allocations.forEach((alloc) => {
    const policy = policyById.get(alloc.policyId)
    let companyId: string
    let costCenterId: string
    if (alloc.assetId) {
      const asset = assetById.get(alloc.assetId)
      companyId = asset?.companyId ?? ''
      costCenterId = asset?.costCenterId ?? ''
    } else {
      const coverage = policy?.coverages?.find((c) => c.id === alloc.policyAssetCoverageId)
      companyId = coverage?.companyId ?? ''
      costCenterId = coverage?.costCenterId ?? ''
    }
    const existing = map.get(alloc.accountingDocumentId) ?? []
    existing.push({
      policyId: alloc.policyId,
      companyId,
      costCenterId,
      assetId: alloc.assetId,
      insuranceCompany: policy?.insuranceCompany ?? '',
      allocatedAmount: alloc.allocatedAmount,
    })
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
    case 'aseguradora': {
      const insurers = Array.from(new Set(policies.map((p) => p.insuranceCompany))).sort()
      return insurers.map((name) => ({ id: name, label: name }))
    }
    case 'poliza':
      return policies.filter((p) => p.status !== 'vencida').map((p) => ({
        id: p.id, label: p.policyNumber, sublabel: `${(p.insuranceTypeNames ?? []).join(', ') || 'Sin tipo'} · ${p.insuranceCompany}`,
      }))
    case 'activo':
      return assets.map((a) => ({
        id: a.id, label: a.name, sublabel: `${a.internalCode} · ${a.assetType}`,
      }))
  }
}

// ─── Matrix data builder ──────────────────────────────────────────────────────

type EconomicMatrixData = Map<string, Map<string, number>>
type EconomicPaymentMethodMatrix = Map<string, Map<string, Map<string, number>>>

interface EconomicMatrixResult {
  matrix: EconomicMatrixData
  paymentMethods: EconomicPaymentMethodMatrix
}

function buildEconomicMatrix(
  grouping: RowGrouping,
  displayCurrency: Currency,
  granularity: 'week' | 'month',
  policies: Policy[],
  assets: Asset[],
  documents: AccountingDocument[],
  allocations: DocumentPolicyAllocation[],
): EconomicMatrixResult {
  const allocationContexts = buildDocumentAllocationContexts(allocations, policies, assets)
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]))
  const matrix: EconomicMatrixData = new Map()
  const paymentMethods: EconomicPaymentMethodMatrix = new Map()

  documents.forEach((doc) => {
    const key = granularity === 'week'
      ? getISOWeekKey(doc.issueDate)
      : doc.issueDate.substring(0, 7)
    const docContexts = allocationContexts.get(doc.id)
    if (!docContexts || docContexts.length === 0) return
    const paymentMethod = resolveDocumentPaymentMethod(doc.id, documentsById)

    docContexts.forEach((ctx) => {
      const policyAmount = allocationInCurrency(doc, ctx.allocatedAmount, displayCurrency)

      const rowIds: string[] = []
      switch (grouping) {
        case 'empresa':      if (ctx.companyId)    rowIds.push(ctx.companyId);    break
        case 'centro_costo': if (ctx.costCenterId) rowIds.push(ctx.costCenterId); break
        case 'aseguradora':  if (ctx.insuranceCompany) rowIds.push(ctx.insuranceCompany); break
        case 'poliza':       rowIds.push(ctx.policyId); break
        case 'activo':       if (ctx.assetId) rowIds.push(ctx.assetId); break
      }

      rowIds.forEach((rowId) => {
        if (!matrix.has(rowId)) matrix.set(rowId, new Map())
        const rowMap = matrix.get(rowId)!
        rowMap.set(key, (rowMap.get(key) ?? 0) + policyAmount)

        if (grouping === 'empresa') {
          if (!paymentMethods.has(rowId)) paymentMethods.set(rowId, new Map())
          const companyMethods = paymentMethods.get(rowId)!
          if (!companyMethods.has(paymentMethod)) companyMethods.set(paymentMethod, new Map())
          const methodPeriods = companyMethods.get(paymentMethod)!
          methodPeriods.set(key, (methodPeriods.get(key) ?? 0) + policyAmount)
        }
      })
    })
  })

  return { matrix, paymentMethods }
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
  const { data: financialDocs = [], isError: isErrorDocs } = useQuery(documentQueries.financial())
  // includeCoverages:true — buildDocumentAllocationContexts necesita, para las
  // asignaciones "sin activo", la empresa/centro de costo propios de esa línea.
  const { data: allPolicies = [], isError: isErrorPolicies } = useQuery(policyQueries.list({ includeCoverages: true }))
  const { data: allAssets = [], isError: isErrorAssets } = useQuery(assetQueries.list())
  const { data: allCompanies = [], isError: isErrorCompanies } = useQuery(companyQueries.list())
  const { data: allCostCenters = [], isError: isErrorCostCenters } = useQuery(costCenterQueries.list())
  const isError = isErrorDocs || isErrorPolicies || isErrorAssets || isErrorCompanies || isErrorCostCenters

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
  const { matrix: matrixData, paymentMethods: companyPaymentMatrix } = useMemo(
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

  function getCompanyPaymentAmount(companyId: string, paymentMethod: string, colKey: string): number {
    const methodPeriods = companyPaymentMatrix.get(companyId)?.get(paymentMethod)
    if (!methodPeriods) return 0
    if (colPeriod === 'mes' || colPeriod === 'semana') return methodPeriods.get(colKey) ?? 0
    const periods = colPeriod === 'trimestre'
      ? viewQuarters.find((quarter) => quarter.key === colKey)?.months
      : viewYears.find((year) => year.key === colKey)?.months
    return periods?.reduce((sum, period) => sum + (methodPeriods.get(period) ?? 0), 0) ?? 0
  }

  function getCompanyPaymentMethods(companyId: string): string[] {
    return [...(companyPaymentMatrix.get(companyId)?.keys() ?? [])]
      .filter((method) => columns.some((col) => getCompanyPaymentAmount(companyId, method, col.key) !== 0))
      .sort((a, b) => {
        if (a === 'Sin especificar') return 1
        if (b === 'Sin especificar') return -1
        return a.localeCompare(b, 'es')
      })
  }

  function getCompanyPaymentTotal(companyId: string, paymentMethod: string): number {
    return columns.reduce(
      (sum, col) => sum + getCompanyPaymentAmount(companyId, paymentMethod, col.key),
      0,
    )
  }

  // ─── KPIs + pie data ─────────────────────────────────────────────────────────

  const { kpis, pieChartData } = useMemo(() => {
    let totalCost = 0
    const byInsurer = new Map<string, number>()
    const allocedPolicies = new Set<string>()
    const allocationContexts = buildDocumentAllocationContexts(allAllocations, allPolicies, allAssets)

    allDocuments.forEach((doc) => {
      const monthKey = doc.issueDate.substring(0, 7)
      if (monthKey < dateFrom || monthKey > dateTo) return
      totalCost += getDocumentEconomicEffect({ ...doc, totalAmount: pickDocTotal(doc, currency) })
      const docContexts = allocationContexts.get(doc.id)
      if (!docContexts) return
      docContexts.forEach((ctx) => {
        allocedPolicies.add(ctx.policyId)
        if (!ctx.insuranceCompany) return
        const policyAmount = allocationInCurrency(doc, ctx.allocatedAmount, currency)
        byInsurer.set(ctx.insuranceCompany, (byInsurer.get(ctx.insuranceCompany) ?? 0) + policyAmount)
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
          total += getDocumentEconomicEffect({ ...doc, totalAmount: pickDocTotal(doc, currency) })
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

  async function handleExportExcel() {
    const numberFormat = currency === 'ARS'
      ? '"AR$" #,##0;[Red]-"AR$" #,##0;"-"'
      : '"US$" #,##0;[Red]-"US$" #,##0;"-"'

    if (grouping === 'empresa') {
      const header: ExportCell[] = ['Empresa', 'Medio de pago', ...columns.map((c) => c.label), 'Total']
      const dataRows: ExportCell[][] = []
      const totalRowIndexes: number[] = []

      rows.forEach((row) => {
        getCompanyPaymentMethods(row.id).forEach((method) => {
          dataRows.push([
            row.label,
            method,
            ...columns.map((col) => getCompanyPaymentAmount(row.id, method, col.key)),
            getCompanyPaymentTotal(row.id, method),
          ])
        })
        totalRowIndexes.push(dataRows.length + 1)
        dataRows.push([
          row.label,
          'TOTAL',
          ...columns.map((col) => getCellAmount(row.id, col.key)),
          getRowTotal(row.id),
        ])
      })

      await downloadXLSX(
        [header, ...dataRows],
        `analisis-economico-${periodLabel}-${dateFrom}-${dateTo}.xlsx`,
        {
          autoFilter: true,
          numericColumnIndexes: columns.map((_, index) => index + 2).concat(columns.length + 2),
          numberFormat,
          totalRowIndexes,
        },
      )
      return
    }

    const header = [groupingLabel, ...columns.map((c) => c.label), 'Total']
    const dataRows: ExportCell[][] = rows.map((row) => [
      row.label,
      ...columns.map((c) => getCellAmount(row.id, c.key)),
      getRowTotal(row.id),
    ])
    const totalRow: ExportCell[] = [
      'TOTAL',
      ...columns.map((c) => getColumnTotal(c.key)),
      columns.reduce((s, c) => s + getColumnTotal(c.key), 0),
    ]
    await downloadXLSX(
      [header, ...dataRows, totalRow],
      `analisis-economico-${periodLabel}-${dateFrom}-${dateTo}.xlsx`,
      {
        autoFilter: true,
        numericColumnIndexes: header.slice(1).map((_, index) => index + 1),
        numberFormat,
        totalRowIndexes: [dataRows.length + 1],
      },
    )
  }

  async function handleExportPDF() {
    setPdfLoading(true)
    try {
      const pdfColumns = [
        { label: groupingLabel, align: 'left' as const },
        ...(grouping === 'empresa'
          ? [{ label: 'Medio de pago', align: 'left' as const }]
          : []),
        ...columns.map((c) => ({ label: c.label, align: 'right' as const })),
        { label: 'Total', align: 'right' as const },
      ]

      const pdfRows: { cells: string[]; isDim?: boolean; isTotal?: boolean }[] = []

      if (grouping === 'empresa') {
        rows.forEach((row) => {
          getCompanyPaymentMethods(row.id).forEach((method) => {
            pdfRows.push({
              cells: [
                row.label,
                method,
                ...columns.map((col) => fmtNumber(getCompanyPaymentAmount(row.id, method, col.key))),
                fmtNumber(getCompanyPaymentTotal(row.id, method)),
              ],
            })
          })

          pdfRows.push({
            cells: [
              row.label,
              'TOTAL',
              ...columns.map((col) => fmtNumber(getCellAmount(row.id, col.key))),
              fmtNumber(getRowTotal(row.id)),
            ],
            isTotal: true,
          })
        })

        pdfRows.push({
          cells: [
            'Total período',
            'TOTAL',
            ...columns.map((col) => fmtNumber(getColumnTotal(col.key))),
            fmtNumber(columns.reduce((sum, col) => sum + getColumnTotal(col.key), 0)),
          ],
          isTotal: true,
        })
      } else {
        rows.forEach((row) => {
          const rowTotal = getRowTotal(row.id)
          pdfRows.push({
            cells: [
              row.label,
              ...columns.map((col) => fmtNumber(getCellAmount(row.id, col.key))),
              fmtNumber(rowTotal),
            ],
            isDim: rowTotal === 0,
          })
        })

        pdfRows.push({
          cells: [
            'TOTAL',
            ...columns.map((col) => fmtNumber(getColumnTotal(col.key))),
            fmtNumber(columns.reduce((sum, col) => sum + getColumnTotal(col.key), 0)),
          ],
          isTotal: true,
        })
      }

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

  if (isError) return <PageContent><ErrorState /></PageContent>

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
                    currency === c ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
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
                    colPeriod === btn.value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
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
                    grouping === btn.value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
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
              onClick={handleExportExcel}
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
                {grouping === 'empresa' && (
                  <th className="text-left min-w-[180px] whitespace-nowrap">
                    Medio de pago
                  </th>
                )}
                {columns.map((col) => (
                  <th key={col.key} className="text-right min-w-[110px] whitespace-nowrap">
                    {colPeriod === 'semana' ? (
                      <span className="inline-flex flex-col items-end leading-tight">
                        <span className="font-semibold text-slate-600">{col.label.split('\n')[0]}</span>
                        <span className="mt-0.5 text-[10px] font-medium text-slate-400">{col.label.split('\n')[1]}</span>
                      </span>
                    ) : col.label}
                  </th>
                ))}
                <th className="text-right min-w-[120px] bg-slate-100/70 font-semibold whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {grouping === 'empresa' ? rows.flatMap((row) => {
                const methods = getCompanyPaymentMethods(row.id)
                const detailRows = methods.map((method, index) => {
                  const methodTotal = getCompanyPaymentTotal(row.id, method)
                  return (
                    <tr key={`${row.id}-${method}`}>
                      {index === 0 && (
                        <td
                          rowSpan={methods.length + 1}
                          className="sticky left-0 bg-white z-10 align-top"
                          style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}
                        >
                          <span className="text-sm font-medium text-slate-800 block max-w-[240px]">
                            {row.label}
                          </span>
                        </td>
                      )}
                      <td className="text-xs font-medium text-slate-700">{method}</td>
                      {columns.map((col) => {
                        const amount = getCompanyPaymentAmount(row.id, method, col.key)
                        const isNegative = amount < 0
                        return (
                          <td key={col.key} className="text-right tabular-nums">
                            {amount !== 0 ? (
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                isNegative ? 'text-amber-700 bg-amber-50' : 'text-brand-700 bg-brand-50'
                              }`}>
                                {fmtCell(amount)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="text-right bg-slate-50/80 tabular-nums">
                        <span className={`text-xs font-semibold ${methodTotal < 0 ? 'text-amber-700' : 'text-slate-800'}`}>
                          {fmtCell(methodTotal)}
                        </span>
                      </td>
                    </tr>
                  )
                })

                return [
                  ...detailRows,
                  <tr key={`${row.id}-total`} className="bg-slate-50 border-t border-slate-200">
                    {methods.length === 0 && (
                      <td
                        className="sticky left-0 bg-slate-50 z-10"
                        style={{ boxShadow: '1px 0 0 0 #e2e8f0' }}
                      >
                        <span className="text-sm font-medium text-slate-800">{row.label}</span>
                      </td>
                    )}
                    <td className="text-xs font-bold text-slate-700">TOTAL</td>
                    {columns.map((col) => (
                      <td key={col.key} className="text-right tabular-nums">
                        <span className="text-xs font-bold text-slate-800">
                          {fmtCell(getCellAmount(row.id, col.key))}
                        </span>
                      </td>
                    ))}
                    <td className="text-right bg-slate-100 tabular-nums">
                      <span className="text-xs font-bold text-slate-900">{fmtCell(getRowTotal(row.id))}</span>
                    </td>
                  </tr>,
                ]
              }) : rows.map((row) => {
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
                                isNegative ? 'text-amber-700 bg-amber-50' : 'text-brand-700 bg-brand-50'
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
                {grouping === 'empresa' && (
                  <td className="text-xs font-bold text-slate-700">TOTAL</td>
                )}
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
        <div className="flex items-center gap-5 px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-brand-100 border border-brand-300 inline-block" />
            <span className="text-xs text-slate-500">Costo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block" />
            <span className="text-xs text-slate-500">Nota de crédito / ajuste</span>
          </div>
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
