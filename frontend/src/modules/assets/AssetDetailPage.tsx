import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FileDown, Edit2, ShieldCheck, Flame, Paperclip,
  MapPin, Building2, Download, ShieldAlert, TrendingUp,
  Calendar, ExternalLink, Box, FileText, Plus, Link2,
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
import { assetsApi, assetKeys, assetQueries } from '../../shared/api/assets.api'
import { policyQueries } from '../../shared/api/policies.api'
import { fireExtinguisherQueries } from '../../shared/api/fire-extinguishers.api'
import { companyQueries } from '../../shared/api/companies.api'
import { costCenterQueries } from '../../shared/api/cost-centers.api'
import { claimQueries } from '../../shared/api/claims.api'
import { documentQueries } from '../../shared/api/documents.api'
import { ASSET_STATUS_LABELS, DOCUMENT_TYPE_LABELS, POLICY_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../../shared/constants'
import type { Policy, FireExtinguisher, TableColumn, AssetValueEntry, AccountingDocument } from '../../shared/types'
import { AssetAttachmentsTab } from './AssetAttachmentsTab'
import { AssetClaimsTab } from './AssetClaimsTab'
import { AssociateFireExtinguisherModal } from './AssociateFireExtinguisherModal'

const TABS = ['Pólizas', 'Doc. Contables', 'Matafuegos', 'Siniestros', 'Valuaciones', 'Adjuntos'] as const
type Tab = (typeof TABS)[number]

// Orden por severidad al ordenar la columna "Estado" de cada sub-tabla —
// alfabético mezclaría estados vigentes con vencidos sin ningún criterio útil.
// Mismo orden que ya definen los labels canónicos de cada dominio.
const POLICY_STATUS_SORT_ORDER: Record<string, number> = Object.fromEntries(
  Object.keys(POLICY_STATUS_LABELS).map((key, idx) => [key, idx]),
)
const FE_STATUS_SORT_ORDER: Record<string, number> = { vigente: 0, proximo_vencer: 1, vencido: 2, sin_fecha: 3 }
const PAYMENT_STATUS_SORT_ORDER: Record<string, number> = Object.fromEntries(
  Object.keys(PAYMENT_STATUS_LABELS).map((key, idx) => [key, idx]),
)

function ValuacionesEntryList({ entries, accent }: { entries: AssetValueEntry[]; accent: 'blue' | 'purple' }) {
  if (entries.length === 0) {
    return (
      <div className="py-6 text-center text-xs text-slate-400 border-2 border-dashed border-slate-100 rounded-lg">
        Sin registros
      </div>
    )
  }
  return (
    <div className="divide-y divide-slate-100 rounded-lg border border-slate-200 overflow-hidden">
      {entries.map((entry, idx) => {
        const isLatest = idx === 0
        const colors = accent === 'purple'
          ? { ring: 'bg-purple-100', icon: 'text-purple-500', value: 'text-purple-700', badge: 'text-purple-600' }
          : { ring: 'bg-brand-100', icon: 'text-brand-500', value: 'text-brand-700', badge: 'text-brand-600' }
        return (
          <div key={entry.id} className={`flex items-center justify-between gap-3 px-3 py-2.5 ${isLatest ? 'bg-slate-50' : 'bg-white'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isLatest ? colors.ring : 'bg-slate-100'}`}>
                <Calendar size={11} className={isLatest ? colors.icon : 'text-slate-400'} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-700">{formatDate(entry.date)}</p>
                {entry.notes && <p className="text-[10px] text-slate-400 truncate">{entry.notes}</p>}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`text-xs font-semibold font-mono tabular-nums ${isLatest ? colors.value : 'text-slate-600'}`}>
                {formatCurrencyCompact(entry.valueUsd, 'USD')}
              </p>
              {isLatest && <p className={`text-[9px] font-bold uppercase tracking-wide ${colors.badge}`}>Actual</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ValuacionesTab({ history }: { history: AssetValueEntry[] }) {
  const byDate = (a: AssetValueEntry, b: AssetValueEntry) => b.date.localeCompare(a.date)
  const realEntries = [...history].filter((e) => e.type === 'real').sort(byDate)
  const nuevoEntries = [...history].filter((e) => e.type === 'nuevo').sort(byDate)
  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-2">Valor Patrimonial Real</p>
          <ValuacionesEntryList entries={realEntries} accent="blue" />
        </div>
        <div>
          <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Valor Patrimonial a Nuevo</p>
          <ValuacionesEntryList entries={nuevoEntries} accent="purple" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
        <TrendingUp size={12} />
        {history.length} entrada{history.length !== 1 ? 's' : ''} registrada{history.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('Pólizas')
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0)
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [showAssociateModal, setShowAssociateModal] = useState(false)
  const queryClient = useQueryClient()
  const attachmentsKey = assetKeys.attachments(id!)

  // ── Data fetching ─────────────────────────────────────────────────────────────

  const { data: asset, isLoading: assetLoading } = useQuery(assetQueries.detail(id!))

  const { data: allPolicies = [] } = useQuery({
    ...policyQueries.list({ assetId: id }),
    enabled: !!id,
  })

  const { data: allFireExtinguishers = [] } = useQuery({
    ...fireExtinguisherQueries.list({ assetId: id }),
    enabled: !!id,
  })

  const { data: allClaims = [] } = useQuery({
    ...claimQueries.list({ assetId: id }),
    enabled: !!id,
  })

  const { data: allCompanies = [] } = useQuery({
    ...companyQueries.list(),
    enabled: !!asset,
  })

  const { data: allCostCenters = [] } = useQuery({
    ...costCenterQueries.list(),
    enabled: !!asset,
  })

  const { data: allDocuments = [] } = useQuery({
    ...documentQueries.list(),
    enabled: !!asset,
  })

  const { data: statusHistory = [] } = useQuery(assetQueries.statusHistory(id!))

  const { data: allAttachments = [] } = useQuery(assetQueries.attachments(id!))

  // Historial de estado: usa el real o genera uno sintético para activos pre-feature
  // Debe estar ANTES de cualquier return condicional (Rules of Hooks)
  const displayHistory = useMemo(() => {
    if (!asset) return []
    if (statusHistory.length > 0) return statusHistory
    const entries: typeof statusHistory = [{
      id: 'synthetic-alta',
      assetId: asset.id,
      status: 'activo',
      date: asset.createdAt.slice(0, 10),
      note: 'Alta del activo',
      createdAt: asset.createdAt,
    }]
    if (asset.status === 'baja' && asset.dischargeDate) {
      entries.push({ id: 'synthetic-baja', assetId: asset.id, status: 'baja', date: asset.dischargeDate, note: 'Activo dado de baja', createdAt: asset.dischargeDate })
    }
    if (asset.status === 'vendido' && asset.saleDate) {
      entries.push({ id: 'synthetic-vendido', assetId: asset.id, status: 'vendido', date: asset.saleDate, note: 'Activo vendido', createdAt: asset.saleDate })
    }
    return entries
  }, [statusHistory, asset])

  // Fotos persistidas en Cloudinary vía AssetAttachment (fileType === 'image')
  const photoAttachments = useMemo(
    () => allAttachments.filter(a => a.fileType === 'image'),
    [allAttachments],
  )
  // El resto de los adjuntos (PDF, Excel, etc.) — separado de las fotos para
  // que el tab "Adjuntos" no las duplique ni las cuente dos veces. Se deriva
  // de la misma query en vivo que usa AssetAttachmentsTab (mismo query key),
  // en vez de asset.attachmentsCount, que queda desactualizado porque las
  // mutations de adjuntos/fotos no invalidan la query del Asset.
  const docAttachments = useMemo(
    () => allAttachments.filter(a => a.fileType !== 'image'),
    [allAttachments],
  )
  const photos = useMemo(
    () => [...photoAttachments.map(a => a.fileUrl).filter((u): u is string => !!u), ...pendingPreviews],
    [photoAttachments, pendingPreviews],
  )

  useEffect(() => {
    setSelectedPhotoIndex(current => {
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

  // ── Photo handlers (Cloudinary via AssetAttachment) ──────────────────────────

  const handleAddPhotos = async (files: File[], previews: string[]) => {
    setPendingPreviews(prev => [...prev, ...previews])
    setUploadingPhotos(true)
    try {
      await Promise.all(files.map(file => assetsApi.addAttachment(id!, { file })))
      await queryClient.invalidateQueries({ queryKey: attachmentsKey })
    } catch {
      console.error('Error subiendo fotos al activo')
    } finally {
      setPendingPreviews([])
      setUploadingPhotos(false)
    }
  }

  const handleRemovePhoto = async (idx: number) => {
    if (idx < photoAttachments.length) {
      await assetsApi.deleteAttachment(id!, photoAttachments[idx].id)
      await queryClient.invalidateQueries({ queryKey: attachmentsKey })
    } else {
      const pendingIdx = idx - photoAttachments.length
      setPendingPreviews(prev => prev.filter((_, i) => i !== pendingIdx))
    }
  }

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

  const latestReal = asset.valueHistory?.find((e) => e.type === 'real')
  const latestNuevo = asset.valueHistory?.find((e) => e.type === 'nuevo')
  const displayReal = latestReal?.valueUsd ?? asset.patrimonialValueUsd
  const displayRealDate = latestReal?.date ?? asset.valuationDate
  const displayNuevo = latestNuevo?.valueUsd ?? asset.patrimonialValueNew
  const displayNuevoDate = latestNuevo?.date ?? asset.valuationDate

  const vigentePolicies = policies.filter((p) => p.status === 'vigente' || p.status === 'proximo_vencer')
  const totalInsuredUsd = vigentePolicies.reduce((s, p) => s + p.insuredAmountUsd, 0)
  // Solo cuenta como ARS puro si la póliza no tiene conversión (exchangeRate = 1)
  const totalInsuredArs = vigentePolicies.reduce((s, p) => p.exchangeRate > 1 ? s : s + p.insuredAmountArs, 0)
  const hasUsdCoverage = totalInsuredUsd > 0
  const hasArsCoverage = totalInsuredArs > 0
  const mixedCurrencies = hasUsdCoverage && hasArsCoverage
  const diffBase = displayNuevo ?? displayReal
  const diffUsd = hasUsdCoverage && diffBase != null ? diffBase - totalInsuredUsd : null

  // ── Table columns ─────────────────────────────────────────────────────────────

  const policyColumns: TableColumn<Policy>[] = [
    { key: 'policyNumber', label: 'N° Póliza', className: 'font-mono text-slate-600 text-xs', sortable: true },
    { key: 'insuranceCompany', label: 'Aseguradora', sortable: true },
    { key: 'insuranceType', label: 'Tipo', sortable: true },
    { key: 'coverageType', label: 'Cobertura', sortable: true, render: (v) => <span className="text-xs text-slate-500">{String(v)}</span> },
    { key: 'startDate', label: 'Inicio', sortable: true, render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'endDate', label: 'Vence', sortable: true, render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'insuredAmountArs', label: 'Suma Aseg.', sortable: true, render: (v) => <span className="font-semibold">{formatCurrencyCompact(v as number, 'ARS')}</span>, headerClassName: 'text-right', className: 'text-right' },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      sortValue: (row) => POLICY_STATUS_SORT_ORDER[row.status] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]


  const feColumns: TableColumn<FireExtinguisher>[] = [
    { key: 'code', label: 'Código', className: 'font-mono text-xs text-slate-600', sortable: true },
    { key: 'type', label: 'Tipo', sortable: true },
    { key: 'capacity', label: 'Cap.', sortable: true },
    { key: 'chargeDate', label: 'Carga', sortable: true, render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'expirationDate', label: 'Vencimiento', sortable: true, render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    {
      key: 'status',
      label: 'Estado',
      sortable: true,
      sortValue: (row) => FE_STATUS_SORT_ORDER[row.status] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
  ]

  const docColumns: TableColumn<AccountingDocument>[] = [
    { key: 'documentNumber', label: 'N° Documento', className: 'font-mono text-xs text-slate-600', sortable: true },
    { key: 'documentType', label: 'Tipo', sortable: true, render: (v) => <span className="text-xs">{DOCUMENT_TYPE_LABELS[v as string] ?? String(v)}</span> },
    { key: 'issueDate', label: 'Fecha', sortable: true, render: (v) => <span className="text-xs">{formatDate(v as string)}</span> },
    { key: 'insuranceCompany', label: 'Aseguradora', sortable: true, render: (v) => <span className="text-sm">{(v as string) || '—'}</span> },
    { key: 'totalAmount', label: 'Total', sortable: true, render: (v) => <span className="font-semibold tabular-nums">{formatCurrencyCompact(v as number, 'ARS')}</span>, headerClassName: 'text-right', className: 'text-right' },
    {
      key: 'paymentStatus',
      label: 'Estado',
      sortable: true,
      sortValue: (row) => PAYMENT_STATUS_SORT_ORDER[row.paymentStatus] ?? 99,
      render: (v) => <StatusPill status={v as string} size="sm" />,
    },
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
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
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
            <p className="text-xs text-slate-500 mb-1">Valor Patrimonial Real</p>
            <p className="text-sm font-semibold text-slate-800 tabular-nums">
              {asset.patrimonialValueUsd != null ? formatCurrencyFull(asset.patrimonialValueUsd, 'USD') : <span className="text-slate-400 font-normal">Sin valuar</span>}
            </p>
          </div>
          {asset.patrimonialValueNew != null && (
            <div className="flex-1 min-w-0 px-5 py-4">
              <p className="text-xs text-slate-500 mb-1">Valor Patrimonial a Nuevo</p>
              <p className="text-sm font-semibold text-slate-800 tabular-nums">{formatCurrencyFull(asset.patrimonialValueNew, 'USD')}</p>
            </div>
          )}
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
              {/* Imagen principal */}
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
                            ? 'border-brand-600 shadow-md'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <img src={src} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                {asset.plate && <InfoRow label="Patente" value={asset.plate} mono />}
                {asset.engineNumber && <InfoRow label="N° de Motor" value={asset.engineNumber} mono />}
                {asset.fixedAsset && <InfoRow label="Bien de Uso" value={`${asset.fixedAsset.code} — ${asset.fixedAsset.name}`} mono />}
                <InfoRow label="Fecha Valuación" value={formatDate(asset.valuationDate)} />
                <InfoRow label="Fecha de Alta" value={formatDate(asset.createdAt)} />
                {asset.dischargeDate && <InfoRow label="Fecha de Baja" value={formatDate(asset.dischargeDate)} />}
                {asset.saleDate && <InfoRow label="Fecha de Venta" value={formatDate(asset.saleDate)} />}
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
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0">
                        <Box size={13} className="text-brand-600" />
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

          {/* Edificios y construcciones */}
          {asset.buildings && asset.buildings.length > 0 && (
            <SectionCard
              title="Edificios y Construcciones"
              subtitle={(() => {
                const totalM2 = asset.buildings!.reduce((s, b) => s + (b.surfaceM2 ?? 0), 0)
                const count = `${asset.buildings!.length} construcción${asset.buildings!.length !== 1 ? 'es' : ''} registrada${asset.buildings!.length !== 1 ? 's' : ''}`
                return totalM2 > 0 ? `${count} · ${totalM2.toLocaleString('es-AR')} m² totales` : count
              })()}
            >
              <div className="space-y-3">
                {asset.buildings.map((building, idx) => (
                  <div key={building.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Building2 size={13} className="text-purple-600" />
                      </div>
                      <span className="text-sm font-semibold text-slate-800">{building.name || `Edificio ${idx + 1}`}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {building.surfaceM2 != null && (
                        <div>
                          <p className="text-xs text-slate-400">Superficie</p>
                          <p className="text-sm font-semibold text-slate-800 tabular-nums">{building.surfaceM2.toLocaleString('es-AR')} m²</p>
                        </div>
                      )}
                      {building.purpose && (
                        <div>
                          <p className="text-xs text-slate-400">Uso / Destino</p>
                          <p className="text-sm font-semibold text-slate-800">{building.purpose}</p>
                        </div>
                      )}
                      {building.constructionType && (
                        <div>
                          <p className="text-xs text-slate-400">Tipo de estructura</p>
                          <p className="text-sm font-semibold text-slate-800">{building.constructionType}</p>
                        </div>
                      )}
                      {building.constructionYear != null && (
                        <div>
                          <p className="text-xs text-slate-400">Año construcción</p>
                          <p className="text-sm font-semibold text-slate-800 tabular-nums">{building.constructionYear}</p>
                        </div>
                      )}
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
                      <span className="flex-shrink-0 text-sm font-semibold text-brand-700 bg-brand-50 border border-brand-200 px-2.5 py-0.5 rounded-full tabular-nums">
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

          {/* Historial de Estado */}
          <SectionCard title="Historial de Estado">
            <div className="space-y-0">
              {displayHistory.map((entry, idx) => {
                const isLast = idx === displayHistory.length - 1
                const cfg = ({
                  activo:  { label: 'Alta',  color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
                  baja:    { label: 'Baja',  color: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50' },
                  vendido: { label: 'Venta', color: 'bg-brand-500',    text: 'text-brand-700',    bg: 'bg-brand-50' },
                } as Record<string, { label: string; color: string; text: string; bg: string }>)[entry.status]
                  ?? { label: entry.status, color: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50' }
                return (
                  <div key={entry.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.color}`} />
                      {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
                    </div>
                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        <span className="text-xs text-slate-500">{formatDate(entry.date)}</span>
                      </div>
                      {entry.note && <p className="text-xs text-slate-400">{entry.note}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        </div>

        {/* Right col: KPIs financieros */}
        <div className="space-y-4">
          <KpiCard
            label="Valor Patrimonial Real"
            value={displayReal != null ? formatCurrencyFull(displayReal, 'USD') : 'Sin valuar'}
            description={displayReal != null ? `Al ${formatDate(displayRealDate)}` : 'Todavía no se cargó un valor'}
            variant="info"
          />
          {displayNuevo != null && (
            <KpiCard
              label="Valor Patrimonial a Nuevo"
              value={formatCurrencyFull(displayNuevo, 'USD')}
              description={`Al ${formatDate(displayNuevoDate)}`}
              variant="default"
            />
          )}
          <KpiCard
            label="Valor Asegurado"
            value={
              !hasUsdCoverage && !hasArsCoverage ? 'Sin cobertura'
              : mixedCurrencies ? `${formatCurrencyFull(totalInsuredUsd, 'USD')} + ${formatCurrencyFull(totalInsuredArs, 'ARS')}`
              : hasUsdCoverage ? formatCurrencyFull(totalInsuredUsd, 'USD')
              : formatCurrencyFull(totalInsuredArs, 'ARS')
            }
            description={`${vigentePolicies.length} póliza${vigentePolicies.length !== 1 ? 's' : ''} vigente${vigentePolicies.length !== 1 ? 's' : ''}${hasArsCoverage && !hasUsdCoverage ? ' · Cobertura en ARS' : ''}`}
            variant={hasUsdCoverage || hasArsCoverage ? 'success' : 'danger'}
          />
          <KpiCard
            label="Diferencia"
            value={
              diffUsd === null ? '—'
              : diffUsd === 0 ? 'Cubierto 100%'
              : formatCurrencyFull(Math.abs(diffUsd), 'USD')
            }
            description={
              diffUsd === null ? 'Cobertura en ARS · no comparable en USD'
              : diffUsd > 0 ? 'Subcobertura'
              : diffUsd < 0 ? 'Sobrecobertura'
              : ''
            }
            variant={diffUsd === null ? 'default' : diffUsd > 0 ? 'danger' : 'success'}
          />

          {/* Resumen rápido */}
          <SectionCard title="Resumen">
            <div className="space-y-3">
              <SummaryRow label="Pólizas asociadas" value={String(policies.length)} />
              <SummaryRow label="Pólizas vigentes" value={String(policies.filter((p) => p.status === 'vigente' || p.status === 'proximo_vencer').length)} />
              <SummaryRow label="Doc. Contables" value={String(documents.length)} />
              <SummaryRow label="Matafuegos" value={String(fireExtinguishers.length)} />
              <SummaryRow label="Mat. vencidos" value={String(fireExtinguishers.filter((f) => f.status === 'vencido').length)} color="text-red-600" />
              <SummaryRow label="Siniestros" value={String(claimsCount)} color={claimsCount > 0 ? 'text-orange-600' : 'text-slate-800'} />
            </div>
          </SectionCard>


          {asset.coordinates && (
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
                    style={{ height: 260 }}
                  />
                </div>
                {asset.mapsUrl && (
                  <a
                    href={asset.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
                  >
                    <ExternalLink size={12} />
                    Ver en Google Maps
                  </a>
                )}
              </div>
            </SectionCard>
          )}

          <SectionCard
            title="Fotografías"
            subtitle={
              photos.length > 0
                ? `${photos.length} foto${photos.length !== 1 ? 's' : ''} — hacé clic para ampliar`
                : 'Documentá el estado físico del activo'
            }
            className="min-h-[360px]"
          >
            <div className="h-full">
              <AssetPhotoGallery
                photos={photos}
                onAdd={handleAddPhotos}
                onRemove={handleRemovePhoto}
                uploading={uploadingPhotos}
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
              : tab === 'Doc. Contables' ? documents.length
              : tab === 'Matafuegos' ? fireExtinguishers.length
              : tab === 'Siniestros' ? claimsCount
              : tab === 'Valuaciones' ? (asset.valueHistory?.length ?? 0)
              : tab === 'Adjuntos' ? docAttachments.length
              : 0
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tab === 'Pólizas' && <ShieldCheck size={13} />}
                {tab === 'Doc. Contables' && <FileText size={13} />}
                {tab === 'Matafuegos' && <Flame size={13} />}
                {tab === 'Siniestros' && <ShieldAlert size={13} />}
                {tab === 'Valuaciones' && <TrendingUp size={13} />}
                {tab === 'Adjuntos' && <Paperclip size={13} />}
                {tab}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    isActive ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-600'
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
            <div>
              <div className="flex items-center justify-end gap-2 px-4 py-3 border-b border-slate-100">
                <button
                  onClick={() => setShowAssociateModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                >
                  <Link2 size={13} />
                  Asociar existente
                </button>
                <button
                  onClick={() => navigate(`/fire-extinguishers/new?assetId=${asset.id}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-colors"
                >
                  <Plus size={13} />
                  Nuevo matafuego
                </button>
              </div>
              <DataTable
                columns={feColumns}
                data={fireExtinguishers}
                rowKey="id"
                onRowClick={(row) => navigate(`/fire-extinguishers/${row.id}`)}
                emptyTitle="Sin matafuegos"
                emptyDescription="Este activo no tiene matafuegos asociados."
              />
            </div>
          )}
          {activeTab === 'Siniestros' && (
            <AssetClaimsTab assetId={asset.id} policies={policies} claims={claims} />
          )}
          {activeTab === 'Valuaciones' && (
            <ValuacionesTab history={asset.valueHistory ?? []} />
          )}
          {activeTab === 'Adjuntos' && (
            <AssetAttachmentsTab assetId={asset.id} />
          )}
        </div>
      </SectionCard>

      {showAssociateModal && (
        <AssociateFireExtinguisherModal
          assetId={asset.id}
          assetName={asset.name}
          onClose={() => setShowAssociateModal(false)}
        />
      )}
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
