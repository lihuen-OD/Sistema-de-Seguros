import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  FileDown, Edit2, ShieldCheck, FileText, Flame, Paperclip,
  MapPin, Building2, Download, ShieldAlert,
} from 'lucide-react'
import { AssetPhotoGallery } from '../../shared/components/photos/AssetPhotoGallery'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
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
import { assetAttachmentRepository } from '../../services/repositories/asset-attachment.repository'
import { mockCompanies } from '../../data/mock-companies'
import { mockCostCenters } from '../../data/mock-cost-centers'
import { ASSET_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '../../shared/constants'
import type { Policy, AccountingDocument, FireExtinguisher, TableColumn } from '../../shared/types'
import { AssetAttachmentsTab } from './AssetAttachmentsTab'
import { AssetClaimsTab } from './AssetClaimsTab'
import { claimRepository } from '../../services/repositories/claim.repository'

const TABS = ['Pólizas', 'Documentos', 'Matafuegos', 'Siniestros', 'Adjuntos'] as const
type Tab = (typeof TABS)[number]

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('Pólizas')
  // Lazy initializer reads asset photos once on mount
  const [photos, setPhotos] = useState<string[]>(() => assetRepository.findById(id!)?.photos ?? [])
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  const asset = assetRepository.findById(id!)

  const downloadPhoto = async () => {
    const photoUrl = photos[selectedPhotoIndex]
    if (!photoUrl) return

    try {
      const response = await fetch(photoUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${asset?.internalCode ?? 'activo'}-${selectedPhotoIndex + 1}.jpg`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error descargando la imagen:', error)
    }
  }

  useEffect(() => {
    setSelectedPhotoIndex((current) => {
      if (photos.length === 0) return 0
      return Math.min(current, photos.length - 1)
    })
  }, [photos])

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
  const attachmentsCount = assetAttachmentRepository.findByAsset(asset.id).length
  const claimsCount = claimRepository.findByAsset(asset.id).length

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

  const assetSubtitle = [
    asset.internalCode,
    asset.assetType,
    asset.year > 0 ? String(asset.year) : null,
    asset.brand ? `${asset.brand}${asset.model ? ` ${asset.model}` : ''}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <PageContent>
      <PageHeader
        title={asset.name}
        subtitle={assetSubtitle}
        category="Activo"
        backTo="/assets"
        backLabel="Volver al inventario"
        badge={<StatusPill status={asset.status} />}
        actions={
          <>
            <button
              onClick={() => navigate(`/assets/${asset.id}/ficha`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <FileDown size={15} />
              Ficha PDF
            </button>
            <button
              onClick={() => navigate(`/assets/${asset.id}/edit`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Edit2 size={15} />
              Editar
            </button>
          </>
        }
      />

      {/* Summary bar — datos clave del activo en una fila horizontal */}
      <div className="card mb-5 overflow-hidden">
        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="flex-1 min-w-0 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Tipo</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{asset.assetType}</p>
          </div>
          <div className="flex-1 min-w-0 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Empresa</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{company?.name ?? '—'}</p>
          </div>
          <div className="flex-1 min-w-0 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Centro de Costo</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{costCenter ? `${costCenter.code} — ${costCenter.name}` : '—'}</p>
          </div>
          <div className="flex-1 min-w-0 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Valor Patrimonial</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatCurrencyFull(asset.patrimonialValueUsd, 'USD')}</p>
          </div>
          <div className="flex-1 min-w-0 px-5 py-4">
            <p className="text-xs text-slate-500 mb-1">Fecha Valuación</p>
            <p className="text-sm font-semibold text-slate-800">{formatDate(asset.valuationDate)}</p>
          </div>
        </div>
      </div>

      {/* Main content: 2 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* Left col: Ficha + Imputación */}
        <div className="lg:col-span-2 space-y-5">
          {/* Ficha patrimonial */}
          <SectionCard title="Ficha Patrimonial">
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-950">
                  {photos[selectedPhotoIndex] ? (
                    <img
                      src={photos[selectedPhotoIndex]}
                      alt={`Foto principal del activo ${asset.internalCode}`}
                      className="w-full h-[300px] object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-[300px] flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
                      Sin imagen disponible
                    </div>
                  )}

                  {photos[selectedPhotoIndex] && (
                    <button
                      type="button"
                      onClick={downloadPhoto}
                      className="absolute top-4 right-4 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                    >
                      <Download size={14} />
                      Descargar
                    </button>
                  )}
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-4 gap-3">
                    {photos.slice(0, 5).map((src, idx) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setSelectedPhotoIndex(idx)}
                        className={`h-20 rounded-lg overflow-hidden border transition-shadow ${
                          idx === selectedPhotoIndex
                            ? 'border-blue-600 shadow-md'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <img
                          src={src}
                          alt={`Miniatura ${idx + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <SummaryRow label="Siniestros" value={String(claimsCount)} color={claimsCount > 0 ? 'text-orange-600' : 'text-slate-800'} />
            </div>
          </SectionCard>

          <SectionCard
            title="Fotografías"
            subtitle={
              photos.length > 0
                ? `${photos.length} foto${photos.length !== 1 ? 's' : ''} — hacé clic para ampliar`
                : 'Documentá el estado físico del activo'
            }
            className="min-h-[420px]"
          >
            <div className="h-full">
              <AssetPhotoGallery
                photos={photos}
                onAdd={newPhotos => setPhotos(prev => [...prev, ...newPhotos].slice(0, 20))}
                onRemove={idx => setPhotos(prev => prev.filter((_, i) => i !== idx))}
              />
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Tabs */}
      <SectionCard noPadding>
        {/* Tab header */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-100 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const count =
              tab === 'Pólizas' ? policies.length
              : tab === 'Documentos' ? documents.length
              : tab === 'Matafuegos' ? fireExtinguishers.length
              : tab === 'Siniestros' ? claimsCount
              : tab === 'Adjuntos' ? attachmentsCount
              : 0
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tab === 'Pólizas' && <ShieldCheck size={13} />}
                {tab === 'Documentos' && <FileText size={13} />}
                {tab === 'Matafuegos' && <Flame size={13} />}
                {tab === 'Siniestros' && <ShieldAlert size={13} />}
                {tab === 'Adjuntos' && <Paperclip size={13} />}
                {tab}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
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
          {activeTab === 'Siniestros' && (
            <AssetClaimsTab assetId={asset.id} policies={policies} />
          )}
          {activeTab === 'Adjuntos' && (
            <AssetAttachmentsTab assetId={asset.id} />
          )}
        </div>
      </SectionCard>
    </PageContent>
  )
}

function InfoRow({ label, value, icon: Icon }: { label: string; value: string; icon?: React.ElementType }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>
      <p className="text-sm font-medium text-slate-800 leading-snug break-words max-w-full">
        {Icon && <Icon size={13} className="text-slate-400 inline-block mr-1.5 align-text-bottom" />}
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
