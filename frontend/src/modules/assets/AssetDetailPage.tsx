import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  FileDown, Edit2, ShieldCheck, Flame, Paperclip,
  MapPin, Building2, Download, ShieldAlert, TrendingUp,
  Calendar, ExternalLink, Box, FileText,
} from 'lucide-react'
import { AssetPhotoGallery } from '../../shared/components/photos/AssetPhotoGallery'
import { PageContent } from '../../shared/components/page-header/PageContent'
import { PageHeader } from '../../shared/components/page-header/PageHeader'
import { StatusPill } from '../../shared/components/badges/StatusPill'
import { SectionCard } from '../../shared/components/cards/SectionCard'
import { KpiCard } from '../../shared/components/cards/KpiCard'
import { DataTable } from '../../shared/components/data-table/DataTable'
import { EmptyState } from '../../shared/components/empty-states/EmptyState'
import { formatCurrencyFull, formatCurrencyCompact, formatDate } from '../../shared/utils/format'
import { assetsApi } from '../../shared/api/assets.api'
import { policiesApi } from '../../shared/api/policies.api'
import { fireExtinguishersApi } from '../../shared/api/fire-extinguishers.api'
import { companiesApi } from '../../shared/api/companies.api'
import { costCentersApi } from '../../shared/api/cost-centers.api'
import { claimsApi } from '../../shared/api/claims.api'
import { documentsApi } from '../../shared/api/documents.api'
import { ASSET_STATUS_LABELS } from '../../shared/constants'
import type { Policy, FireExtinguisher, TableColumn, AssetValueEntry, AccountingDocument } from '../../shared/types'
import { AssetAttachmentsTab } from './AssetAttachmentsTab'
import { AssetClaimsTab } from './AssetClaimsTab'

const TABS = ['Pólizas', 'Doc. Contables', 'Matafuegos', 'Siniestros', 'Adjuntos'] as const
type Tab = (typeof TABS)[number]

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('Pólizas')
  const [photos, setPhotos] = useState<string[]>([])
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const { data: asset, isLoading: assetLoading } = useQuery({
    queryKey: ['assets', id],
    queryFn: () => assetsApi.findById(id!),
    enabled: !!id,
  })

  const { data: allPolicies = [] } = useQuery({
    queryKey: ['policies', { assetId: id }],
    queryFn: () => policiesApi.findAll({ assetId: id }),
    enabled: !!id,
  })

  const { data: allFireExtinguishers = [] } = useQuery({
    queryKey: ['fire-extinguishers', { assetId: id }],
    queryFn: () => fireExtinguishersApi.findAll({ assetId: id }),
    enabled: !!id,
  })

  const { data: allClaims = [] } = useQuery({
    queryKey: ['claims', { assetId: id }],
    queryFn: () => claimsApi.findAll({ assetId: id }),
    enabled: !!id,
  })

  const { data: allCompanies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => companiesApi.findAll(),
    enabled: !!asset,
  })

  const { data: allCostCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: () => costCentersApi.findAll(),
    enabled: !!asset,
  })

  const { data: allDocuments = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: () => documentsApi.findAll(),
    enabled: !!asset,
  })

  // Sync photos when asset loads
  useEffect(() => {
    if (asset?.photos) {
      setPhotos(asset.photos)
    }
  }, [asset?.photos])

  useEffect(() => {
    setSelectedPhotoIndex((current) => {
      if (photos.length === 0) return 0
      return Math.min(current, photos.length - 1)
    })
  }, [photos])

  // ── Loading state ─────────────────────────────────────────────────────────────

  if (assetLoading) {
    return (
      <PageContent>
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
          Cargando activo…
        </div>
      </PageContent>
    )
  }

  if (!asset) {
    return (
      <PageContent>
        <EmptyState title="Activo no encontrado" description="El activo solicitado no existe o fue eliminado." />
      </PageContent>
    )
  }

  // ── Derived data ──────────────────────────────────────────────────────────────

  const company = allCompanies.find((c) => c.id === asset.companyId)
  const costCenter = allCostCenters.find((cc) => cc.id === asset.costCenterId)
  const policies = allPolicies
  const fireExtinguishers = allFireExtinguishers
  const claims = allClaims
  const claimsCount = claims.length

  // Documents linked to this asset via its policies
  const assetPolicyIds = new Set(policies.map((p) => p.id))
  const documents = allDocuments.filter((doc) =>
    doc.policyIds.some((pid) => assetPolicyIds.has(pid)),
  )

  // ── Download photo ────────────────────────────────────────────────────────────

  const downloadPhoto = async () => {
    const photoUrl = photos[selectedPhotoIndex]
    if (!photoUrl) return

    try {
      const response = await fetch(photoUrl)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${asset.internalCode ?? 'activo'}-${selectedPhotoIndex + 1}.jpg`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error descargando la imagen:', error)
    }
  }

  // ── Financial KPIs ────────────────────────────────────────────────────────────

  const totalInsuredUsd = policies
    .filter((p) => p.status === 'vigente')
    .reduce((s, p) => s + p.insuredAmountUsd, 0)
  const diffUsd = asset.patrimonialValueUsd - totalInsuredUsd

  // ── Table columns ─────────────────────────────────────────────────────────────

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


  const feColumns: TableColumn<FireExtinguisher>[] = [
    { key: 'code', label: 'Código', className: 'font-mono text-xs text-slate-600' },
    { key: 'type', label: 'Tipo' },
    { key: 'capacity', label: 'Cap.' },
    { key: 'chargeDate', label: 'Carga', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'expirationDate', label: 'Vencimiento', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'status', label: 'Estado', render: (v) => <StatusPill status={v as string} size="sm" /> },
  ]

  const docColumns: TableColumn<AccountingDocument>[] = [
    { key: 'documentNumber', label: 'N° Documento', className: 'font-mono text-xs text-slate-600' },
    { key: 'documentType', label: 'Tipo' },
    { key: 'issueDate', label: 'Fecha', render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'insuranceCompany', label: 'Aseguradora', render: (v) => <span className="text-sm">{(v as string) || '—'}</span> },
    { key: 'totalAmount', label: 'Total', render: (v) => <span className="font-semibold tabular-nums">{formatCurrencyCompact(v as number, 'ARS')}</span>, headerClassName: 'text-right', className: 'text-right' },
    { key: 'paymentStatus', label: 'Estado', render: (v) => <StatusPill status={v as string} size="sm" /> },
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

      {/* Summary bar */}
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

        {/* Left col: Ficha + secciones dinámicas */}
        <div className="lg:col-span-2 space-y-5">

          {/* Ficha patrimonial */}
          <SectionCard title="Ficha Patrimonial">
            <div className="space-y-5">
              {/* Fotos — solo cuando no hay mapa */}
              {!asset.coordinates && (
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
                          <img src={src} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Datos identificatorios */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <InfoRow label="Código interno" value={asset.internalCode} mono />
                <InfoRow label="Tipo" value={asset.assetType} />
                <InfoRow label="Estado" value={ASSET_STATUS_LABELS[asset.status] ?? asset.status} />
                {asset.brand && <InfoRow label="Marca" value={asset.brand} />}
                {asset.model && <InfoRow label="Modelo" value={asset.model} />}
                {asset.year > 0 && <InfoRow label="Año" value={String(asset.year)} />}
                {asset.serialNumber && <InfoRow label="N° de Serie" value={asset.serialNumber} mono />}
                {asset.chassisNumber && <InfoRow label="N° de Chasis" value={asset.chassisNumber} mono />}
                {asset.fixedAssetCode && <InfoRow label="Cód. Bien de Uso" value={asset.fixedAssetCode} mono />}
                <InfoRow label="Fecha Valuación" value={formatDate(asset.valuationDate)} />
              </div>
            </div>
          </SectionCard>

          {/* Silos */}
          {asset.silos && asset.silos.length > 0 && (
            <SectionCard
              title="Silos"
              subtitle={`${asset.silos.length} silo${asset.silos.length !== 1 ? 's' : ''} · ${asset.silos.reduce((s, x) => s + x.capacityTons, 0).toLocaleString('es-AR')} tn totales`}
            >
              <div className="space-y-2">
                {asset.silos.map((silo, idx) => (
                  <div key={silo.id} className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Box size={13} className="text-blue-600" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Silo {idx + 1}</span>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-xs text-slate-400">Capacidad</p>
                        <p className="text-sm font-semibold text-slate-800 tabular-nums">
                          {silo.capacityTons.toLocaleString('es-AR')} tn
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400">Contenido</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {silo.content || <span className="text-slate-400 font-normal">—</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Imputación contable */}
          <SectionCard title="Imputación Contable">
            {asset.allocations && asset.allocations.length > 0 ? (
              <div className="space-y-2">
                {asset.allocations.map((alloc) => {
                  const allocCompany = allCompanies.find((c) => c.id === alloc.companyId)
                  const allocCC = allCostCenters.find((cc) => cc.id === alloc.costCenterId)
                  return (
                    <div key={alloc.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50">
                      <Building2 size={14} className="text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {allocCompany?.name ?? '—'}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {allocCC ? `${allocCC.code} — ${allocCC.name}` : '—'}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-sm font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full tabular-nums">
                        {alloc.percentage}%
                      </span>
                    </div>
                  )
                })}
                <div className="flex items-center justify-end gap-2 px-2 pt-1">
                  <span className="text-xs text-slate-400">Área: {asset.area || '—'}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-xs text-slate-400">UP: {asset.productiveUnit || '—'}</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <InfoRow label="Empresa" value={company?.name ?? '—'} icon={Building2} />
                <InfoRow label="Centro de Costo" value={costCenter ? `${costCenter.code} — ${costCenter.name}` : '—'} />
                <InfoRow label="Área" value={asset.area || '—'} icon={MapPin} />
                <InfoRow label="Unidad Productiva" value={asset.productiveUnit || '—'} />
              </div>
            )}
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
              <SummaryRow label="Doc. Contables" value={String(documents.length)} />
              <SummaryRow label="Matafuegos" value={String(fireExtinguishers.length)} />
              <SummaryRow label="Mat. vencidos" value={String(fireExtinguishers.filter((f) => f.status === 'vencido').length)} color="text-red-600" />
              <SummaryRow label="Siniestros" value={String(claimsCount)} color={claimsCount > 0 ? 'text-orange-600' : 'text-slate-800'} />
            </div>
          </SectionCard>

          {/* Historial de valuaciones */}
          {asset.valueHistory && asset.valueHistory.length > 0 && (
            <SectionCard title="Historial de valuaciones">
              <div className="divide-y divide-slate-100">
                {[...asset.valueHistory].reverse().map((entry: AssetValueEntry, idx) => {
                  const isLatest = idx === 0
                  return (
                    <div key={entry.id} className={`flex items-center justify-between gap-3 py-2.5 ${isLatest ? 'first:pt-0' : ''}`}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isLatest ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                          <Calendar size={11} className={isLatest ? 'text-emerald-600' : 'text-slate-400'} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-slate-600">{formatDate(entry.date)}</p>
                          {entry.notes && <p className="text-[10px] text-slate-400 truncate">{entry.notes}</p>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-semibold font-mono tabular-nums ${isLatest ? 'text-emerald-700' : 'text-slate-600'}`}>
                          {formatCurrencyCompact(entry.valueUsd, 'USD')}
                        </p>
                        {isLatest && (
                          <p className="text-[9px] font-semibold uppercase tracking-wide text-emerald-600">Actual</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-400">
                <TrendingUp size={12} />
                {asset.valueHistory.length} entrada{asset.valueHistory.length !== 1 ? 's' : ''} registrada{asset.valueHistory.length !== 1 ? 's' : ''}
              </div>
            </SectionCard>
          )}

          {asset.coordinates ? (
            <SectionCard
              title="Ubicación"
              subtitle={`${asset.coordinates.lat.toFixed(5)}, ${asset.coordinates.lng.toFixed(5)}`}
            >
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                  <iframe
                    title="Mapa de ubicación del activo"
                    loading="lazy"
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${asset.coordinates.lng - 0.012},${asset.coordinates.lat - 0.012},${asset.coordinates.lng + 0.012},${asset.coordinates.lat + 0.012}&layer=mapnik&marker=${asset.coordinates.lat},${asset.coordinates.lng}`}
                    className="border-0 w-full"
                    style={{ height: 320 }}
                  />
                </div>
                {asset.mapsUrl && (
                  <a
                    href={asset.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                  >
                    <ExternalLink size={12} />
                    Ver en Google Maps
                  </a>
                )}
              </div>
            </SectionCard>
          ) : (
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
          )}
        </div>
      </div>

      {/* Tabs */}
      <SectionCard noPadding>
        {/* Tab header */}
        <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-100 overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const count =
              tab === 'Pólizas' ? policies.length
              : tab === 'Doc. Contables' ? documents.length
              : tab === 'Matafuegos' ? fireExtinguishers.length
              : tab === 'Siniestros' ? claimsCount
              : tab === 'Adjuntos' ? (asset.attachmentsCount ?? 0)
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
                {tab === 'Doc. Contables' && <FileText size={13} />}
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
          {activeTab === 'Doc. Contables' && (
            <DataTable
              columns={docColumns}
              data={documents}
              rowKey="id"
              onRowClick={(row) => navigate(`/insurance/documents/${row.id}`)}
              emptyTitle="Sin documentos contables"
              emptyDescription="Este activo no tiene documentos contables asociados a través de sus pólizas."
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
            <AssetClaimsTab assetId={asset.id} policies={policies} claims={claims} />
          )}
          {activeTab === 'Adjuntos' && (
            <AssetAttachmentsTab assetId={asset.id} />
          )}
        </div>
      </SectionCard>
    </PageContent>
  )
}

function InfoRow({ label, value, icon: Icon, mono }: {
  label: string
  value: string
  icon?: React.ElementType
  mono?: boolean
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{label}</p>
      <p className={`text-sm font-medium text-slate-800 leading-snug break-words max-w-full ${mono ? 'font-mono' : ''}`}>
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
