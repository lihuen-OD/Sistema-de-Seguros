import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, CheckCircle2, Clock, AlertCircle, Eye, Edit2, Trash2, X } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { ColumnConfigButton } from '../../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../../shared/components/data-table/ExportPresetsButton'
import { MultiSelectFilter } from '../../../shared/components/filters/MultiSelectFilter'
import { DateRangeMonthPicker } from '../../../shared/components/filters/DateRangeMonthPicker'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { documentsApi } from '../../../shared/api/documents.api'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PAYMENT_STATUS_LABELS } from '../../../shared/constants'
import { useColumnConfig } from '../../../shared/hooks/useColumnConfig'
import type { AccountingDocument, TableColumn } from '../../../shared/types'

const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export default function DocumentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string[]>([])
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: allDocuments = [], isLoading, isError } = useQuery({ queryKey: ['documents'], queryFn: documentsApi.findAll })
  const { data: documentTypesData } = useQuery({ queryKey: ['documents', 'types'], queryFn: () => documentsApi.getTypes() })
  const documentTypes = documentTypesData?.types ?? []
  const documentTypeLabels = useMemo(
    () => Object.fromEntries(documentTypes.map((t) => [t.key, t.label])),
    [documentTypes],
  )

  const DOCUMENT_TYPE_OPTIONS = documentTypes.map((t) => ({ value: t.key, label: t.label }))

  const totals = useMemo(() => ({
    pending: allDocuments.filter((d) => d.paymentStatus === 'PENDING').reduce((s, d) => s + d.totalAmount, 0),
    paid: allDocuments.filter((d) => d.paymentStatus === 'PAID').reduce((s, d) => s + d.totalAmount, 0),
  }), [allDocuments])

  const partialCount = allDocuments.filter((d) => d.paymentStatus === 'PARTIALLY_PAID').length

  const filtered = useMemo(() => {
    return allDocuments.filter((doc) => {
      const q = search.toLowerCase()
      const matchSearch = !search || doc.documentNumber.toLowerCase().includes(q)
      const matchType = filterType.length === 0 || filterType.includes(doc.documentType)
      const matchStatus = filterStatus.length === 0 || filterStatus.includes(doc.paymentStatus)
      const date = doc.issueDate ?? ''
      const matchDateFrom = !filterDateFrom || date.slice(0, 7) >= filterDateFrom
      const matchDateTo   = !filterDateTo   || date.slice(0, 7) <= filterDateTo
      return matchSearch && matchType && matchStatus && matchDateFrom && matchDateTo
    })
  }, [allDocuments, search, filterType, filterStatus, filterDateFrom, filterDateTo])

  async function handleDelete(id: string) {
    await documentsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: ['documents'] })
    setConfirmDeleteId(null)
  }

  const ALL_COLUMNS: TableColumn<AccountingDocument>[] = useMemo(() => [
    {
      id: 'documentNumber',
      key: 'documentNumber',
      label: 'N° Documento',
      defaultVisible: true,
      className: 'font-mono text-xs text-slate-600 min-w-[160px]',
    },
    {
      id: 'documentType',
      key: 'documentType',
      label: 'Tipo',
      defaultVisible: true,
      render: (v) => <span className="text-slate-700 font-medium text-xs">{documentTypeLabels[v as string] ?? String(v)}</span>,
    },
    {
      id: 'issueDate',
      key: 'issueDate',
      label: 'Fecha Emisión',
      defaultVisible: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      id: 'currency',
      key: 'currency',
      label: 'Moneda',
      defaultVisible: true,
      render: (v) => (
        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
          {String(v)}
        </span>
      ),
      className: 'w-20',
    },
    {
      id: 'netAmount',
      key: 'netAmount',
      label: 'Neto',
      defaultVisible: true,
      exportValue: (row) => String(row.netAmount),
      render: (v, row) => (
        <span className="tabular-nums text-xs text-slate-600">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'vatAmount',
      key: 'vatAmount',
      label: 'IVA',
      defaultVisible: true,
      exportValue: (row) => String(row.vatAmount),
      render: (v, row) => (
        <span className="tabular-nums text-xs text-slate-600">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'totalAmount',
      key: 'totalAmount',
      label: 'Total',
      defaultVisible: true,
      exportValue: (row) => String(row.totalAmount),
      render: (v, row) => (
        <span className="tabular-nums text-sm font-semibold text-slate-800">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'paymentStatus',
      key: 'paymentStatus',
      label: 'Estado Pago',
      defaultVisible: true,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    // ── Columnas opcionales ────────────────────────────────────────────────────
    {
      id: 'otherTaxesAmount',
      key: 'otherTaxesAmount',
      label: 'Otros impuestos',
      defaultVisible: false,
      exportValue: (row) => String(row.otherTaxesAmount),
      render: (v, row) =>
        (v as number) > 0
          ? <span className="tabular-nums text-xs text-slate-600">{formatCurrencyFull(v as number, row.currency)}</span>
          : <span className="text-slate-400">—</span>,
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'insuranceCompany',
      key: 'insuranceCompany',
      label: 'Aseguradora',
      defaultVisible: false,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'paymentMethod',
      key: 'paymentMethod',
      label: 'Método de pago',
      defaultVisible: false,
      render: (v) =>
        v
          ? <span className="text-xs text-slate-600">{String(v).replace(/_/g, ' ')}</span>
          : <span className="text-slate-400">—</span>,
    },
    {
      id: 'exchangeRate',
      key: 'exchangeRate',
      label: 'Tipo de cambio',
      defaultVisible: false,
      exportValue: (row) => String(row.exchangeRate),
      render: (v) =>
        (v as number) > 1
          ? <span className="tabular-nums text-sm text-slate-600">${(v as number).toLocaleString('es-AR')}</span>
          : <span className="text-slate-400">—</span>,
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      id: 'attachmentsCount',
      key: 'attachmentsCount',
      label: 'Adjuntos',
      defaultVisible: false,
      exportValue: (row) => String(row.attachmentsCount ?? 0),
      render: (v) => {
        const n = v as number | undefined
        return n != null && n > 0
          ? <span className="text-sm font-medium text-slate-700">{n}</span>
          : <span className="text-slate-400">—</span>
      },
      className: 'text-center',
      headerClassName: 'text-center',
    },
    {
      id: 'createdAt',
      key: 'createdAt',
      label: 'Fecha de alta',
      defaultVisible: false,
      render: (v) => <span className="text-xs text-slate-500 tabular-nums">{formatDate(v as string)}</span>,
    },
    // ── Acciones ────────────────────────────────────────────────────────────────
    {
      id: 'actions',
      key: 'id',
      label: '',
      hideable: false,
      render: (_, row) => (
        <div className="flex items-center gap-1 justify-end">
          {confirmDeleteId === row.id ? (
            <>
              <span className="text-xs text-red-600 font-medium mr-1">¿Eliminar?</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
                className="px-2 py-1 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                Sí
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null) }}
                className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                No
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/insurance/documents/${row.id}`) }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                title="Ver detalle"
              >
                <Eye size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigate(`/insurance/documents/${row.id}/edit`) }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                title="Editar"
              >
                <Edit2 size={15} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(row.id) }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Eliminar"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ),
      className: 'w-36',
    },
  ], [navigate, confirmDeleteId, documentTypeLabels])

  const { visibleColumns, columnConfigs, toggle, reorder, reset, applyPreset } = useColumnConfig('documents', ALL_COLUMNS)

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Documentos Contables"
        subtitle="Facturas, endosos, notas de crédito y refacturaciones asociados a pólizas"
        actions={
          <button
            onClick={() => navigate('/insurance/documents/new')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Documento
          </button>
        }
      />

      <MetricGrid cols={4} className="mb-6">
        <KpiCard label="Total Documentos" value={allDocuments.length} description="Todos los tipos de documentos" icon={FileText} variant="default" />
        <KpiCard label="Total Pendiente" value={formatCurrencyCompact(totals.pending, 'ARS')} description={`AR$ ${totals.pending.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`} icon={Clock} variant="warning" />
        <KpiCard label="Total Pagado" value={formatCurrencyCompact(totals.paid, 'ARS')} description={`AR$ ${totals.paid.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`} icon={CheckCircle2} variant="success" />
        <KpiCard label="Pago Parcial" value={partialCount} description="Documentos con pago parcial" icon={AlertCircle} variant="warning" />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por N° de documento…"
            className="w-full sm:w-72"
          />
          <MultiSelectFilter label="Tipo" options={DOCUMENT_TYPE_OPTIONS} value={filterType} onChange={setFilterType} />
          <MultiSelectFilter label="Estado de Pago" options={PAYMENT_STATUS_OPTIONS} value={filterStatus} onChange={setFilterStatus} />
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} de {allDocuments.length} documentos
            </span>
            <ExportPresetsButton
              tableKey="documents"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="documentos"
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
        <DataTable
          columns={visibleColumns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/documents/${row.id}`)}
          emptyTitle="Sin documentos"
          emptyDescription="No se encontraron documentos con los filtros aplicados."
        />
      </SectionCard>
    </PageContent>
  )
}
