import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileDown, Edit2, ShieldCheck, FileText, Flame, Paperclip,
  MapPin, Building2, Calendar, Hash, Tag,
} from 'lucide-react'
import { AssetPhotoGallery } from '../../shared/components/photos/AssetPhotoGallery'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { MetricGrid } from '../../shared/components/cards/MetricGrid'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { assetRepository } from '../../services/repositories/asset.repository'
import { policyRepository } from '../../services/repositories/policy.repository'
import { accountingDocumentRepository } from '../../services/repositories/accounting-document.repository'
import { fireExtinguisherRepository } from '../../services/repositories/fire-extinguisher.repository'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import { ASSET_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '../../shared/constants'
import type { Policy, AccountingDocument, FireExtinguisher, TableColumn } from '../../shared/types'

const TABS = ['Pólizas', 'Documentos', 'Matafuegos', 'Adjuntos'] as const
type Tab = (typeof TABS)[number]

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('Pólizas')
  // Lazy initializer reads asset photos once on mount
  const [photos, setPhotos] = useState<string[]>(() => assetRepository.findById(id!)?.photos ?? [])

  const asset = assetRepository.findById(id!)

  if (!asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  const company = mockCompanies.find((c) => c.id === asset.companyId)
  const costCenter = mockCostCenters.find((c) => c.id === asset.costCenterId)
  const policies = policyRepository.findByAsset(asset.id)
  const fireExtinguishers = fireExtinguisherRepository.findByAsset(asset.id)

  // Documents linked through policy allocations
  const policyIds = policies.map((p) => p.id)
  const allAllocations = policyIds.flatMap((pid) =>
    accountingDocumentRepository.findAllocationsByPolicy(pid),
  )
  const documentIds = [...new Set(allAllocations.map((a) => a.accountingDocumentId))]
  const documents = documentIds
    .map((did) => accountingDocumentRepository.findById(did))
    .filter(Boolean) as AccountingDocument[]

  // Financial KPIs
  const totalInsuredArs = policies
    .filter((p) => p.status === 'vigente')
    .reduce((s, p) => s + p.insuredAmountArs, 0)
  const totalInsuredUsd = policies
    .filter((p) => p.status === 'vigente')
    .reduce((s, p) => s + p.insuredAmountUsd, 0)
  const diffUsd = asset.patrimonialValueUsd - totalInsuredUsd

  // Policy columns
  const policyColumns: TableColumn<Policy>[] = [
    { key: 'policyNumber', label: 'N° Póliza', className: 'font-mono text-slate-600 text-xs' },
    { key: 'insuranceCompany', label: 'Aseguradora' },
    { key: 'insuranceType', label: 'Tipo' },
    { key: 'coverageType', label: 'Cobertura', render: (v) => <span className="text-xs text-slate-500">{String(v)}</span> },
    { key: 'startDate', label: 'Inicio', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'endDate', label: 'Vence', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'insuredAmountArs', label: 'Suma Aseg.', render: (v) => <span className="font-semibold">{formatCurrencyCompact(v as number, 'ARS')}</span>, headerClassName: 'text-right', className: 'text-right' },
    { key: 'status', label: 'Estado', render: (v) => <StatusPill status={v as string} size="sm" /> },
  ]

  // Document columns
  const docColumns: TableColumn<AccountingDocument>[] = [
    { key: 'documentNumber', label: 'N° Documento', className: 'font-mono text-xs text-slate-600' },
    { key: 'documentType', label: 'Tipo', render: (v) => DOCUMENT_TYPE_LABELS[v as string] ?? String(v) },
    { key: 'issueDate', label: 'Emisión', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'totalAmount', label: 'Total', render: (v) => <span className="font-semibold">{formatCurrencyFull(v as number, 'ARS')}</span>, headerClassName: 'text-right', className: 'text-right' },
    { key: 'paymentStatus', label: 'Estado', render: (v) => <StatusPill status={v as string} size="sm" /> },
  ]

  // Fire ext columns
  const feColumns: TableColumn<FireExtinguisher>[] = [
    { key: 'code', label: 'Código', className: 'font-mono text-xs text-slate-600' },
    { key: 'type', label: 'Tipo' },
    { key: 'capacity', label: 'Cap.' },
    { key: 'chargeDate', label: 'Carga', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'expirationDate', label: 'Vencimiento', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'status', label: 'Estado', render: (v) => <StatusPill status={v as string} size="sm" /> },
  ]

  return (
    <PageContent>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/assets')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3 transition-colors group"
        >
          ← Volver al inventario
        </button>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-slate-900">{asset.name}</h1>
              <StatusPill status={asset.status} />
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1"><Hash size={11} /> {asset.internalCode}</span>
              <span className="flex items-center gap-1"><Tag size={11} /> {asset.assetType}</span>
              {asset.year > 0 && <span className="flex items-center gap-1"><Calendar size={11} /> {asset.year}</span>}
              {asset.brand && <span>{asset.brand} {asset.model}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
              <FileDown size={15} />
              Ficha PDF
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              <Edit2 size={15} />
              Editar
            </button>
          </div>
        </div>
      </div>

      {/* Main content: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* Left col: Ficha + Imputación */}
        <div className="lg:col-span-2 space-y-5">
          {/* Ficha patrimonial */}
          <SectionCard title="Ficha Patrimonial">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              <InfoRow label="Código interno" value={asset.internalCode} />
              <InfoRow label="Tipo" value={asset.assetType} />
              <InfoRow label="Año" value={asset.year > 0 ? String(asset.year) : '—'} />
              <InfoRow label="Marca" value={asset.brand || '—'} />
              <InfoRow label="Modelo" value={asset.model || '—'} />
              <InfoRow label="N° de Serie" value={asset.serialNumber || '—'} />
              <InfoRow label="Cod. Bien de Uso" value={asset.fixedAssetCode || '—'} />
              <InfoRow label="Fecha Valuación" value={formatDate(asset.valuationDate)} />
              <InfoRow label="Estado" value={ASSET_STATUS_LABELS[asset.status]} />
            </div>
          </SectionCard>

          {/* Imputación contable */}
          <SectionCard title="Imputación Contable">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
              <InfoRow label="Empresa" value={company?.name ?? '—'} icon={Building2} />
              <InfoRow label="Centro de Costo" value={costCenter ? `${costCenter.code} — ${costCenter.name}` : '—'} />
              <InfoRow label="Área" value={asset.area || '—'} icon={MapPin} />
              <InfoRow label="Unidad Productiva" value={asset.productiveUnit || '—'} />
            </div>
          </SectionCard>

          {/* Observaciones */}
          {asset.observations && (
            <SectionCard title="Observaciones">
              <p className="text-sm text-slate-700 leading-relaxed">{asset.observations}</p>
            </SectionCard>
          )}
        </div>

        {/* Right col: KPIs financieros */}
        <div className="space-y-4">
          <KpiCard
            label="Valor Patrimonial"
            value={formatCurrencyFull(asset.patrimonialValueUsd, 'USD')}
            description={`Al ${formatDate(asset.valuationDate)}`}
            variant="info"
          />
          <KpiCard
            label="Valor Asegurado"
            value={totalInsuredUsd > 0 ? formatCurrencyFull(totalInsuredUsd, 'USD') : 'Sin cobertura'}
            description={`${policies.filter((p) => p.status === 'vigente').length} pólizas vigentes`}
            variant={totalInsuredUsd > 0 ? 'success' : 'danger'}
          />
          <KpiCard
            label="Diferencia"
            value={diffUsd !== 0 ? formatCurrencyFull(Math.abs(diffUsd), 'USD') : 'Cubierto 100%'}
            description={diffUsd > 0 ? 'Subcobertura' : diffUsd < 0 ? 'Sobrecobertura' : ''}
            variant={diffUsd > 0 ? 'warning' : diffUsd < 0 ? 'default' : 'success'}
          />

          {/* Resumen rápido */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow label="Pólizas asociadas" value={String(policies.length)} />
              <SummaryRow label="Pólizas vigentes" value={String(policies.filter((p) => p.status === 'vigente').length)} />
              <SummaryRow label="Documentos contables" value={String(documents.length)} />
              <SummaryRow label="Matafuegos" value={String(fireExtinguishers.length)} />
              <SummaryRow label="Mat. vencidos" value={String(fireExtinguishers.filter((f) => f.status === 'vencido').length)} color="text-red-600" />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Fotografías */}
      <SectionCard
        title="Fotografías"
        subtitle={
          photos.length > 0
            ? `${photos.length} foto${photos.length !== 1 ? 's' : ''} — hacé clic para ampliar`
            : 'Documentá el estado físico del activo'
        }
        className="mb-5"
      >
        <AssetPhotoGallery
          photos={photos}
          onAdd={newPhotos => setPhotos(prev => [...prev, ...newPhotos].slice(0, 20))}
          onRemove={idx => setPhotos(prev => prev.filter((_, i) => i !== idx))}
        />
      </SectionCard>

      {/* Tabs */}
      <SectionCard noPadding>
        {/* Tab header */}
        <div className="flex border-b border-slate-100 px-5">
          {TABS.map((tab) => {
            const count =
              tab === 'Pólizas' ? policies.length
              : tab === 'Documentos' ? documents.length
              : tab === 'Matafuegos' ? fireExtinguishers.length
              : 0
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 py-3 px-1 mr-5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'Pólizas' && <ShieldCheck size={14} />}
                {tab === 'Documentos' && <FileText size={14} />}
                {tab === 'Matafuegos' && <Flame size={14} />}
                {tab === 'Adjuntos' && <Paperclip size={14} />}
                {tab}
                {count > 0 && (
                  <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'Pólizas' && (
            <DataTable
              columns={policyColumns}
              data={policies}
              rowKey="id"
              onRowClick={(row) => navigate(`/insurance/policies/${row.id}`)}
              emptyTitle="Sin pólizas"
              emptyDescription="Este activo no tiene pólizas asociadas."
            />
          )}
          {activeTab === 'Documentos' && (
            <DataTable
              columns={docColumns}
              data={documents}
              rowKey="id"
              onRowClick={(row) => navigate(`/insurance/documents/${row.id}`)}
              emptyTitle="Sin documentos"
              emptyDescription="No hay documentos contables asociados a este activo."
            />
          )}
          {activeTab === 'Matafuegos' && (
            <DataTable
              columns={feColumns}
              data={fireExtinguishers}
              rowKey="id"
              onRowClick={(row) => navigate(`/fire-extinguishers/${row.id}`)}
              emptyTitle="Sin matafuegos"
              emptyDescription="Este activo no tiene matafuegos asociados."
            />
          )}
          {activeTab === 'Adjuntos' && (
            <div className="p-5">
              <EmptyState
                title="Sin adjuntos"
                description="Los adjuntos se implementarán en la próxima versión con almacenamiento real."
              />
            </div>
          )}
        </div>
      </SectionCard>
    </PageContent>
  )
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800 flex items-center gap-1">
        {Icon && <Icon size={12} className="text-slate-400 flex-shrink-0" />}
        {value}
      </p>
    </div>
  )
}

function SummaryRow({ label, value, color = 'text-slate-800' }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${color}`}>{value}</span>
    </div>
  )
}
