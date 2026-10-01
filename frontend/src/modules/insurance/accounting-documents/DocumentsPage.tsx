import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, CheckCircle2, Clock, AlertCircle, Eye, Edit2, Trash2 } from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { PaginationControls } from '../../../shared/components/data-table/PaginationControls'
import { ColumnConfigButton } from '../../../shared/components/data-table/ColumnConfigButton'
import { ExportPresetsButton } from '../../../shared/components/data-table/ExportPresetsButton'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { documentsApi, documentKeys, documentQueries } from '../../../shared/api/documents.api'
import { toSortParams } from '../../../shared/api/pagination'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PAYMENT_STATUS_LABELS } from '../../../shared/constants'
import { useColumnConfig } from '../../../shared/hooks/useColumnConfig'
import type { AccountingDocument, SortState, TableColumn } from '../../../shared/types'

const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const DEFAULT_PAGE_SIZE = 20

export default function DocumentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE)
  const [sort, setSort] = useState<SortState | null>(null)

  const { data: result, isLoading, isFetching, isError } = useQuery(documentQueries.listPaginated({
    page,
    limit,
    search: search.trim() || undefined,
    documentType: filterType || undefined,
    paymentStatus: filterStatus || undefined,
    ...toSortParams(sort),
    includeSummary: true,
  }))
  const allDocuments = useMemo(() => result?.data ?? [], [result?.data])
  const pagination = result?.pagination
  // Pendiente/pagado/parcial sobre todo el resultado filtrado (backend, ver
  // documentsService.summarize): por cuota si el documento tiene cuotas, sin
  // anulados, e ignorando solo el filtro de estado de pago.
  const summary = result?.summary
  const summaryHint = isFetching ? 'Calculando…' : 'No disponible'
  const { data: documentTypesData } = useQuery(documentQueries.types())
  const documentTypes = documentTypesData?.types ?? []
  const documentTypeLabels = useMemo(
    () => Object.fromEntries(documentTypes.map((t) => [t.key, t.label])),
    [documentTypes],
  )

  const DOCUMENT_TYPE_OPTIONS = documentTypes.map((t) => ({ value: t.key, label: t.label }))


  const filtered = allDocuments

  // useMutation (en vez de un async function suelto) para tener isPending y
  // poder bloquear los botones de "Eliminar" mientras hay un borrado en
  // curso — sin esto, confirmar "Sí" en varias filas seguidas disparaba
  // varios DELETE en paralelo sin ningún freno.
  const deleteMutation = useMutation({
    mutationFn: (id: string) => documentsApi.softDelete(id),
    onSuccess: () => {
      // exact:true: solo la query del listado (este doc desaparece de acá),
      // no el detail/balance/installments/attachments de otros documentos.
      queryClient.invalidateQueries({ queryKey: documentKeys.all, exact: true })
      queryClient.invalidateQueries({ queryKey: [...documentKeys.all, 'paginated'] })
      setConfirmDeleteId(null)
    },
  })

  function handleDelete(id: string) {
    deleteMutation.mutate(id)
  }

  const ALL_COLUMNS: TableColumn<AccountingDocument>[] = useMemo(() => [
    {
      id: 'documentNumber',
      key: 'documentNumber',
      label: 'N° Documento',
      defaultVisible: true,
      sortable: true,
      className: 'font-mono text-xs text-slate-600 min-w-[160px]',
    },
    {
      id: 'documentType',
      key: 'documentType',
      label: 'Tipo',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-slate-700 font-medium text-xs">{documentTypeLabels[v as string] ?? String(v)}</span>,
    },
    {
      id: 'issueDate',
      key: 'issueDate',
      label: 'Fecha Emisión',
      defaultVisible: true,
      sortable: true,
      render: (v) => <span className="text-xs text-slate-500">{formatDate(v as string)}</span>,
    },
    {
      id: 'currency',
      key: 'currency',
      label: 'Moneda',
      defaultVisible: true,
      sortable: true,
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
      sortable: true,
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
      sortable: true,
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
      sortable: true,
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
      sortable: true,
      render: (v) => <span className="text-sm text-slate-700">{(v as string) || '—'}</span>,
    },
    {
      id: 'paymentMethod',
      key: 'paymentMethod',
      label: 'Método de pago',
      defaultVisible: false,
      sortable: true,
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
      sortable: true,
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
      sortable: true,
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
      sortable: true,
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
                disabled={deleteMutation.isPending}
                className="px-2 py-1 rounded-lg text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
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
                disabled={deleteMutation.isPending}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
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
  ], [navigate, confirmDeleteId, documentTypeLabels, deleteMutation.isPending])

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
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus size={16} />
            Nuevo Documento
          </button>
        }
      />

      <MetricGrid cols={4} className="mb-6">
        <KpiCard label="Total Documentos" value={pagination?.total ?? 0} description="Resultados del listado" icon={FileText} variant="default" />
        <KpiCard label="Total Pendiente" value={summary ? formatCurrencyCompact(summary.pendingArs, 'ARS') : '—'} description={summary ? `${formatCurrencyCompact(summary.pendingUsd, 'USD')} · sin anulados` : summaryHint} icon={Clock} variant="warning" />
        <KpiCard label="Total Pagado" value={summary ? formatCurrencyCompact(summary.paidArs, 'ARS') : '—'} description={summary ? `${formatCurrencyCompact(summary.paidUsd, 'USD')} · sin anulados` : summaryHint} icon={CheckCircle2} variant="success" />
        <KpiCard label="Pago Parcial" value={summary ? summary.countByPaymentStatus.PARTIALLY_PAID ?? 0 : '—'} description={summary ? 'Documentos con pago parcial' : summaryHint} icon={AlertCircle} variant="warning" />
      </MetricGrid>

      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(value) => { setPage(1); setSearch(value) }}
            placeholder="Buscar por N° de documento…"
            className="w-full sm:w-72"
          />
          <FilterBar filters={[
            {
              key: 'type', label: 'Tipo', options: DOCUMENT_TYPE_OPTIONS, value: filterType,
              onChange: (value) => { setPage(1); setFilterType(value) },
            },
            {
              key: 'payment-status', label: 'Estado de Pago', options: PAYMENT_STATUS_OPTIONS, value: filterStatus,
              onChange: (value) => { setPage(1); setFilterStatus(value) },
            },
          ]} />
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {filtered.length} visibles en esta página · {pagination?.total ?? 0} resultados
            </span>
            <ExportPresetsButton
              tableKey="documents"
              allColumns={ALL_COLUMNS}
              visibleColumns={visibleColumns}
              filteredRows={filtered}
              filenamePrefix="documentos"
              onApplyPreset={applyPreset}
            />
            <span className="text-[11px] text-slate-400">Exporta la página actual</span>
            <ColumnConfigButton
              columnConfigs={columnConfigs}
              onToggle={toggle}
              onReorder={reorder}
              onReset={reset}
            />
          </div>
        </div>
        <DataTable
          tableKey="documents"
          columns={visibleColumns}
          data={filtered}
          loading={isLoading}
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/documents/${row.id}`)}
          emptyTitle="Sin documentos"
          emptyDescription="No se encontraron documentos con los filtros aplicados."
          sort={sort}
          onSortChange={(next) => { setPage(1); setSort(next) }}
        />
        {pagination && (
          <PaginationControls
            {...pagination}
            isLoading={isFetching}
            onPageChange={setPage}
            onLimitChange={(nextLimit) => {
              setPage(1)
              setLimit(nextLimit)
            }}
          />
        )}
      </SectionCard>
    </PageContent>
  )
}
