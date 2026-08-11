import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSpreadsheet, FileText, Package, ShieldCheck, X } from 'lucide-react'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { OverflowCell } from '../../../shared/components/data-table/OverflowCell'
import { ColumnConfigButton } from '../../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../../shared/components/data-table/ExportPresetsButton'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { formatCurrencyCompact, formatDate } from '../../../shared/utils/format'
import { DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS, POLICY_STATUS_LABELS, ASSET_TYPES } from '../../../shared/constants'
import { useColumnConfig } from '../../../shared/hooks/useColumnConfig'
import {
  UNASSIGNED_FIXED_ASSET_LABEL,
  UNASSIGNED_COST_CENTER_LABEL,
  type PolicyExportRow,
} from '../../../shared/utils/insuranceDashboardCalc'
import type { TableColumn, PolicyStatus } from '../../../shared/types'

interface PolicyExportViewProps {
  rows: PolicyExportRow[]
}

const NO_ASSET_LABEL = 'Sin activo asociado'
const NO_COMPANY_LABEL = 'Sin empresa asignada'
const NO_DOCUMENT_LABEL = 'Sin documentos'
const NO_INSURANCE_TYPE_LABEL = 'Sin cobertura'

const POLICY_STATUS_OPTIONS = (['vigente', 'proximo_vencer', 'vencida'] as PolicyStatus[]).map((s) => ({
  value: s,
  label: POLICY_STATUS_LABELS[s] ?? s,
}))
const ASSET_TYPE_OPTIONS = [...ASSET_TYPES.map((t) => ({ value: t, label: t })), { value: NO_ASSET_LABEL, label: NO_ASSET_LABEL }]

function textOrDash(value: string | null | undefined): string {
  return value && value.trim() ? value : '—'
}

// Buckets compartidos entre columnas (render/export) y filtros — misma regla
// en los dos lugares para que lo que se ve y lo que se filtra nunca difieran.
function fixedAssetBucket(row: PolicyExportRow): string {
  return row.fixedAssetName ?? (row.assetId ? UNASSIGNED_FIXED_ASSET_LABEL : NO_ASSET_LABEL)
}
function assetTypeBucket(row: PolicyExportRow): string {
  return row.assetType ?? NO_ASSET_LABEL
}
function insuranceTypeBucket(row: PolicyExportRow): string {
  return row.insuranceTypeName || NO_INSURANCE_TYPE_LABEL
}
function documentTypeBucket(row: PolicyExportRow): string {
  return row.documentType ? DOCUMENT_TYPE_LABELS[row.documentType] ?? row.documentType : NO_DOCUMENT_LABEL
}
function documentStatusBucket(row: PolicyExportRow): string {
  return row.documentStatus ? DOCUMENT_STATUS_LABELS[row.documentStatus] ?? row.documentStatus : NO_DOCUMENT_LABEL
}
function costCenterBuckets(row: PolicyExportRow): string[] {
  return row.costCenterNames.length > 0 ? row.costCenterNames : [UNASSIGNED_COST_CENTER_LABEL]
}
function companyBuckets(row: PolicyExportRow): string[] {
  return row.companyNames.length > 0 ? row.companyNames : [NO_COMPANY_LABEL]
}

function distinctOptions(values: string[]): { value: string; label: string }[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'es')).map((v) => ({ value: v, label: v }))
}

const ALL_COLUMNS: TableColumn<PolicyExportRow>[] = [
  {
    id: 'policyNumber', key: 'policyNumber', label: 'Póliza', sortable: true, defaultVisible: true,
    className: 'font-mono text-slate-600',
  },
  {
    id: 'status', key: 'status', label: 'Estado', sortable: true, defaultVisible: true,
    render: (v) => <StatusPill status={v as string} size="sm" />,
  },
  {
    id: 'endDate', key: 'endDate', label: 'Vigencia hasta', sortable: true, defaultVisible: true,
    render: (v) => formatDate(v as string),
  },
  {
    id: 'startDate', key: 'startDate', label: 'Vigencia desde', sortable: true, defaultVisible: false,
    render: (v) => formatDate(v as string),
  },
  {
    id: 'termMonths', key: 'termMonths', label: 'Meses de Vigencia', sortable: true, defaultVisible: true, numeric: true,
    render: (v) => `${v as number} m.`,
  },
  {
    id: 'monthlyEstimatedCostUsd', key: 'monthlyEstimatedCostUsd', label: 'Costo Mensual Estimado (USD)', sortable: true, defaultVisible: true, numeric: true,
    exportValue: (row) => row.monthlyEstimatedCostUsd,
    render: (v) => (v != null ? formatCurrencyCompact(v as number, 'USD') : '—'),
  },
  {
    id: 'insuranceCompany', key: 'insuranceCompany', label: 'Aseguradora', sortable: true, defaultVisible: false,
  },
  {
    id: 'insuranceTypeName', key: 'insuranceTypeName', label: 'Tipo de seguro', sortable: true, defaultVisible: true,
    exportValue: (row) => insuranceTypeBucket(row),
    render: (_v, row) => insuranceTypeBucket(row),
  },
  {
    id: 'assetName', key: 'assetName', label: 'Activo', sortable: true, defaultVisible: true,
    exportValue: (row) => (row.assetName ? (row.assetCode ? `${row.assetCode} · ${row.assetName}` : row.assetName) : row.assetId ? 'Activo no disponible' : NO_ASSET_LABEL),
    render: (_v, row) => (
      <OverflowCell value={row.assetName ? (row.assetCode ? `${row.assetCode} · ${row.assetName}` : row.assetName) : null} emptyLabel={row.assetId ? 'Activo no disponible' : NO_ASSET_LABEL} lines={1} />
    ),
  },
  {
    id: 'assetType', key: 'assetType', label: 'Tipo de activo', sortable: true, defaultVisible: false,
    exportValue: (row) => assetTypeBucket(row),
    render: (_v, row) => assetTypeBucket(row),
  },
  {
    id: 'fixedAssetName', key: 'fixedAssetName', label: 'Bien de Uso', sortable: true, defaultVisible: true,
    exportValue: (row) => fixedAssetBucket(row),
    render: (_v, row) => fixedAssetBucket(row),
  },
  {
    id: 'costCenterLabel', key: 'costCenterLabel', label: 'Centro(s) de Costo', sortable: true, defaultVisible: true,
    exportValue: (row) => textOrDash(row.costCenterLabel),
    render: (v) => <OverflowCell value={(v as string) || null} lines={1} />,
  },
  {
    id: 'companyLabel', key: 'companyLabel', label: 'Empresa(s)', sortable: true, defaultVisible: false,
    exportValue: (row) => textOrDash(row.companyLabel),
    render: (v) => <OverflowCell value={(v as string) || null} lines={1} />,
  },
  {
    id: 'insuredAmount', key: 'insuredAmount', label: 'Suma Asegurada', sortable: true, defaultVisible: false, numeric: true,
    exportValue: (row) => (row.insuredAmount || null),
    render: (_v, row) => (row.insuredAmount ? formatCurrencyCompact(row.insuredAmount, row.currency) : '—'),
  },
  {
    id: 'insuredAmountUsd', key: 'insuredAmountUsd', label: 'Suma Asegurada (USD)', sortable: true, defaultVisible: false, numeric: true,
    exportValue: (row) => (row.insuredAmountUsd || null),
    render: (v) => (v ? formatCurrencyCompact(v as number, 'USD') : '—'),
  },
  {
    id: 'documentType', key: 'documentType', label: 'Tipo Doc.', sortable: true, defaultVisible: true,
    exportValue: (row) => documentTypeBucket(row),
    render: (_v, row) => (row.documentType ? documentTypeBucket(row) : <span className="text-slate-400">{NO_DOCUMENT_LABEL}</span>),
  },
  {
    id: 'documentNumber', key: 'documentNumber', label: 'N° Documento', sortable: true, defaultVisible: true,
    exportValue: (row) => textOrDash(row.documentNumber),
    render: (v) => textOrDash(v as string),
  },
  {
    id: 'issueDate', key: 'issueDate', label: 'Fecha Emisión', sortable: true, defaultVisible: true,
    render: (v) => (v ? formatDate(v as string) : '—'),
  },
  {
    id: 'documentStatus', key: 'documentStatus', label: 'Estado Doc.', sortable: true, defaultVisible: false,
    exportValue: (row) => documentStatusBucket(row),
    render: (v) => (v ? <StatusPill status={v as string} size="sm" /> : '—'),
  },
  {
    id: 'documentCurrency', key: 'documentCurrency', label: 'Moneda Doc.', sortable: true, defaultVisible: false,
    exportValue: (row) => textOrDash(row.documentCurrency),
    render: (v) => textOrDash(v as string),
  },
  {
    id: 'allocatedAmount', key: 'allocatedAmount', label: 'Importe Asignado', sortable: true, defaultVisible: true, numeric: true,
    exportValue: (row) => row.allocatedAmount,
    render: (_v, row) => (row.allocatedAmount != null ? formatCurrencyCompact(row.allocatedAmount, row.documentCurrency ?? 'ARS') : '—'),
    className: 'font-medium',
  },
  {
    id: 'allocationPercentage', key: 'allocationPercentage', label: '% Asignación', sortable: true, defaultVisible: false, numeric: true,
    exportValue: (row) => row.allocationPercentage,
    render: (v) => (v != null ? `${(v as number).toFixed(1)}%` : '—'),
  },
  {
    id: 'documentTotalAmount', key: 'documentTotalAmount', label: 'Importe Total Doc.', sortable: true, defaultVisible: false, numeric: true,
    exportValue: (row) => row.documentTotalAmount,
    render: (_v, row) => (row.documentTotalAmount != null ? formatCurrencyCompact(row.documentTotalAmount, row.documentCurrency ?? 'ARS') : '—'),
  },
]

function matchesSearch(row: PolicyExportRow, search: string): boolean {
  const haystack = [row.policyNumber, row.assetCode, row.assetName, row.documentNumber, row.fixedAssetName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(search.toLowerCase())
}

function matchesOneOf(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(value)
}

function matchesAnyOf(selected: string[], values: string[]): boolean {
  return selected.length === 0 || values.some((v) => selected.includes(v))
}

// Se solapa si NO (termina antes del filtro empieza) y NO (empieza después de que el filtro termina).
function overlapsMonthRange(startDate: string, endDate: string, from: string, to: string): boolean {
  if (from && endDate.slice(0, 7) < from) return false
  if (to && startDate.slice(0, 7) > to) return false
  return true
}

export function PolicyExportView({ rows }: PolicyExportViewProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [vigenciaFrom, setVigenciaFrom] = useState('')
  const [vigenciaTo, setVigenciaTo] = useState('')
  const [filterAssetType, setFilterAssetType] = useState<string[]>([])
  const [filterInsuranceType, setFilterInsuranceType] = useState<string[]>([])
  const [filterFixedAsset, setFilterFixedAsset] = useState<string[]>([])
  const [filterCostCenter, setFilterCostCenter] = useState<string[]>([])
  const [filterCompany, setFilterCompany] = useState<string[]>([])
  const [filterInsurer, setFilterInsurer] = useState<string[]>([])
  const [filterDocType, setFilterDocType] = useState<string[]>([])
  const [filterDocStatus, setFilterDocStatus] = useState<string[]>([])

  const insuranceTypeOptions = useMemo(() => distinctOptions(rows.map(insuranceTypeBucket)), [rows])
  const fixedAssetOptions = useMemo(() => distinctOptions(rows.map(fixedAssetBucket)), [rows])
  const costCenterOptions = useMemo(() => distinctOptions(rows.flatMap(costCenterBuckets)), [rows])
  const companyOptions = useMemo(() => distinctOptions(rows.flatMap(companyBuckets)), [rows])
  const insurerOptions = useMemo(() => distinctOptions(rows.map((r) => r.insuranceCompany)), [rows])
  const docTypeOptions = useMemo(() => distinctOptions(rows.map(documentTypeBucket)), [rows])
  const docStatusOptions = useMemo(() => distinctOptions(rows.map(documentStatusBucket)), [rows])

  const hasActiveFilters =
    filterStatus.length > 0 || !!vigenciaFrom || !!vigenciaTo || filterAssetType.length > 0 ||
    filterInsuranceType.length > 0 || filterFixedAsset.length > 0 || filterCostCenter.length > 0 ||
    filterCompany.length > 0 || filterInsurer.length > 0 || filterDocType.length > 0 || filterDocStatus.length > 0

  function clearFilters() {
    setFilterStatus([]); setVigenciaFrom(''); setVigenciaTo('')
    setFilterAssetType([]); setFilterInsuranceType([]); setFilterFixedAsset([])
    setFilterCostCenter([]); setFilterCompany([]); setFilterInsurer([])
    setFilterDocType([]); setFilterDocStatus([])
  }

  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        (!search.trim() || matchesSearch(row, search)) &&
        matchesOneOf(filterStatus, row.status) &&
        overlapsMonthRange(row.startDate, row.endDate, vigenciaFrom, vigenciaTo) &&
        matchesOneOf(filterAssetType, assetTypeBucket(row)) &&
        matchesOneOf(filterInsuranceType, insuranceTypeBucket(row)) &&
        matchesOneOf(filterFixedAsset, fixedAssetBucket(row)) &&
        matchesAnyOf(filterCostCenter, costCenterBuckets(row)) &&
        matchesAnyOf(filterCompany, companyBuckets(row)) &&
        matchesOneOf(filterInsurer, row.insuranceCompany) &&
        matchesOneOf(filterDocType, documentTypeBucket(row)) &&
        matchesOneOf(filterDocStatus, documentStatusBucket(row)),
      ),
    [
      rows, search, filterStatus, vigenciaFrom, vigenciaTo, filterAssetType, filterInsuranceType,
      filterFixedAsset, filterCostCenter, filterCompany, filterInsurer, filterDocType, filterDocStatus,
    ],
  )

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig(
    'insurance-dashboard-export',
    ALL_COLUMNS,
  )

  const policyCount = useMemo(() => new Set(filtered.map((r) => r.policyId)).size, [filtered])
  const assetCount = useMemo(() => new Set(filtered.map((r) => r.assetId).filter(Boolean)).size, [filtered])
  const documentCount = useMemo(() => new Set(filtered.map((r) => r.documentId).filter(Boolean)).size, [filtered])

  return (
    <div className="flex flex-col gap-5">
      <MetricGrid cols={4}>
        <KpiCard label="Filas en la planilla" value={filtered.length} description="Póliza × activo × documento" icon={FileSpreadsheet} variant="info" />
        <KpiCard label="Pólizas" value={policyCount} description="Vigentes, próximas a vencer y vencidas" icon={ShieldCheck} variant="default" />
        <KpiCard label="Activos con línea" value={assetCount} description="Activos cubiertos por al menos una póliza" icon={Package} variant="default" />
        <KpiCard label="Documentos" value={documentCount} description="Facturas, NC, ND y ajustes referenciados" icon={FileText} variant="default" />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Buscar por póliza, activo o N° de documento…"
              className="w-full sm:w-72"
            />
            <MultiSelectFilter label="Estado de póliza" options={POLICY_STATUS_OPTIONS} value={filterStatus} onChange={setFilterStatus} />
            <DateRangeMonthPicker from={vigenciaFrom} to={vigenciaTo} onChange={(f, t) => { setVigenciaFrom(f); setVigenciaTo(t) }} />
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {filtered.length} de {rows.length} filas
              </span>
              <ExportPresetsButton
                tableKey="insurance-dashboard-export"
                allColumns={ALL_COLUMNS}
                visibleColumns={visibleColumns}
                filteredRows={filtered}
                filenamePrefix="polizas-activos-documentos"
                onApplyPreset={applyPreset}
              />
              <ColumnConfigButton
                columnConfigs={columnConfigs}
                onToggle={toggle}
                onReorder={reorder}
                onReset={reset}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <MultiSelectFilter label="Tipo de activo" options={ASSET_TYPE_OPTIONS} value={filterAssetType} onChange={setFilterAssetType} />
            <MultiSelectFilter label="Tipo de seguro" options={insuranceTypeOptions} value={filterInsuranceType} onChange={setFilterInsuranceType} />
            <MultiSelectFilter label="Bien de Uso" options={fixedAssetOptions} value={filterFixedAsset} onChange={setFilterFixedAsset} />
            <MultiSelectFilter label="Centro de Costo" options={costCenterOptions} value={filterCostCenter} onChange={setFilterCostCenter} />
            <MultiSelectFilter label="Empresa" options={companyOptions} value={filterCompany} onChange={setFilterCompany} />
            <MultiSelectFilter label="Aseguradora" options={insurerOptions} value={filterInsurer} onChange={setFilterInsurer} />
            <MultiSelectFilter label="Tipo de documento" options={docTypeOptions} value={filterDocType} onChange={setFilterDocType} />
            <MultiSelectFilter label="Estado del documento" options={docStatusOptions} value={filterDocStatus} onChange={setFilterDocStatus} />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                <X size={12} />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
        <DataTable
          tableKey="insurance-dashboard-export"
          columns={visibleColumns}
          data={filtered}
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/policies/${row.policyId}`)}
          emptyTitle="Sin filas para mostrar"
          emptyDescription="No se encontraron filas con los filtros aplicados."
          minWidth={1400}
        />
      </SectionCard>
    </div>
  )
}
