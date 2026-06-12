import { useParams, useNavigate } from 'react-router-dom'
import {
  FileDown,
  Edit2,
  ShieldCheck,
  FileText,
  Building2,
  User,
  Tag,
  Calendar,
  Hash,
  Link2,
} from 'lucide-react'
import { PageContent } from '../../../shared/components/page-header/PageContent'
import { PageHeader } from '../../../shared/components/page-header/PageHeader'
import { SectionCard } from '../../../shared/components/cards/SectionCard'
import { KpiCard } from '../../../shared/components/cards/KpiCard'
import { DataTable } from '../../../shared/components/data-table/DataTable'
import { StatusPill } from '../../../shared/components/badges/StatusPill'
import { EmptyState } from '../../../shared/components/empty-states/EmptyState'
import {
  formatCurrencyFull,
  formatCurrencyCompact,
  formatDate,
  daysUntil,
} from '../../../shared/utils/format'
import { policyRepository } from '../../../services/repositories/policy.repository'
import { accountingDocumentRepository } from '../../../services/repositories/accounting-document.repository'
import { producerRepository } from '../../../services/repositories/producer.repository'
import { mockCompanies } from '../../../data/mock-companies'
import { mockCostCenters } from '../../../data/mock-cost-centers'
import { mockAssets } from '../../../data/mock-assets'
import { DOCUMENT_TYPE_LABELS } from '../../../shared/constants'
import type { AccountingDocument, ProducerTask, TableColumn } from '../../../shared/types'

export default function PolicyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const policy = policyRepository.findById(id!)

  if (!policy) {
    return (
      <PageContent>
        <EmptyState
          title="Póliza no encontrada"
          description="La póliza solicitada no existe o fue eliminada."
        />
      </PageContent>
    )
  }

  const producer = producerRepository.findById(policy.producerId)
  const company = policy.companyId ? mockCompanies.find((c) => c.id === policy.companyId) : null
  const costCenter = policy.costCenterId
    ? mockCostCenters.find((c) => c.id === policy.costCenterId)
    : null
  const asset = policy.assetId ? mockAssets.find((a) => a.id === policy.assetId) : null

  // Documents linked to this policy via allocations
  const allocations = accountingDocumentRepository.findAllocationsByPolicy(policy.id)
  const documents = allocations
    .map((a) => accountingDocumentRepository.findById(a.accountingDocumentId))
    .filter(Boolean) as AccountingDocument[]

  // Tasks linked to this policy
  const tasks = producerRepository.findTasksByPolicy(policy.id) as ProducerTask[]

  const daysLeft = daysUntil(policy.endDate)
  const isExpired = daysLeft < 0

  // Document columns
  const docColumns: TableColumn<AccountingDocument>[] = [
    {
      key: 'documentNumber',
      label: 'N° Documento',
      className: 'font-mono text-xs text-slate-600',
    },
    {
      key: 'documentType',
      label: 'Tipo',
      render: (v) => DOCUMENT_TYPE_LABELS[v as string] ?? String(v),
    },
    {
      key: 'issueDate',
      label: 'Emisión',
      render: (v) => <span className="text-xs">{formatDate(v as string)}</span>,
    },
    {
      key: 'currency',
      label: 'Moneda',
      render: (v) => <span className="text-xs text-slate-500">{String(v)}</span>,
    },
    {
      key: 'totalAmount',
      label: 'Total',
      render: (v) => (
        <span className="font-semibold tabular-nums">
          {formatCurrencyFull(v as number, 'ARS')}
        </span>
      ),
      headerClassName: 'text-right',
      className: 'text-right',
    },
    {
      key: 'paymentStatus',
      label: 'Pago',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]

  // Task columns
  const taskColumns: TableColumn<ProducerTask>[] = [
    {
      key: 'title',
      label: 'Tarea',
      render: (_, row) => (
        <div>
          <p className="font-medium text-slate-800 text-sm">{row.title}</p>
          <p className="text-xs text-slate-400 truncate max-w-[240px]">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'dueDate',
      label: 'Vencimiento',
      render: (v) => <span className="text-xs">{formatDate(v as string)}</span>,
    },
    {
      key: 'priority',
      label: 'Prioridad',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
    {
      key: 'status',
      label: 'Estado',
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]

  return (
    <PageContent>
      <PageHeader
        title={policy.policyNumber}
        subtitle={`${policy.insuranceCompany} · ${policy.insuranceType} · ${formatDate(policy.startDate)} — ${formatDate(policy.endDate)}${!isExpired ? ` · ${daysLeft === 0 ? 'Vence hoy' : `${daysLeft} días restantes`}` : ''}`}
        category="Póliza"
        backTo="/insurance/policies"
        backLabel="Volver a pólizas"
        badge={<StatusPill status={policy.status} />}
        actions={
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors">
              <FileDown size={15} />
              Exportar PDF
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
              <Edit2 size={15} />
              Editar
            </button>
          </div>
        }
      />

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* Left: Policy detail cards */}
        <div className="lg:col-span-2 space-y-5">

          {/* Datos de la Póliza */}
          <SectionCard title="Datos de la Póliza">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              <InfoRow label="N° Póliza" value={policy.policyNumber} icon={Hash} />
              <InfoRow label="Aseguradora" value={policy.insuranceCompany} icon={Building2} />
              <InfoRow
                label="Productor"
                value={producer?.name ?? '—'}
                icon={User}
              />
              <InfoRow label="Tipo de Seguro" value={policy.insuranceType} icon={Tag} />
              <InfoRow label="Tipo de Cobertura" value={policy.coverageType} />
              <InfoRow label="Estado" value={policy.status} isStatus />
            </div>
          </SectionCard>

          {/* Vigencia */}
          <SectionCard title="Vigencia">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              <InfoRow label="Fecha de Inicio" value={formatDate(policy.startDate)} icon={Calendar} />
              <InfoRow label="Fecha de Vencimiento" value={formatDate(policy.endDate)} icon={Calendar} />
              <InfoRow
                label="Días Restantes"
                value={isExpired ? `Vencida hace ${Math.abs(daysLeft)} días` : daysLeft === 0 ? 'Vence hoy' : `${daysLeft} días`}
              />
            </div>
            {policy.description && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Descripción
                </p>
                <p className="text-sm text-slate-700 leading-relaxed">{policy.description}</p>
              </div>
            )}
          </SectionCard>

          {/* Association: asset or company+costCenter */}
          <SectionCard title="Asociación">
            {asset ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Activo Asegurado
                </p>
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <ShieldCheck size={16} className="text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{asset.name}</p>
                    <p className="text-xs text-slate-500">
                      {asset.internalCode} — {asset.assetType}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/assets/${asset.id}`)}
                    className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Link2 size={12} />
                    Ver activo
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
                <InfoRow
                  label="Empresa"
                  value={company?.name ?? '—'}
                  icon={Building2}
                />
                <InfoRow
                  label="Centro de Costo"
                  value={costCenter ? `${costCenter.code} — ${costCenter.name}` : '—'}
                />
                <InfoRow
                  label="Área"
                  value={costCenter?.area ?? '—'}
                />
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right: Financial KPIs */}
        <div className="space-y-4">
          <KpiCard
            label="Suma Asegurada ARS"
            value={formatCurrencyCompact(policy.insuredAmountArs, 'ARS')}
            description={formatCurrencyFull(policy.insuredAmountArs, 'ARS')}
            variant="info"
          />
          <KpiCard
            label="Tipo de Cambio"
            value={`$ ${policy.exchangeRate.toLocaleString('es-AR')}`}
            description="ARS / USD al momento de alta"
            variant="default"
          />
          <KpiCard
            label="Suma Asegurada USD"
            value={formatCurrencyCompact(policy.insuredAmountUsd, 'USD')}
            description={formatCurrencyFull(policy.insuredAmountUsd, 'USD')}
            variant="success"
          />

          {/* Summary panel */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow label="Documentos asociados" value={String(documents.length)} />
              <SummaryRow label="Tareas vinculadas" value={String(tasks.length)} />
              <SummaryRow
                label="Tareas pendientes"
                value={String(tasks.filter((t) => t.status === 'pendiente' || t.status === 'en_curso').length)}
                color={tasks.some((t) => t.status === 'vencida') ? 'text-red-600' : 'text-slate-800'}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Documents section */}
      <SectionCard
        title="Documentos Contables"
        subtitle={`${documents.length} documento${documents.length !== 1 ? 's' : ''} asociado${documents.length !== 1 ? 's' : ''}`}
        className="mb-5"
        actions={
          <button
            onClick={() => navigate('/insurance/documents/new')}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <FileText size={13} />
            Nuevo documento
          </button>
        }
        noPadding
      >
        <DataTable
          columns={docColumns}
          data={documents}
          rowKey="id"
          onRowClick={(row) => navigate(`/insurance/documents/${row.id}`)}
          emptyTitle="Sin documentos"
          emptyDescription="Esta póliza no tiene documentos contables asociados aún."
        />
      </SectionCard>

      {/* Tasks section */}
      {tasks.length > 0 && (
        <SectionCard
          title="Tareas Asociadas"
          subtitle={`${tasks.length} tarea${tasks.length !== 1 ? 's' : ''} vinculada${tasks.length !== 1 ? 's' : ''} al productor`}
          noPadding
        >
          <DataTable
            columns={taskColumns}
            data={tasks}
            rowKey="id"
            emptyTitle="Sin tareas"
            emptyDescription="No hay tareas vinculadas a esta póliza."
          />
        </SectionCard>
      )}
    </PageContent>
  )
}

// â”€â”€â”€ Helper components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function InfoRow({
  label,
  value,
  icon: Icon,
  isStatus,
}: {
  label: string
  value: string
  icon?: React.ElementType
  isStatus?: boolean
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      {isStatus ? (
        <StatusPill status={value} />
      ) : (
        <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
          {Icon && <Icon size={12} className="text-slate-400 flex-shrink-0" />}
          {value}
        </p>
      )}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  color = 'text-slate-800',
}: {
  label: string
  value: string
  color?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}
