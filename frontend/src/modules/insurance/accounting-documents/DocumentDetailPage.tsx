import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileDown,
  Edit2,
  Trash2,
  Receipt,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import { InstallmentRow } from '../../../shared/components/installments/InstallmentRow'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
} from '../../../shared/utils/format'
import { accountingDocumentRepository } from '../../../services/repositories/accounting-document.repository'
import { policyRepository } from '../../../services/repositories/policy.repository'
import { DOCUMENT_TYPE_LABELS } from '../../../shared/constants'
import { ROUTES } from '../../../app/routes'
import { DocumentAttachmentsSection } from './DocumentAttachmentsSection'
import { accountingDocumentAttachmentRepository } from '../../../services/repositories/accounting-document-attachment.repository'
import type { DocumentPolicyAllocation, Installment, InstallmentUpdate, TableColumn } from '../../../shared/types'

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const doc = accountingDocumentRepository.findById(id!)

  const [installments, setInstallments] = useState<Installment[]>(() =>
    doc ? accountingDocumentRepository.findInstallmentsByDocument(doc.id) : []
  )

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

  const today = new Date().toISOString().slice(0, 10)
  const allocations = accountingDocumentRepository.findAllocationsByDocument(doc.id)
  const computedTotal = doc.netAmount + doc.vatAmount + doc.otherTaxesAmount

  const paidCount = installments.filter((i) => i.paymentStatus === 'pagado').length
  const pendingCount = installments.filter((i) => i.paymentStatus === 'pendiente').length
  const partialCount = installments.filter((i) => i.paymentStatus === 'parcial').length

  const saldo = installments
    .filter((i) => i.paymentStatus !== 'pagado')
    .reduce((sum, i) => sum + Math.abs(i.amount), 0)

  const derivedDocStatus: string =
    installments.length > 0 && installments.every((i) => i.paymentStatus === 'pagado')
      ? 'pagado'
      : installments.some((i) => i.paymentStatus === 'pagado' || i.paymentStatus === 'parcial')
        ? 'parcial'
        : doc.paymentStatus

  function handleInstallmentUpdate(instId: string, updates: InstallmentUpdate) {
    accountingDocumentRepository.updateInstallment(instId, updates)
    setInstallments((prev) =>
      prev.map((i) => (i.id === instId ? { ...i, ...updates } : i))
    )
  }

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
        return <span className="text-xs text-slate-600">{policy?.insuranceCompany ?? '—'}</span>
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

  return (
    <PageContent>
      <PageHeader
        title={doc.documentNumber}
        subtitle={`Emisión: ${formatDate(doc.issueDate)} · Moneda: ${doc.currency}${doc.currency === 'USD' ? ` · TC: $${doc.exchangeRate.toLocaleString('es-AR')}` : ''}`}
        category="Documento"
        backTo="/insurance/documents"
        backLabel="Volver a documentos"
        badge={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full border border-slate-200">
              {DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType}
            </span>
            <StatusPill status={derivedDocStatus} />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(ROUTES.DOCUMENTS_EDIT(doc.id))}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Edit2 size={15} />
              Editar
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors">
              <FileDown size={15} />
              Exportar PDF
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 bg-red-50">
                <span className="text-xs font-medium text-red-700">¿Eliminar documento?</span>
                <button
                  onClick={() => {
                    accountingDocumentRepository.delete(doc.id)
                    navigate('/insurance/documents')
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  Sí, eliminar
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-white rounded-md transition-colors"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors"
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            )}
          </div>
        }
      />

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
            {partialCount} cuota{partialCount !== 1 ? 'es' : ''}  parcial{partialCount !== 1 ? 'es' : ''}
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
        >
          {installments.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <p className="text-sm text-slate-400">Sin cuotas registradas</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {installments.map((inst) => (
                <InstallmentRow
                  key={inst.id}
                  inst={inst}
                  currency={doc.currency}
                  today={today}
                  onUpdate={(updates) => handleInstallmentUpdate(inst.id, updates)}
                />
              ))}
              {/* Footer: saldo */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-200">
                <span className="text-xs font-medium text-slate-500">
                  {saldo > 0 ? 'Saldo pendiente' : 'Estado'}
                </span>
                {saldo > 0 ? (
                  <span className="text-sm font-bold text-amber-700 tabular-nums">
                    {doc.currency} {saldo.toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <CheckCircle2 size={12} />
                    Todo pagado
                  </span>
                )}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Adjuntos */}
      <SectionCard
        title="Archivos Adjuntos"
        subtitle={`${accountingDocumentAttachmentRepository.findByDocument(doc.id).length} archivo${accountingDocumentAttachmentRepository.findByDocument(doc.id).length !== 1 ? 's' : ''} adjunto${accountingDocumentAttachmentRepository.findByDocument(doc.id).length !== 1 ? 's' : ''}`}
        noPadding
      >
        <DocumentAttachmentsSection documentId={doc.id} />
      </SectionCard>
    </PageContent>
  )
}
