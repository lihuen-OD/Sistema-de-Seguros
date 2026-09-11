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
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PAYMENT_STATUS_LABELS } from '../../../shared/constants'
import { useColumnConfig } from '../../../shared/hooks/useColumnConfig'
import type { AccountingDocument, TableColumn } from '../../../shared/types'

const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// Orden por severidad al ordenar la columna "Estado Pago" — alfabético
// dejaría "NOT_APPLICABLE" antes que "PENDING", que no refleja el ciclo de
// vida real del pago. Mismo orden que PAYMENT_STATUS_LABELS.
const PAYMENT_STATUS_SORT_ORDER: Record<string, number> = {
  PENDING: 0,
  PARTIALLY_PAID: 1,
  PAID: 2,
  OVERDUE: 3,
  NOT_APPLICABLE: 4,
}
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

  const { data: result, isLoading, isFetching, isError } = useQuery(documentQueries.listPaginated({
    page,
    limit,
    search: search.trim() || undefined,
    documentType: filterType || undefined,
    paymentStatus: filterStatus || undefined,
  }))
  const allDocuments = useMemo(() => result?.data ?? [], [result?.data])
  const pagination = result?.pagination
  const { data: documentTypesData } = useQuery(documentQueries.types())
  const documentTypes = documentTypesData?.types ?? []
  const documentTypeLabels = useMemo(
    () => Object.fromEntries(documentTypes.map((t) => [t.key, t.label])),
    [documentTypes],
  )

  const DOCUMENT_TYPE_OPTIONS = documentTypes.map((t) => ({ value: t.key, label: t.label }))

  // Cuotas de todos los documentos listados — necesarias para que "Total
  // Pendiente"/"Total Pagado" reflejen la porción real de cada documento con
  // pago parcial (antes solo miraba el estado del documento completo, así que
  // un documento "Pago Parcial" no aportaba nada a ninguno de los dos totales).
  const documentIds = useMemo(() => allDocuments.map((d) => d.id), [allDocuments])
  const { data: allInstallments = [], isLoading: isLoadingInstallments } = useQuery({
    queryKey: [...documentKeys.all, 'installments-bulk', documentIds],
    queryFn: () => documentsApi.findInstallmentsBulk(documentIds),
    enabled: documentIds.length > 0,
  })
  // Mientras allDocuments ya resolvió pero las cuotas todavía no, "totals" no
  // puede confiar en qué documentos tienen cuotas propias — sin este flag, las
  // KPI mostrarían primero un total aproximado (sin cuotas) y un instante
  // después el total real, un salto visible y engañoso en vez de un loading.
  const totalsReady = documentIds.length === 0 || !isLoadingInstallments

  const totals = useMemo(() => {
    let pendingArs = 0, pendingUsd = 0, paidArs = 0, paidUsd = 0
    const installmentsByDoc = new Map<string, typeof allInstallments>()
    allInstallments.forEach((inst) => {
      const list = installmentsByDoc.get(inst.accountingDocumentId) ?? []
      list.push(inst)
      installmentsByDoc.set(inst.accountingDocumentId, list)
    })

    allDocuments.forEach((doc) => {
      const docInstallments = installmentsByDoc.get(doc.id)
      if (docInstallments && docInstallments.length > 0) {
        // Cuota por cuota — así un documento "Pago Parcial" solo aporta al
        // total pendiente lo que realmente falta pagar, y al pagado lo que ya
        // se pagó (nunca el total completo del documento en uno solo).
        docInstallments.forEach((inst) => {
          if (inst.paymentStatus === 'PAID') {
            paidArs += inst.amountArs ?? 0
            paidUsd += inst.amountUsd ?? 0
          } else {
            pendingArs += inst.amountArs ?? 0
            pendingUsd += inst.amountUsd ?? 0
          }
        })
      } else {
        // Documentos sin cuotas propias (ej. Endoso) — se usa el estado de
        // pago del documento completo. NOT_APPLICABLE no cuenta en ninguno.
        if (doc.paymentStatus === 'PAID') {
          paidArs += doc.totalAmountArs ?? 0
          paidUsd += doc.totalAmountUsd ?? 0
        } else if (doc.paymentStatus !== 'NOT_APPLICABLE') {
          pendingArs += doc.totalAmountArs ?? 0
          pendingUsd += doc.totalAmountUsd ?? 0
        }
      }
    })

    return { pendingArs, pendingUsd, paidArs, paidUsd }
  }, [allDocuments, allInstallments])

  const partialCount = allDocuments.filter((d) => d.paymentStatus === 'PARTIALLY_PAID').length

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
      sortValue: (row) => documentTypeLabels[row.documentType] ?? row.documentType,
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
      sortable: true,
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
      sortable: true,
      sortValue: (row) => PAYMENT_STATUS_SORT_ORDER[row.paymentStatus] ?? 99,
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
        <KpiCard label="Total Pendiente" value={totalsReady ? formatCurrencyCompact(totals.pendingArs, 'ARS') : '—'} description={totalsReady ? `${formatCurrencyCompact(totals.pendingUsd, 'USD')} · esta página` : 'Calculando…'} icon={Clock} variant="warning" />
        <KpiCard label="Total Pagado" value={totalsReady ? formatCurrencyCompact(totals.paidArs, 'ARS') : '—'} description={totalsReady ? `${formatCurrencyCompact(totals.paidUsd, 'USD')} · esta página` : 'Calculando…'} icon={CheckCircle2} variant="success" />
        <KpiCard label="Pago Parcial" value={partialCount} description="En esta página" icon={AlertCircle} variant="warning" />
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
            <span className="text-[11px] text-slate-400">Ordena y exporta la página actual</span>
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
