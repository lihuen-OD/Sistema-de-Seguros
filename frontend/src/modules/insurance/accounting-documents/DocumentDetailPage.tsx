import { useParams, useNavigate } from 'react-router-dom'
import {
  FileDown,
  Hash,
  Calendar,
  DollarSign,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { accountingDocumentRepository } from '../../../services/repositories/accounting-document.repository'
import { policyRepository } from '../../../services/repositories/policy.repository'
import { DOCUMENT_TYPE_LABELS, PAYMENT_STATUS_LABELS } from '../../../shared/constants'
import type { DocumentPolicyAllocation, Installment, TableColumn } from '../../../shared/types'

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const doc = accountingDocumentRepository.findById(id!)

  if (!doc) {
    return (
      <PageContent>
        <EmptyState
          title="Documento no encontrado"
          description="El documento solicitado no existe o fue eliminado."
        />
      </PageContent>
    )
  }

  const allocations = accountingDocumentRepository.findAllocationsByDocument(doc.id)
  const installments = accountingDocumentRepository.findInstallmentsByDocument(doc.id)

  const computedTotal = doc.netAmount + doc.vatAmount + doc.otherTaxesAmount

  const paidCount = installments.filter((i) => i.paymentStatus === 'pagado').length
  const pendingCount = installments.filter((i) => i.paymentStatus === 'pendiente').length
  const partialCount = installments.filter((i) => i.paymentStatus === 'parcial').length

  // Allocation columns
  const allocationColumns: TableColumn<DocumentPolicyAllocation>[] = [
    {
      key: 'policyId',
      label: 'N° Póliza',
      render: (v) => {
        const policy = policyRepository.findById(v as string)
        return (
          <span className="font-mono text-xs text-slate-600">
            {policy?.policyNumber ?? (v as string)}
          </span>
        )
      },
    },
    {
      key: 'policyId',
      label: 'Aseguradora',
      render: (v) => {
        const policy = policyRepository.findById(v as string)
        return (
          <span className="text-xs text-slate-600">{policy?.insuranceCompany ?? '—'}</span>
        )
      },
    },
    {
      key: 'allocatedAmount',
      label: 'Importe Asignado',
      render: (v) => (
        <span className="tabular-nums font-semibold text-slate-800 text-sm">
          {formatCurrencyFull(v as number, doc.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'allocationPercentage',
      label: 'Participación',
      render: (v) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${Math.min(Math.abs(v as number), 100)}%` }}
            />
          </div>
          <span className="tabular-nums text-xs font-semibold text-blue-700 w-12 text-right">
            {(v as number).toFixed(1).replace('.', ',')}%
          </span>
        </div>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
  ]

  // Installment columns
  const installmentColumns: TableColumn<Installment>[] = [
    {
      key: 'installmentNumber',
      label: 'N°',
      render: (v) => (
        <span className="text-xs font-semibold text-slate-500 tabular-nums">
          {String(v).padStart(2, '0')}
        </span>
      ),
      className: 'w-12',
    },
    {
      key: 'dueDate',
      label: 'Vencimiento',
      render: (v) => (
        <span className="text-xs text-slate-600">{formatDate(v as string)}</span>
      ),
    },
    {
      key: 'amount',
      label: 'Importe',
      render: (v, row) => (
        <span className="tabular-nums font-semibold text-slate-800 text-sm">
          {formatCurrencyFull(v as number, row.currency)}
        </span>
      ),
      className: 'text-right',
      headerClassName: 'text-right',
    },
    {
      key: 'paymentStatus',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'paidAt',
      label: 'Fecha Pago',
      render: (v) => (
        <span className="text-xs text-slate-400">{formatDate(v as string | null)}</span>
      ),
    },
  ]

  return (
    <PageContent>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/insurance/documents')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 transition-colors"
        >
          ← Volver a documentos
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900 font-mono">
                {doc.documentNumber}
              </h1>
              <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
                {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>
              <StatusPill status={doc.paymentStatus} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Calendar size={11} /> Emisión: {formatDate(doc.issueDate)}
              </span>
              <span className="flex items-center gap-1">
                <Hash size={11} /> Moneda: {doc.currency}
              </span>
              {doc.currency === 'USD' && (
                <span className="flex items-center gap-1 text-amber-600 font-medium">
                  <DollarSign size={11} /> TC: ${doc.exchangeRate.toLocaleString('es-AR')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
              <FileDown size={15} />
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      {/* KPI row: amounts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Neto</p>
          <p className="text-base font-bold text-slate-900 tabular-nums truncate">
            {formatCurrencyCompact(doc.netAmount, doc.currency)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(doc.netAmount, doc.currency)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">IVA</p>
          <p className="text-base font-bold text-slate-900 tabular-nums truncate">
            {formatCurrencyCompact(doc.vatAmount, doc.currency)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(doc.vatAmount, doc.currency)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Otros Imp.</p>
          <p className="text-base font-bold text-slate-900 tabular-nums truncate">
            {formatCurrencyCompact(doc.otherTaxesAmount, doc.currency)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(doc.otherTaxesAmount, doc.currency)}
          </p>
        </div>
        <div className="card p-4 border-blue-200 bg-blue-50/30">
          <p className="text-xs font-medium text-blue-500 uppercase tracking-wider mb-1">Total</p>
          <p className="text-lg font-extrabold text-blue-700 tabular-nums truncate">
            {formatCurrencyCompact(computedTotal, doc.currency)}
          </p>
          <p className="text-xs text-blue-400 mt-0.5 tabular-nums">
            {formatCurrencyFull(computedTotal, doc.currency)}
          </p>
        </div>
      </div>

      {/* Formula note */}
      <div className="mb-5 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg inline-flex items-center gap-2 text-xs text-slate-500">
        <Receipt size={13} className="text-slate-400 flex-shrink-0" />
        <span>
          <strong className="text-slate-700">Total</strong> = Neto + IVA + Otros Impuestos
          &nbsp;=&nbsp;
          {formatCurrencyFull(doc.netAmount, doc.currency)}
          &nbsp;+&nbsp;
          {formatCurrencyFull(doc.vatAmount, doc.currency)}
          &nbsp;+&nbsp;
          {formatCurrencyFull(doc.otherTaxesAmount, doc.currency)}
          &nbsp;=&nbsp;
          <strong className="text-slate-800">{formatCurrencyFull(computedTotal, doc.currency)}</strong>
        </span>
      </div>

      {/* Payment summary pills */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700 font-medium">
          <CheckCircle2 size={13} />
          {paidCount} cuota{paidCount !== 1 ? 's' : ''} pagada{paidCount !== 1 ? 's' : ''}
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-700 font-medium">
          <Clock size={13} />
          {pendingCount} cuota{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
        </div>
        {partialCount > 0 && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
            <AlertCircle size={13} />
            {partialCount} cuota{partialCount !== 1 ? 's' : ''} parcial{partialCount !== 1 ? 'es' : ''}
          </div>
        )}
        <span className="text-xs text-slate-400 ml-auto">
          {installments.length} cuota{installments.length !== 1 ? 's' : ''} en total
        </span>
      </div>

      {/* 2-column: Allocations + Installments */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* LEFT: Policies */}
        <SectionCard
          title="Pólizas Asociadas"
          subtitle={`${allocations.length} póliza${allocations.length !== 1 ? 's' : ''} vinculada${allocations.length !== 1 ? 's' : ''}`}
          noPadding
        >
          <DataTable
            columns={allocationColumns}
            data={allocations}
            rowKey="id"
            emptyTitle="Sin pólizas"
            emptyDescription="Este documento no tiene pólizas asociadas."
          />
        </SectionCard>

        {/* RIGHT: Installments */}
        <SectionCard
          title="Cuotas"
          subtitle={`${installments.length} cuota${installments.length !== 1 ? 's' : ''} registrada${installments.length !== 1 ? 's' : ''}`}
          noPadding
          actions={
            installments.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <KpiCard
                  label=""
                  value={formatCurrencyCompact(
                    installments.filter((i) => i.paymentStatus === 'pagado').reduce((s, i) => s + i.amount, 0),
                    doc.currency,
                  )}
                  description="pagado"
                  variant="success"
                  className="!p-2 !gap-1 min-w-[80px] border-0 bg-emerald-50"
                />
              </div>
            ) : undefined
          }
        >
          <DataTable
            columns={installmentColumns}
            data={installments}
            rowKey="id"
            emptyTitle="Sin cuotas"
            emptyDescription="Este documento no tiene cuotas registradas."
          />
        </SectionCard>
      </div>
    </PageContent>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}

// Suppress unused warning — InfoField is available for future use inside this module
void InfoField
