import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, CheckCircle2, Clock, AlertCircle, Eye, Edit2, Trash2, Download } from 'lucide-react'
import { downloadCSV } from '../../../shared/utils/export'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { MetricGrid } from '../../../shared/components/cards/MetricGrid'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { FilterBar } from '../../../shared/components/filters/FilterBar'
import { SearchInput } from '../../../shared/components/filters/SearchInput'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { documentsApi } from '../../../shared/api/documents.api'
import { catalogsApi } from '../../../shared/api/catalogs.api'
import { ErrorState } from '../../../shared/components/empty-states/ErrorState'
import { PAYMENT_STATUS_LABELS } from '../../../shared/constants'
import type { AccountingDocument, TableColumn } from '../../../shared/types'

const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export default function DocumentsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const { data: allDocuments = [], isLoading, isError } = useQuery({ queryKey: ['documents'], queryFn: documentsApi.findAll })
  const { data: documentTypeItems = [] } = useQuery({ queryKey: ['catalogs', 'document_type'], queryFn: () => catalogsApi.findByCategory('document_type') })

  const DOCUMENT_TYPE_OPTIONS = documentTypeItems.map((t) => ({ value: t.label, label: t.label }))

  const totals = useMemo(() => ({
    pending: allDocuments.filter((d) => d.paymentStatus === 'pendiente').reduce((s, d) => s + d.totalAmount, 0),
    paid: allDocuments.filter((d) => d.paymentStatus === 'pagado').reduce((s, d) => s + d.totalAmount, 0),
  }), [allDocuments])

  const partialCount = allDocuments.filter((d) => d.paymentStatus === 'parcial').length

  const filtered = useMemo(() => {
    return allDocuments.filter((doc) => {
      const q = search.toLowerCase()
      const matchSearch = !search || doc.documentNumber.toLowerCase().includes(q)
      const matchType = !filterType || doc.documentType === filterType
      const matchStatus = !filterStatus || doc.paymentStatus === filterStatus
      return matchSearch && matchType && matchStatus
    })
  }, [allDocuments, search, filterType, filterStatus])

  async function handleDelete(id: string) {
    await documentsApi.softDelete(id)
    queryClient.invalidateQueries({ queryKey: ['documents'] })
    setConfirmDeleteId(null)
  }

  const columns: TableColumn<AccountingDocument>[] = [
    {
      key: 'documentNumber',
      label: 'N° Documento',
      className: 'font-mono text-xs text-slate-600 min-w-[160px]',
    },
    {
      key: 'documentType',
      label: 'Tipo',
      render: (v) => (
        <span className="text-slate-700 font-medium text-xs">
          {String(v)}
        </span>
      ),
    },
    {
      key: 'issueDate',
      label: 'Fecha Emisión',
      render: (v) => (
        <span className="text-xs text-slate-500">{formatDate(v as string)}</span>
      ),
    },
    {
      key: 'currency',
      label: 'Moneda',
      render: (v) => (
        <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
          {String(v)}
        </span>
      ),
      className: 'w-20',
    },
    {
      key: 'netAmount',
      label: 'Neto',
      render: (v, row) => (
        <span className="tabular-nums text-xs text-slate-600">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'vatAmount',
      label: 'IVA',
      render: (v, row) => (
        <span className="tabular-nums text-xs text-slate-600">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (v, row) => (
        <span className="tabular-nums text-sm font-semibold text-slate-800">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'paymentStatus',
      label: 'Estado Pago',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'id',
      label: '',
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
  ]

  if (isError) return <PageContent><ErrorState /></PageContent>

  return (
    <PageContent>
      <PageHeader
        title="Documentos Contables"
        subtitle="Facturas, endosos, notas de crédito y refacturaciones asociados a pólizas"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const rows = [
                  ['N° Documento', 'Tipo', 'Fecha Emisión', 'Moneda', 'Neto', 'IVA', 'Otros Imp.', 'Total', 'Aseguradora', 'Estado Pago'],
                  ...filtered.map((d) => [
                    d.documentNumber,
                    d.documentType,
                    d.issueDate,
                    d.currency,
                    String(d.netAmount),
                    String(d.vatAmount),
                    String(d.otherTaxesAmount),
                    String(d.totalAmount),
                    d.insuranceCompany ?? '',
                    d.paymentStatus,
                  ]),
                ]
                downloadCSV(rows, `documentos-${new Date().toISOString().slice(0, 10)}.csv`)
              }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors"
            >
              <Download size={15} />
              Exportar CSV
            </button>
            <button
              onClick={() => navigate('/insurance/documents/new')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={16} />
              Nuevo Documento
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <MetricGrid cols={4} className="mb-6">
        <KpiCard
          label="Total Documentos"
          value={allDocuments.length}
          description="Todos los tipos de documentos"
          icon={FileText}
          variant="default"
        />
        <KpiCard
          label="Total Pendiente"
          value={formatCurrencyCompact(totals.pending, 'ARS')}
          description={`AR$ ${totals.pending.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`}
          icon={Clock}
          variant="warning"
        />
        <KpiCard
          label="Total Pagado"
          value={formatCurrencyCompact(totals.paid, 'ARS')}
          description={`AR$ ${totals.paid.toLocaleString('es-AR', { minimumFractionDigits: 0 })}`}
          icon={CheckCircle2}
          variant="success"
        />
        <KpiCard
          label="Pago Parcial"
          value={partialCount}
          description="Documentos con pago parcial"
          icon={AlertCircle}
          variant="warning"
        />
      </MetricGrid>

      {/* Filters + Table */}
      <SectionCard noPadding>
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Buscar por N° de documento…"
            className="w-full sm:w-72"
          />
          <FilterBar
            filters={[
              {
                key: 'type',
                label: 'Tipo',
                options: DOCUMENT_TYPE_OPTIONS,
                value: filterType,
                onChange: setFilterType,
              },
              {
                key: 'status',
                label: 'Estado de Pago',
                options: PAYMENT_STATUS_OPTIONS,
                value: filterStatus,
                onChange: setFilterStatus,
              },
            ]}
          />
          <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
            {filtered.length} de {allDocuments.length} documentos
          </span>
        </div>
        <DataTable
          columns={columns}
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
