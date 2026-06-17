import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, CheckCircle2, Clock, AlertCircle, Eye, Edit2 } from 'lucide-react'
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
import { accountingDocumentRepository } from '../../../services/repositories/accounting-document.repository'
import { DOCUMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS } from '../../../shared/constants'
import type { AccountingDocument, TableColumn } from '../../../shared/types'

const DOCUMENT_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}))

const PAYMENT_STATUS_OPTIONS = Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}))

export default function DocumentsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const allDocuments = accountingDocumentRepository.findAll()
  const totals = accountingDocumentRepository.getTotalByStatus()

  const partialCount = allDocuments.filter((d) => d.paymentStatus === 'parcial').length

  const filtered = useMemo(() => {
    return allDocuments.filter((doc) => {
      const q = search.toLowerCase()
      const matchSearch =
        !search ||
        doc.documentNumber.toLowerCase().includes(q)
      const matchType = !filterType || doc.documentType === filterType
      const matchStatus = !filterStatus || doc.paymentStatus === filterStatus
      return matchSearch && matchType && matchStatus
    })
  }, [allDocuments, search, filterType, filterStatus])

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
          {DOCUMENT_TYPE_LABELS[v as string] ?? String(v)}
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
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/insurance/documents/${row.id}`)
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="Ver detalle"
          >
            <Eye size={15} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/insurance/documents/${row.id}/edit`)
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            title="Editar"
          >
            <Edit2 size={15} />
          </button>
        </div>
      ),
      className: 'w-20',
    },
  ]

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
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/documents/${row.id}`)}
          emptyTitle="Sin documentos"
          emptyDescription="No se encontraron documentos con los filtros aplicados."
        />
      </SectionCard>
    </PageContent>
  )
}
